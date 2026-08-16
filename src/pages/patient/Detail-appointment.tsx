import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Stethoscope,
  User,
  CalendarDays,
  Clock,
  MapPin,
  CalendarClock,
  Trash2,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import api from "@/api/axios";

function generateDateRange(days: number) {
  const out: Date[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------- Types (matches AppointmentController@show response) ----------------
interface Service {
  id: number;
  name: string;
  price: number;
  duration: number;
}

interface Dentist {
  id: number;
  full_name: string;
  specialty: string;
}

interface Appointment {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  date: string; // e.g. "2026-08-06" or already formatted, depending on cast
  time: string;
  reason: string | null;
  status: "pending" | "confirmed" | "cancelled";
  service: Service;
  dentist: Dentist;
}

// ---------------- Appointment cache ----------------
// Keyed by id (module-level Map) so it survives unmount/remount when
// navigating away from and back to a specific appointment's detail page
// within the same session. Deliberately does NOT cover date-summary or
// slot-availability data below — that has to reflect real booking state at
// the moment the user is picking a new time, so it's always fetched fresh.
const CACHE_TTL_MS = 60_000; // 1 minute

interface AppointmentCacheEntry {
  data: Appointment;
  timestamp: number;
}

const appointmentCache = new Map<string, AppointmentCacheEntry>();

function isCacheFresh(entry: AppointmentCacheEntry | undefined) {
  return !!entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLastUpdated(ts: number | null) {
  if (!ts) return null;
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  const styles: Record<Appointment["status"], string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      {label}
    </span>
  );
}

function InfoRow({
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ElementType;
  label: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium">{primary}</span>
        {secondary && (
          <span className="text-sm text-muted-foreground">{secondary}</span>
        )}
      </div>
    </div>
  );
}

export default function AppointmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Reschedule dialog state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);

  // Slots for the currently selected new date, as returned by the backend
  // (already filtered to the admin's configured working hours for that day).
  // Always fetched live — never cached — since it reflects real-time
  // booking availability.
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [dayClosed, setDayClosed] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Dates in the 14-day picker that are fully booked OR closed by the admin.
  // Also always fetched live for the same reason.
  const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(
    new Set(),
  );
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [loadingDateSummary, setLoadingDateSummary] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const dateOptions = generateDateRange(14);

  useEffect(() => {
    fetchAppointment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (rescheduleOpen && appointment) {
      fetchDateSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleOpen, appointment]);

  useEffect(() => {
    if (rescheduleOpen && appointment && newDate) {
      fetchAvailableSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleOpen, appointment, newDate]);

  const fetchAppointment = async (opts?: { force?: boolean }) => {
    if (!id) return;
    const force = opts?.force ?? false;
    setError(null);

    const cached = appointmentCache.get(id);

    // Fresh cache and no forced refresh: skip the network call entirely.
    if (!force && isCacheFresh(cached)) {
      setAppointment(cached!.data);
      setLastUpdated(cached!.timestamp);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate: show whatever we have for this id while
    // refetching quietly in the background.
    if (cached) {
      setAppointment(cached.data);
      setLastUpdated(cached.timestamp);
      setRefreshing(true);
      setLoading(false);
    } else {
      setAppointment(null);
      setLoading(true);
    }

    try {
      const res = await api.get(`/appointments/${id}`);
      const data: Appointment = res.data.appointment ?? res.data;
      const timestamp = Date.now();
      appointmentCache.set(id, { data, timestamp });
      setAppointment(data);
      setLastUpdated(timestamp);
    } catch {
      if (!cached) {
        setError("We couldn't load this appointment.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCancel = async () => {
    if (!appointment || !id) return;
    const confirmed = window.confirm(
      "Are you sure you want to cancel this appointment?",
    );
    if (!confirmed) return;

    setCancelling(true);
    try {
      const res = await api.put(`/appointments/${appointment.id}/update`, {
        status: "cancelled",
      });
      const updatedStatus = res.data.appointment?.status ?? "cancelled";
      setAppointment((prev) => {
        if (!prev) return prev;
        const next = { ...prev, status: updatedStatus };
        appointmentCache.set(id, { data: next, timestamp: Date.now() });
        return next;
      });
    } finally {
      setCancelling(false);
    }
  };

  const fetchDateSummary = async () => {
    if (!appointment) return;
    setLoadingDateSummary(true);
    try {
      const res = await api.get("/appointments/booked-summary", {
        params: {
          dentist_id: appointment.dentist.id,
          start_date: dateKey(dateOptions[0]),
          end_date: dateKey(dateOptions[dateOptions.length - 1]),
        },
      });
      const closed: string[] = res.data.closed ?? [];
      const full: string[] = res.data.full ?? [];
      setClosedDates(new Set(closed));
      setFullyBookedDates(new Set([...closed, ...full]));
    } catch {
      setClosedDates(new Set());
      setFullyBookedDates(new Set());
    } finally {
      setLoadingDateSummary(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!appointment || !newDate) return;
    setLoadingSlots(true);
    try {
      const res = await api.get("/appointments/available-slots", {
        params: { dentist_id: appointment.dentist.id, date: dateKey(newDate) },
      });
      setDaySlots(res.data.slots ?? []);
      setBookedSlots(res.data.booked ?? []);
      setDayClosed(Boolean(res.data.closed));
    } catch {
      setDaySlots([]);
      setBookedSlots([]);
      setDayClosed(false);
    } finally {
      setLoadingSlots(false);
    }
  };

  const openReschedule = () => {
    setNewDate(null);
    setNewTime(null);
    setDaySlots([]);
    setBookedSlots([]);
    setDayClosed(false);
    setRescheduleOpen(true);
  };

  const handleConfirmReschedule = async () => {
    if (!appointment || !newDate || !newTime || !id) return;
    setRescheduling(true);
    try {
      const res = await api.put(`/appointments/${appointment.id}/update`, {
        date: dateKey(newDate),
        time: newTime,
      });
      setAppointment((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          date: res.data.appointment?.date ?? dateKey(newDate),
          time: res.data.appointment?.time ?? newTime,
        };
        appointmentCache.set(id, { data: next, timestamp: Date.now() });
        return next;
      });
      setRescheduleOpen(false);
    } finally {
      setRescheduling(false);
    }
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <div className="hidden items-center gap-2 md:flex">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
          </div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/appointments">
                  Appointments
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Details</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading appointment...
            </div>
          ) : error || !appointment ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-muted-foreground">
                {error ?? "Appointment not found."}
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/appointments")}
              >
                Back to Appointments
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" onClick={() => navigate(-1)} className="w-full sm:w-auto">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <button
                  type="button"
                  onClick={() => fetchAppointment({ force: true })}
                  disabled={refreshing}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  />
                  {refreshing
                    ? "Refreshing…"
                    : lastUpdated
                      ? `Updated ${formatLastUpdated(lastUpdated)}`
                      : "Refresh"}
                </button>
              </div>
              <div className="mx-auto w-full max-w-2xl">
                <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
                  {/* Header */}
                  <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-lg font-bold sm:text-xl">
                        {appointment.service.name}
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(appointment.date)} at {appointment.time}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </div>

                  {/* Info grid */}
                  <div className="grid gap-4 py-4 sm:gap-6 sm:py-6 sm:grid-cols-2">
                    <InfoRow
                      icon={Stethoscope}
                      label="Service"
                      primary={appointment.service.name}
                      secondary={`$${Number(appointment.service.price).toFixed(
                        0,
                      )} · ${appointment.service.duration}m`}
                    />
                    <InfoRow
                      icon={User}
                      label="Dentist"
                      primary={appointment.dentist.full_name}
                      secondary={appointment.dentist.specialty}
                    />
                    <InfoRow
                      icon={CalendarDays}
                      label="Date"
                      primary={formatDate(appointment.date)}
                    />
                    <InfoRow
                      icon={Clock}
                      label="Time"
                      primary={appointment.time}
                    />
                    <InfoRow
                      icon={User}
                      label="Patient"
                      primary={appointment.full_name}
                      secondary={appointment.email}
                    />
                    <InfoRow
                      icon={MapPin}
                      label="Location"
                      primary="BrightSmile Dental Clinic"
                      secondary="123 Smile Ave, Springfield"
                    />
                  </div>

                  {/* Reason */}
                  {appointment.reason && (
                    <div className="flex flex-col gap-2 border-t pt-4">
                      <span className="text-sm font-medium">
                        Reason for visit
                      </span>
                      <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                        {appointment.reason}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {appointment.status !== "cancelled" && (
                    <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:mt-6 sm:flex-row sm:gap-3">
                      <Button
                        variant="outline"
                        className="w-full sm:flex-1"
                        onClick={openReschedule}
                      >
                        <CalendarClock className="mr-2 h-4 w-4" />
                        Reschedule
                      </Button>
                      <Button
                        variant="destructive"
                        className="w-full sm:flex-1"
                        onClick={handleCancel}
                        disabled={cancelling}
                      >
                        {cancelling ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Cancel Appointment
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Reschedule dialog */}
        <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Reschedule appointment</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Select a new date
                  </p>
                  {loadingDateSummary && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking availability...
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {dateOptions.map((d) => {
                    const key = dateKey(d);
                    const isSelected = newDate && key === dateKey(newDate);
                    const isClosed = closedDates.has(key);
                    const isFull = fullyBookedDates.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={isFull}
                        onClick={() => {
                          setNewDate(d);
                          setNewTime(null);
                        }}
                        className={`flex flex-col items-center rounded-lg border py-2 text-xs transition-colors ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : isFull
                              ? "cursor-not-allowed border-input bg-muted/50 text-muted-foreground/50 line-through"
                              : "hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`uppercase ${
                            isSelected
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground"
                          }`}
                        >
                          {d.toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                        <span className="text-base font-semibold">
                          {d.getDate()}
                        </span>
                        {isFull && (
                          <span className="mt-0.5 text-[10px] font-medium text-muted-foreground/70">
                            {isClosed ? "Closed" : "Full"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {newDate && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    Select a new time
                  </p>
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking availability...
                    </div>
                  ) : dayClosed || daySlots.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      The clinic is closed on this day. Please pick another
                      date.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {daySlots.map((slot) => {
                        const isBooked = bookedSlots.includes(slot);
                        const isSelected = newTime === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isBooked}
                            onClick={() => setNewTime(slot)}
                            className={`rounded-lg border py-2 text-sm transition-colors ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : isBooked
                                  ? "cursor-not-allowed border-input bg-muted/50 text-muted-foreground/50 line-through"
                                  : "hover:bg-muted/50"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRescheduleOpen(false)}
                disabled={rescheduling}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmReschedule}
                disabled={!newDate || !newTime || rescheduling}
              >
                {rescheduling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirm reschedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
