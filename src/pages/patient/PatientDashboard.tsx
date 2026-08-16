import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Activity,
  Bell,
  Loader2,
  ArrowRight,
  Plus,
} from "lucide-react";

import api from "@/api/axios";
import { useAuth } from "@/context/AuthContext";

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

interface NotificationItem {
  id: number;
  user_id: number;
  appointment_id: number | null;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query keys — kept centralized so reads and invalidations stay in sync.
//   - ["appointments", "mine"] is separate from the ["appointments", {..}]
//     keys used on the staff-facing pages, since this endpoint returns the
//     current patient's own appointments only (server-scoped), not a
//     dentist-filtered clinic-wide list.
//   - ["notifications"] is its own cache, independent of appointments.
// ---------------------------------------------------------------------------
const MY_APPOINTMENTS_QUERY_KEY = ["appointments", "mine"] as const;
const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;

const STALE_TIME_APPOINTMENTS = 2 * 60_000; // 2 min — a patient's own upcoming/past visits, doesn't change often
const STALE_TIME_NOTIFICATIONS = 30_000; // 30 sec — kept shorter since these are meant to feel "live"

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
  if (diffDays === -1) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-3 shadow-sm sm:p-4">
      <div
        className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg sm:mb-3 sm:h-9 sm:w-9 ${iconClassName}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xl font-bold leading-tight sm:text-2xl">{value}</div>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
    </div>
  );
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------
  // READ — the patient's own appointments. Backend already scopes
  // /appointments to the logged-in patient (see AppointmentController::index
  // — non-staff users only get their own rows), so no extra filtering is
  // needed client-side.
  // ---------------------------------------------------------------------
  const {
    data: appointments = [],
    isLoading: loading,
    error: appointmentsError,
  } = useQuery({
    queryKey: MY_APPOINTMENTS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/appointments");
      return (res.data.appointments ?? res.data ?? []) as Appointment[];
    },
    staleTime: STALE_TIME_APPOINTMENTS,
  });

  const error = appointmentsError ? "Failed to load your appointments." : null;

  // READ — notifications. Non-fatal if it fails, so no error banner is
  // surfaced for it; the dashboard still works without notifications.
  const { data: notifications = [], isLoading: notifLoading } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/notifications");
      return (res.data.notifications ?? []) as NotificationItem[];
    },
    staleTime: STALE_TIME_NOTIFICATIONS,
    retry: false,
  });

  // ---------------------------------------------------------------------
  // WRITE — marking a notification read. Optimistically flips read_at in
  // the cache immediately (onMutate), rolls back on failure (onError), and
  // invalidateQueries in onSettled re-syncs with the server either way —
  // this is the pattern to reach for when you want instant UI feedback
  // instead of waiting on the network round-trip.
  // ---------------------------------------------------------------------
  const markReadMutation = useMutation({
    mutationFn: async (notification: NotificationItem) => {
      await api.put(`/notifications/${notification.id}/read`);
      return notification.id;
    },
    onMutate: async (notification) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationItem[]>(
        NOTIFICATIONS_QUERY_KEY,
      );
      queryClient.setQueryData<NotificationItem[]>(
        NOTIFICATIONS_QUERY_KEY,
        (old) =>
          old?.map((n) =>
            n.id === notification.id
              ? { ...n, read_at: new Date().toISOString() }
              : n,
          ) ?? old,
      );
      return { previous };
    },
    onError: (_err, _notification, context) => {
      // Roll back to the pre-mutation cache snapshot on failure.
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      // 👉 invalidateQueries HERE: after the request settles (success or
      // failure), re-sync with the server so the cache is authoritative.
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });

  const markNotificationRead = (notification: NotificationItem) => {
    if (notification.read_at) return;
    markReadMutation.mutate(notification);
  };

  const todayKey = dateKey(new Date());

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter(
          (a) => a.date?.slice(0, 10) >= todayKey && a.status !== "cancelled",
        )
        .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)),
    [appointments, todayKey],
  );

  const pastAppointments = useMemo(
    () =>
      appointments
        .filter(
          (a) => a.date?.slice(0, 10) < todayKey || a.status === "completed",
        )
        .sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)),
    [appointments, todayKey],
  );

  const stats = useMemo(() => {
    const upcoming = upcomingAppointments.length;
    const completed = appointments.filter(
      (a) => a.status === "completed",
    ).length;
    const pending = appointments.filter((a) => a.status === "pending").length;
    // "Total Visits" reflects appointments the patient has actually
    // completed, not every appointment ever booked (upcoming/cancelled
    // shouldn't count as a "visit").
    const totalVisits = completed;

    return { upcoming, completed, pending, totalVisits };
  }, [appointments, upcomingAppointments]);

  function UpcomingRow({ appointment }: { appointment: Appointment }) {
    const d = new Date(appointment.date);
    return (
      <button
        type="button"
        onClick={() => navigate("/appointments")}
        className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/50 sm:gap-4 sm:p-4"
      >
        <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-blue-50 py-2 text-blue-700 sm:w-14">
          <span className="text-[9px] font-medium leading-tight sm:text-[10px]">
            {monthAbbr(d)}
          </span>
          <span className="text-base font-bold leading-tight sm:text-lg">{d.getDate()}</span>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <span className="truncate text-sm font-medium">{appointment.service?.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            Dr. {appointment.dentist?.full_name} · {appointment.time}
          </span>
        </div>

        <StatusBadge status={appointment.status} />
      </button>
    );
  }

  function VisitRow({ appointment }: { appointment: Appointment }) {
    const d = new Date(appointment.date);
    return (
      <button
        type="button"
        onClick={() => navigate("/appointments")}
        className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/50 sm:gap-4 sm:p-4"
      >
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <span className="truncate text-sm font-medium">{appointment.service?.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            Dr. {appointment.dentist?.full_name} · {relativeOrDate(d)}
          </span>
        </div>

        <StatusBadge status={appointment.status} />
      </button>
    );
  }

  function NotificationRow({
    notification,
  }: {
    notification: NotificationItem;
  }) {
    const isUnread = !notification.read_at;
    return (
      <button
        type="button"
        onClick={() => markNotificationRead(notification)}
        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${
          isUnread ? "bg-blue-50/50 border-blue-100" : "bg-background"
        }`}
      >
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            isUnread ? "bg-blue-600" : "bg-transparent"
          }`}
        />
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <span className="truncate text-sm font-medium">{notification.title}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
            {notification.message}
          </span>
          <span className="text-[10px] text-muted-foreground sm:text-xs">
            {timeAgo(notification.created_at)}
          </span>
        </div>
      </button>
    );
  }

  const nextAppointment = upcomingAppointments[0];
  const otherUpcoming = upcomingAppointments.slice(1, 4);
  const recentVisits = pastAppointments.slice(0, 5);
  const recentNotifications = notifications.slice(0, 6);

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Welcome, {user?.name?.split(" ")[0] ?? "there"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Here's an overview of your appointments
              </p>
            </div>
            <Button onClick={() => navigate("/book-appointments")} className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              Book New Appointment
            </Button>
          </div>

          {error && (
            <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your dashboard...
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={CalendarDays}
                  iconClassName="bg-blue-50 text-blue-600"
                  value={stats.upcoming}
                  label="Upcoming"
                />
                <StatCard
                  icon={CheckCircle2}
                  iconClassName="bg-emerald-50 text-emerald-600"
                  value={stats.completed}
                  label="Completed"
                />
                <StatCard
                  icon={Clock}
                  iconClassName="bg-amber-50 text-amber-600"
                  value={stats.pending}
                  label="Pending"
                />
                <StatCard
                  icon={Activity}
                  iconClassName="bg-teal-50 text-teal-600"
                  value={stats.totalVisits}
                  label="Total Visits"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {/* Upcoming appointments */}
                <div className="rounded-xl border bg-background p-4 shadow-sm lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-sm sm:text-base">
                      <CalendarDays className="h-4 w-4 text-blue-600" />
                      Upcoming Appointments
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate("/appointments")}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline sm:text-sm"
                    >
                      View all
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  {upcomingAppointments.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <p className="text-sm text-muted-foreground">
                        You don't have any upcoming appointments.
                      </p>
                      <Button size="sm" onClick={() => navigate("/book")}>
                        Book an appointment
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {nextAppointment && (
                        <UpcomingRow appointment={nextAppointment} />
                      )}
                      {otherUpcoming.map((a) => (
                        <UpcomingRow key={a.id} appointment={a} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Notifications */}
                <div className="rounded-xl border bg-background p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-sm sm:text-base">
                    <Bell className="h-4 w-4 text-blue-600" />
                    Notifications
                  </div>

                  {notifLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : recentNotifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted sm:h-9 sm:w-9">
                        <Bell className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
                      </div>
                      <p className="text-sm font-medium">All caught up</p>
                      <p className="text-xs text-muted-foreground">
                        No upcoming reminders right now.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {recentNotifications.map((n) => (
                        <NotificationRow key={n.id} notification={n} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent visits */}
              <div className="rounded-xl border bg-background p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm sm:text-base">
                    <Activity className="h-4 w-4 text-blue-600" />
                    Recent Visits
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/appointments")}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline sm:text-sm"
                  >
                    View history
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                {recentVisits.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    You don't have any past visits yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {recentVisits.map((a) => (
                      <VisitRow key={a.id} appointment={a} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
