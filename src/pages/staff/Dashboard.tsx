import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Loader2,
  CalendarClock,
  Trash2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
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

// ---------------- Appointments cache ----------------
// Module-level (not component state) so it survives unmount/remount as the
// user navigates away from and back to the dashboard within the same
// session. Keeps the dashboard feeling instant on repeat visits while still
// refreshing in the background so data doesn't go stale.
const CACHE_TTL_MS = 60_000; // 1 minute

interface AppointmentsCacheEntry {
  data: Appointment[];
  timestamp: number;
}

let appointmentsCache: AppointmentsCacheEntry | null = null;

function isCacheFresh(entry: AppointmentsCacheEntry | null) {
  return !!entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

// ---------------- Date/time helpers ----------------
function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthAbbr(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
}

function relativeOrDate(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

// ---------------- Status badge (same styling used across the app) ----------------
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

// ---------------- Stat card ----------------
function StatCard({
  icon: Icon,
  iconClassName,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div
        className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Seed state from cache when available so there's no loading flash on
  // repeat visits.
  const [appointments, setAppointments] = useState<Appointment[]>(
    () => appointmentsCache?.data ?? [],
  );
  const [loading, setLoading] = useState(
    () => !isCacheFresh(appointmentsCache) && appointmentsCache === null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(
    () => appointmentsCache?.timestamp ?? null,
  );

  const isStaffOrAdmin = user?.role === "staff" || user?.role === "admin";

  useEffect(() => {
    if (!isStaffOrAdmin) return;
    fetchAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaffOrAdmin]);

  const fetchAppointments = async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;

    // Fresh cache and no forced refresh: just use what we have, no network call.
    if (!force && isCacheFresh(appointmentsCache)) {
      setAppointments(appointmentsCache!.data);
      setLastUpdated(appointmentsCache!.timestamp);
      setLoading(false);
      setError(null);
      return;
    }

    // Stale-while-revalidate: if we have any cached data (even stale), show
    // it immediately and refetch quietly in the background instead of
    // blanking the screen with a spinner.
    const hasCachedData = appointmentsCache !== null;
    if (hasCachedData) {
      setAppointments(appointmentsCache!.data);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api.get("/appointments");
      const data: Appointment[] = res.data.appointments ?? res.data;
      const timestamp = Date.now();
      appointmentsCache = { data, timestamp };
      setAppointments(data);
      setLastUpdated(timestamp);
    } catch {
      setError("Failed to load today's overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const todayKey = dateKey(new Date());

  const todaysAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.date?.slice(0, 10) === todayKey)
        .sort((x, y) => timeToMinutes(x.time) - timeToMinutes(y.time)),
    [appointments, todayKey],
  );

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter(
          (a) => a.date?.slice(0, 10) > todayKey && a.status !== "cancelled",
        )
        .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))
        .slice(0, 6),
    [appointments, todayKey],
  );

  const stats = useMemo(() => {
    const patientsToday = todaysAppointments.filter(
      (a) => a.status !== "cancelled",
    ).length;
    const pendingConfirmations = appointments.filter(
      (a) => a.status === "pending",
    ).length;
    const completedToday = todaysAppointments.filter(
      (a) => a.status === "completed",
    ).length;
    const cancellationsToday = todaysAppointments.filter(
      (a) => a.status === "cancelled",
    ).length;

    return {
      patientsToday,
      pendingConfirmations,
      completedToday,
      cancellationsToday,
    };
  }, [appointments, todaysAppointments]);

  const updateStatus = async (
    appointment: Appointment,
    status: AppointmentStatus,
  ) => {
    setActioningId(appointment.id);
    try {
      const res = await api.put(`/appointments/${appointment.id}/update`, {
        status,
      });
      const updatedStatus = res.data.appointment?.status ?? status;
      setAppointments((prev) => {
        const next = prev.map((a) =>
          a.id === appointment.id ? { ...a, status: updatedStatus } : a,
        );
        // Keep the cache in sync so a later remount doesn't show stale
        // pre-update data before the next background refresh lands.
        appointmentsCache = {
          data: next,
          timestamp: appointmentsCache?.timestamp ?? Date.now(),
        };
        return next;
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = (appointment: Appointment) => {
    const ok = window.confirm(
      `Cancel the appointment for ${appointment.full_name}?`,
    );
    if (!ok) return;
    updateStatus(appointment, "cancelled");
  };

  const goToReschedule = (appointment: Appointment) => {
    // Full reschedule flow (calendar + slot picker) lives on the main
    // Appointments page — keep the dashboard focused on a quick overview.
    navigate("/appoinments-staff", { state: { rescheduleId: appointment.id } });
  };

  function ScheduleRow({ appointment }: { appointment: Appointment }) {
    const busy = actioningId === appointment.id;
    const noActions =
      appointment.status === "completed" || appointment.status === "cancelled";

    return (
      <div className="rounded-xl border bg-background p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-blue-50 py-2 text-blue-700">
            <span className="text-sm font-semibold leading-tight">
              {appointment.time.replace(/\s?(AM|PM)/i, "")}
            </span>
            <span className="text-[10px] font-medium leading-tight">
              {appointment.time.match(/AM|PM/i)?.[0]}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <span className="truncate text-sm font-medium">{appointment.service?.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {appointment.full_name} · Dr. {appointment.dentist?.full_name}
            </span>
          </div>

          <StatusBadge status={appointment.status} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {noActions ? (
            <p className="text-xs text-muted-foreground">No actions available</p>
          ) : (
            <>
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
                onClick={() => goToReschedule(appointment)}
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
            </>
          )}
        </div>
      </div>
    );
  }

  function UpcomingRow({ appointment }: { appointment: Appointment }) {
    const d = new Date(appointment.date);
    return (
      <button
        type="button"
        onClick={() => navigate("/appoinments-staff")}
        className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/50 sm:gap-4 sm:p-4"
      >
        <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-slate-50 py-2 text-slate-700 sm:w-14">
          <span className="text-[9px] font-medium leading-tight sm:text-[10px]">
            {monthAbbr(d)}
          </span>
          <span className="text-base font-bold leading-tight sm:text-lg">{d.getDate()}</span>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <span className="truncate text-sm font-medium">{appointment.service?.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {appointment.full_name} · {appointment.time} · {relativeOrDate(d)}
          </span>
        </div>

        <StatusBadge status={appointment.status} />
      </button>
    );
  }

  function formatLastUpdated(ts: number | null) {
    if (!ts) return null;
    const seconds = Math.round((Date.now() - ts) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}m ago`;
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
                <BreadcrumbPage>Overview</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          {!isStaffOrAdmin ? (
            <div className="rounded-2xl border bg-background p-6 text-sm text-muted-foreground shadow-sm">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                    Welcome, {user?.name?.split(" ")[0] ?? "there"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Here's what's happening at the clinic today
                  </p>
                </div>

                {!loading && (
                  <button
                    type="button"
                    onClick={() => fetchAppointments({ force: true })}
                    disabled={refreshing}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
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
                )}
              </div>

              {error && (
                <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading overview...
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      icon={Users}
                      iconClassName="bg-blue-50 text-blue-600"
                      value={stats.patientsToday}
                      label="Patients today"
                    />
                    <StatCard
                      icon={Clock}
                      iconClassName="bg-amber-50 text-amber-600"
                      value={stats.pendingConfirmations}
                      label="Pending confirmations"
                    />
                    <StatCard
                      icon={CheckCircle2}
                      iconClassName="bg-emerald-50 text-emerald-600"
                      value={stats.completedToday}
                      label="Completed today"
                    />
                    <StatCard
                      icon={XCircle}
                      iconClassName="bg-red-50 text-red-600"
                      value={stats.cancellationsToday}
                      label="Cancellations today"
                    />
                  </div>

                  {/* Today's schedule */}
                  <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-sm sm:text-base">
                        <CalendarDays className="h-4 w-4 text-blue-600" />
                        Today's Schedule
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate("/appoinments-staff")}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline sm:text-sm"
                      >
                        View all
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>

                    {todaysAppointments.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No appointments scheduled for today.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2 sm:gap-3">
                        {todaysAppointments.map((a) => (
                          <ScheduleRow key={a.id} appointment={a} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Upcoming appointments */}
                  <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-sm sm:text-base">
                        <CalendarDays className="h-4 w-4 text-blue-600" />
                        Upcoming Appointments
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate("/appoinments-staff")}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline sm:text-sm"
                      >
                        View all
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>

                    {upcomingAppointments.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nothing else on the books yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2 sm:gap-3">
                        {upcomingAppointments.map((a) => (
                          <UpcomingRow key={a.id} appointment={a} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
