import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  CalendarClock,
  Trash2,
  Loader2,
  CalendarDays,
} from "lucide-react";
import api from "@/api/axios";

// ---------------- Types ----------------
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

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface Appointment {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  reason: string | null;
  status: AppointmentStatus;
  service: Service;
  dentist: Dentist;
}

type ViewMode = "daily" | "weekly";
type StatusFilter = "all" | AppointmentStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

// ---------------- Date helpers ----------------
function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function longDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function startOfDay(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// Monday-start week containing `d`.
function startOfWeek(d: Date) {
  const out = startOfDay(d);
  const day = out.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(out, diff);
}

function generateDateRange(days: number) {
  const out: Date[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    out.push(addDays(start, i));
  }
  return out;
}

// Parses "3:30 PM" into minutes since midnight, for correct chronological
// sorting (the backend's string ORDER BY isn't AM/PM-aware).
function timeToMinutes(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function splitTime(time: string): [string, string] {
  const match = time.match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
  if (!match) return [time, ""];
  return [match[1], match[2].toUpperCase()];
}

// ---------------- Status badge ----------------
const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Query keys — kept centralized so every read + invalidate call stays in
// sync. staleTimes below are deliberately tiered:
//   - dentists barely ever change            -> cached longest
//   - the appointments list changes sometimes -> cached moderately
//   - booked-summary / available-slots reflect live booking availability
//     and directly gate what a staff member is allowed to click -> cached
//     only briefly, so two staff members rescheduling around the same time
//     don't work off of stale slot data.
// ---------------------------------------------------------------------------
const DENTISTS_QUERY_KEY = ["dentists"] as const;
const APPOINTMENTS_BASE_KEY = ["appointments"] as const;
const appointmentsKey = (dentistFilter: string) =>
  [...APPOINTMENTS_BASE_KEY, { dentistFilter }] as const;
const dateSummaryKey = (dentistId: number, start: string, end: string) =>
  ["appointments", "booked-summary", { dentistId, start, end }] as const;
const availableSlotsKey = (dentistId: number, date: string) =>
  ["appointments", "available-slots", { dentistId, date }] as const;

const STALE_TIME_DENTISTS = 30 * 60_000; // 30 min — near-static reference data
const STALE_TIME_APPOINTMENTS = 10 * 60_000; // 10 min — still fresh enough for a live board
const STALE_TIME_DATE_SUMMARY = 4 * 60_000; // 4 min — availability, but low-stakes (per-day closed/full flags)
const STALE_TIME_SLOTS = 90_000; // 90 sec — directly gates bookable times, kept short on purpose to avoid double-booking

export default function AppoinmentsStaff() {
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [anchorDate, setAnchorDate] = useState<Date>(startOfDay(new Date()));

  const [dentistFilter, setDentistFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Row-level "in flight" state so we can show a spinner on the specific
  // button being pressed without locking the whole page.
  const [actioningId, setActioningId] = useState<number | null>(null);

  // ---------------- Reschedule dialog state ----------------
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const rescheduleDateOptions = generateDateRange(14);
  const rangeStart = dateKey(rescheduleDateOptions[0]);
  const rangeEnd = dateKey(
    rescheduleDateOptions[rescheduleDateOptions.length - 1],
  );

  // ---------------------------------------------------------------------
  // READ — dentist list for the filter dropdown + reschedule dialog.
  // ---------------------------------------------------------------------
  const { data: dentists = [] } = useQuery({
    queryKey: DENTISTS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/dentists");
      return (res.data.dentists ?? res.data ?? []) as Dentist[];
    },
    staleTime: STALE_TIME_DENTISTS,
    retry: false,
  });

  // ---------------- READ — appointments list, cached per dentist filter.
  const {
    data: appointments = [],
    isLoading: loading,
    error: appointmentsError,
  } = useQuery({
    queryKey: appointmentsKey(dentistFilter),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dentistFilter !== "all") params.dentist_id = dentistFilter;
      const res = await api.get("/appointments", { params });
      return (res.data.appointments ?? res.data ?? []) as Appointment[];
    },
    staleTime: STALE_TIME_APPOINTMENTS,
  });

  const error = appointmentsError ? "Failed to load appointments." : null;

  // ---------------- READ — closed/fully-booked date summary for the
  // reschedule dialog's date picker. Only runs while the dialog is open.
  const { data: dateSummary, isLoading: loadingDateSummary } = useQuery({
    queryKey: dateSummaryKey(
      rescheduling?.dentist.id ?? 0,
      rangeStart,
      rangeEnd,
    ),
    queryFn: async () => {
      const res = await api.get("/appointments/booked-summary", {
        params: {
          dentist_id: rescheduling!.dentist.id,
          start_date: rangeStart,
          end_date: rangeEnd,
        },
      });
      const closed: string[] = res.data.closed ?? [];
      const full: string[] = res.data.full ?? [];
      return {
        closedDates: new Set(closed),
        fullyBookedDates: new Set([...closed, ...full]),
      };
    },
    enabled: !!rescheduling,
    staleTime: STALE_TIME_DATE_SUMMARY,
  });

  const closedDates = dateSummary?.closedDates ?? new Set<string>();
  const fullyBookedDates = dateSummary?.fullyBookedDates ?? new Set<string>();

  // ---------------- READ — available slots for the currently-selected
  // reschedule date. Kept on a short staleTime since it gates real bookings.
  const { data: slotsData, isLoading: loadingSlots } = useQuery({
    queryKey: availableSlotsKey(
      rescheduling?.dentist.id ?? 0,
      newDate ? dateKey(newDate) : "",
    ),
    queryFn: async () => {
      const res = await api.get("/appointments/available-slots", {
        params: {
          dentist_id: rescheduling!.dentist.id,
          date: dateKey(newDate!),
        },
      });
      return {
        daySlots: (res.data.slots ?? []) as string[],
        bookedSlots: (res.data.booked ?? []) as string[],
        dayClosed: Boolean(res.data.closed),
      };
    },
    enabled: !!rescheduling && !!newDate,
    staleTime: STALE_TIME_SLOTS,
  });

  const daySlots = slotsData?.daySlots ?? [];
  const bookedSlots = slotsData?.bookedSlots ?? [];
  const dayClosed = slotsData?.dayClosed ?? false;

  // ---------------------------------------------------------------------
  // WRITE — status changes (confirm/complete/cancel) and reschedules.
  // Both invalidate the appointments base key (every dentist-filter
  // variant) plus the slot/summary queries so the dialog reflects reality
  // right after a booking changes.
  // ---------------------------------------------------------------------
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      appointment,
      status,
    }: {
      appointment: Appointment;
      status: AppointmentStatus;
    }) => {
      const res = await api.put(`/appointments/${appointment.id}/update`, {
        status,
      });
      return res.data.appointment as Appointment | undefined;
    },
    onMutate: ({ appointment }) => setActioningId(appointment.id),
    onSuccess: () => {
      // 👉 invalidateQueries HERE: after confirm/complete/cancel, so the
      // board (in every dentist-filter variant) reflects the new status.
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_BASE_KEY });
    },
    onSettled: () => setActioningId(null),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({
      id,
      date,
      time,
    }: {
      id: number;
      date: string;
      time: string;
    }) => {
      const res = await api.put(`/appointments/${id}/update`, { date, time });
      return res.data.appointment as Appointment | undefined;
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE: after a successful reschedule, refresh
      // the appointments list, the date summary, and the slots for the
      // day just booked, so nobody else double-books that slot.
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_BASE_KEY });
      queryClient.invalidateQueries({
        queryKey: ["appointments", "booked-summary"],
      });
      queryClient.invalidateQueries({
        queryKey: ["appointments", "available-slots"],
      });
      setRescheduleError(null);
      setRescheduling(null);
    },
    onError: (err: any) => {
      setRescheduleError(
        err?.response?.data?.errors?.time?.[0] ??
          err?.response?.data?.message ??
          "Failed to reschedule appointment.",
      );
    },
  });

  const confirmingReschedule = rescheduleMutation.isPending;

  // ---------------- Derived: filtered + grouped appointments ----------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (
        q &&
        !a.full_name.toLowerCase().includes(q) &&
        !a.service?.name?.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [appointments, statusFilter, search]);

  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  function appointmentsFor(day: Date) {
    const key = dateKey(day);
    return filtered
      .filter((a) => a.date?.slice(0, 10) === key)
      .sort((x, y) => timeToMinutes(x.time) - timeToMinutes(y.time));
  }

  const dailyList = useMemo(
    () => appointmentsFor(anchorDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, anchorDate],
  );

  const totalShown =
    viewMode === "daily"
      ? dailyList.length
      : weekDays.reduce((sum, d) => sum + appointmentsFor(d).length, 0);

  // ---------------- Nav ----------------
  const goPrev = () => {
    setAnchorDate((d) => addDays(d, viewMode === "daily" ? -1 : -7));
  };
  const goNext = () => {
    setAnchorDate((d) => addDays(d, viewMode === "daily" ? 1 : 7));
  };
  const goToday = () => setAnchorDate(startOfDay(new Date()));

  // ---------------- Actions ----------------
  const updateStatus = (
    appointment: Appointment,
    status: AppointmentStatus,
  ) => {
    updateStatusMutation.mutate({ appointment, status });
  };

  const handleCancel = (appointment: Appointment) => {
    const ok = window.confirm(
      `Cancel the appointment for ${appointment.full_name}?`,
    );
    if (!ok) return;
    updateStatus(appointment, "cancelled");
  };

  // ---------------- Reschedule dialog ----------------
  const openReschedule = (appointment: Appointment) => {
    setRescheduling(appointment);
    setNewDate(null);
    setNewTime(null);
    setRescheduleError(null);
  };

  const closeReschedule = () => {
    setRescheduling(null);
  };

  const confirmReschedule = () => {
    if (!rescheduling || !newDate || !newTime) return;
    rescheduleMutation.mutate({
      id: rescheduling.id,
      date: dateKey(newDate),
      time: newTime,
    });
  };

  // ---------------- Row rendering ----------------
  function ActionButtons({ appointment }: { appointment: Appointment }) {
    const busy = actioningId === appointment.id;

    if (
      appointment.status === "completed" ||
      appointment.status === "cancelled"
    ) {
      return (
        <p className="text-xs text-muted-foreground">No actions available</p>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {appointment.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => updateStatus(appointment, "confirmed")}
            className="h-8 text-xs"
          >
            {busy ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3 w-3" />
            )}
            Confirm
          </Button>
        )}
        {appointment.status === "confirmed" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => updateStatus(appointment, "completed")}
            className="h-8 text-xs"
          >
            {busy ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3 w-3" />
            )}
            Complete
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => openReschedule(appointment)}
          className="h-8 text-xs"
        >
          <CalendarClock className="mr-1 h-3 w-3" />
          Reschedule
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => handleCancel(appointment)}
          className="h-8 text-xs"
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Cancel
        </Button>
      </div>
    );
  }

  function AppointmentRow({ appointment }: { appointment: Appointment }) {
    const [time, ampm] = splitTime(appointment.time);
    return (
      <div className="rounded-xl border bg-background p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-blue-50 py-2 text-blue-700 sm:w-14">
            <span className="text-sm font-semibold leading-tight">{time}</span>
            <span className="text-[10px] font-medium leading-tight">
              {ampm}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <span className="truncate text-sm font-medium">{appointment.service?.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {appointment.full_name} · Dr. {appointment.dentist?.full_name}
            </span>
            {appointment.reason && (
              <span className="truncate text-xs text-muted-foreground">
                Reason: {appointment.reason}
              </span>
            )}
          </div>

          <StatusBadge status={appointment.status} />
        </div>

        <div className="mt-3">
          <ActionButtons appointment={appointment} />
        </div>
      </div>
    );
  }

  function WeeklyEntry({ appointment }: { appointment: Appointment }) {
    return (
      <button
        type="button"
        onClick={() => {
          setViewMode("daily");
          setAnchorDate(startOfDay(new Date(appointment.date)));
        }}
        className="flex w-full flex-col gap-1 rounded-xl border p-2.5 text-left text-xs hover:bg-muted/50"
      >
        <span className="font-semibold">{appointment.time}</span>
        <span className="line-clamp-1 font-medium">
          {appointment.service?.name}
        </span>
        <span className="line-clamp-1 text-muted-foreground">
          {appointment.full_name}
        </span>
        <StatusBadge status={appointment.status} />
      </button>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "19rem" } as React.CSSProperties}
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
                <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Appointments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Appointments</h1>
            <p className="text-sm text-muted-foreground">
              Manage all clinic appointments
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("daily")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                    viewMode === "daily"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("weekly")}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                    viewMode === "weekly"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Weekly
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-xl border px-1.5 py-1.5">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-lg p-1.5 hover:bg-muted"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[140px] px-1.5 text-center text-xs font-medium sm:min-w-[180px] sm:text-sm">
                  {viewMode === "daily"
                    ? longDate(anchorDate)
                    : `${shortDate(weekStart)} – ${longDate(
                        addDays(weekStart, 6),
                      )}`}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-lg p-1.5 hover:bg-muted"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                className="text-xs font-medium text-primary hover:underline sm:text-sm"
              >
                {viewMode === "daily" ? "Today" : "This week"}
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by patient or service..."
                  className="pl-8"
                />
              </div>

              <select
                value={dentistFilter}
                onChange={(e) => setDentistFilter(e.target.value)}
                className="rounded-xl border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              >
                <option value="all">All dentists</option>
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatusFilter(tab.key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                        statusFilter === tab.key
                          ? "bg-blue-600 text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground sm:py-16">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading appointments...
            </div>
          ) : viewMode === "daily" ? (
            <div className="rounded-2xl border bg-background p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold text-sm sm:text-base">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                {longDate(anchorDate)}
              </div>

              {dailyList.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No appointments for this day.
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:gap-3">
                  {dailyList.map((a) => (
                    <AppointmentRow key={a.id} appointment={a} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {weekDays.map((day) => {
                const dayAppointments = appointmentsFor(day);
                return (
                  <div key={dateKey(day)} className="rounded-xl border p-2.5 sm:p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode("daily");
                        setAnchorDate(day);
                      }}
                      className="mb-2 block w-full text-left"
                    >
                      <span className="block text-[10px] font-medium uppercase text-muted-foreground sm:text-xs">
                        {day.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="text-lg font-bold">{day.getDate()}</span>
                    </button>
                    <div className="flex flex-col gap-1.5 sm:gap-2">
                      {dayAppointments.map((a) => (
                        <WeeklyEntry key={a.id} appointment={a} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && (
            <p className="pb-2 text-center text-xs text-muted-foreground sm:pb-4 sm:text-sm">
              {totalShown} appointment{totalShown === 1 ? "" : "(s)"} shown
            </p>
          )}
        </div>

        {/* Reschedule dialog */}
        <Dialog
          open={!!rescheduling}
          onOpenChange={(open) => !open && closeReschedule()}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Reschedule {rescheduling?.full_name}'s appointment
              </DialogTitle>
            </DialogHeader>

            {rescheduleError && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {rescheduleError}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Select a new date
                  </p>
                  {loadingDateSummary && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking availability...
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {rescheduleDateOptions.map((d) => {
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
                        className={`flex flex-col items-center rounded-lg border py-1.5 text-[10px] transition-colors sm:rounded-lg sm:py-2 sm:text-xs ${
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
                        <span className="text-sm font-semibold sm:text-base">
                          {d.getDate()}
                        </span>
                        {isFull && (
                          <span className="mt-0.5 text-[9px] font-medium text-muted-foreground/70 sm:text-[10px]">
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
                  <p className="mb-2 text-xs text-muted-foreground sm:text-sm">
                    Select a new time
                  </p>
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-xs sm:py-6 sm:text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                      Checking availability...
                    </div>
                  ) : dayClosed || daySlots.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground sm:py-6 sm:text-sm">
                      The clinic is closed on this day. Please pick another
                      date.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                      {daySlots.map((slot) => {
                        const isBooked = bookedSlots.includes(slot);
                        const isSelected = newTime === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isBooked}
                            onClick={() => setNewTime(slot)}
                            className={`rounded-lg border py-1.5 text-xs transition-colors sm:rounded-lg sm:py-2 sm:text-sm ${
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
                onClick={closeReschedule}
                disabled={confirmingReschedule}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmReschedule}
                disabled={!newDate || !newTime || confirmingReschedule}
              >
                {confirmingReschedule ? (
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
