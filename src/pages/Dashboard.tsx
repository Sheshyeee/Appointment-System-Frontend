import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  CalendarDays,
  Users,
  Stethoscope,
  DollarSign,
  TrendingDown,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarClock,
  Bell,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import api from "@/api/axios";

// ---------------- Types ----------------
interface DashboardStats {
  appts_this_week: number;
  total_patients: number;
  total_dentists: number;
  revenue_completed: number;
  cancellation_rate: number;
}

interface WeeklyChartPoint {
  day: string;
  date: string;
  count: number;
}

interface StatusBreakdown {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

type ActivityAction =
  | "booked"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "pending"
  | "rescheduled";

interface ActivityItem {
  id: number;
  message: string;
  status: string;
  action: ActivityAction;
  occurred_at: string;
}

interface DashboardData {
  stats: DashboardStats;
  weekly_chart: WeeklyChartPoint[];
  status_breakdown: StatusBreakdown;
  recent_activity: ActivityItem[];
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

// ---------------- Formatting helpers ----------------
function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return (
    new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    ` at ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  );
}

// ---------------- Status badge (consistent with the rest of the app) ----------------
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-muted"
      }`}
    >
      {label}
    </span>
  );
}

// ---------------- Stat card ----------------
// Doubles as a horizontally-scrollable "chip" on mobile (fixed min width,
// snaps into place) and a normal grid cell from sm+ up.
function StatCard({
  icon: Icon,
  iconClassName,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="min-w-[9.5rem] shrink-0 snap-start rounded-2xl border bg-background p-4 shadow-sm sm:min-w-0 sm:shrink sm:p-5">
      <div
        className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl sm:mb-3 sm:h-9 sm:w-9 ${iconClassName}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xl font-bold leading-tight sm:text-2xl">{value}</div>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
    </div>
  );
}

// ---------------- Activity icon per action ----------------
const ACTIVITY_ICON: Record<
  ActivityAction,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  confirmed: { icon: CheckCircle2, className: "text-emerald-600" },
  completed: { icon: CheckCircle2, className: "text-slate-500" },
  booked: { icon: Clock, className: "text-amber-500" },
  pending: { icon: Clock, className: "text-amber-500" },
  cancelled: { icon: XCircle, className: "text-red-500" },
  rescheduled: { icon: CalendarClock, className: "text-blue-500" },
};

const DONUT_COLORS: Record<keyof StatusBreakdown, string> = {
  pending: "#f59e0b", // amber-500
  confirmed: "#10b981", // emerald-500
  completed: "#64748b", // slate-500
  cancelled: "#ef4444", // red-500
};

export default function Page() {
  const queryClient = useQueryClient();

  // ---- Cached fetches ----
  // Dashboard stats change throughout the day as bookings come in, so this
  // is NOT treated like the dentist/staff lists (which barely change). A
  // short staleTime keeps navigation snappy while still self-correcting
  // quickly if the admin leaves this tab open for a while.
  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ["dashboard-admin"],
    queryFn: async () => {
      const res = await api.get("/dashboard/admin");
      return res.data as DashboardData;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Notifications need to feel close to real-time — short staleTime PLUS
  // refetchInterval so new notifications show up automatically while this
  // page is open, without the admin needing to navigate away and back.
  const { data: notifications = [], isLoading: notifLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get("/notifications");
      return (res.data.notifications ?? []) as NotificationItem[];
    },
    staleTime: 15 * 1000, // 15 seconds
    refetchInterval: 30 * 1000, // poll every 30s while the tab is open
  });

  const error = isError ? "Failed to load the dashboard." : null;

  const markNotificationRead = async (notification: NotificationItem) => {
    if (notification.read_at) return;

    // Optimistic update — same UX as before, just written through React
    // Query's cache (setQueryData) instead of a raw useState setter, so
    // the cache and the UI never disagree with each other.
    const previous = queryClient.getQueryData<NotificationItem[]>([
      "notifications",
    ]);

    queryClient.setQueryData<NotificationItem[]>(["notifications"], (old) =>
      (old ?? []).map((n) =>
        n.id === notification.id
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );

    try {
      await api.put(`/notifications/${notification.id}/read`);
    } catch {
      // Roll back to the previous cached state if the request failed.
      if (previous) {
        queryClient.setQueryData(["notifications"], previous);
      }
    }
  };

  const donutData = useMemo(() => {
    if (!data) return [];
    const b = data.status_breakdown;
    return (
      [
        { key: "pending", name: "Pending", value: b.pending },
        { key: "confirmed", name: "Confirmed", value: b.confirmed },
        { key: "completed", name: "Completed", value: b.completed },
        { key: "cancelled", name: "Cancelled", value: b.cancelled },
      ] as { key: keyof StatusBreakdown; name: string; value: number }[]
    ).filter((d) => d.value > 0);
  }, [data]);

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "19rem" } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        {/* Header — the desktop trigger/breadcrumb trail hides below md;
            Breadcrumb itself now renders the mobile trigger + avatar row,
            so there's only ever one trigger visible at a time. */}
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

        <div className="flex flex-1 flex-col gap-5 p-4 pt-0 sm:gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Clinic overview and recent activity
            </p>
          </div>

          {error && (
            <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading || !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading dashboard...
            </div>
          ) : (
            <>
              {/* Stats — horizontal snap-scroll on mobile, grid from sm+.
                  2 cols on sm, 3 on md/tablet, 5 only once there's enough
                  room at xl — avoids cramming 5 cards into a 1024px lg
                  viewport. */}
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-3 xl:grid-cols-5">
                <StatCard
                  icon={CalendarDays}
                  iconClassName="bg-blue-50 text-blue-600"
                  value={data.stats.appts_this_week}
                  label="Appts this week"
                />
                <StatCard
                  icon={Users}
                  iconClassName="bg-purple-50 text-purple-600"
                  value={data.stats.total_patients}
                  label="Total patients"
                />
                <StatCard
                  icon={Stethoscope}
                  iconClassName="bg-indigo-50 text-indigo-600"
                  value={data.stats.total_dentists}
                  label="Total dentists"
                />
                <StatCard
                  icon={DollarSign}
                  iconClassName="bg-emerald-50 text-emerald-600"
                  value={formatCurrency(data.stats.revenue_completed)}
                  label="Revenue (completed)"
                />
                <StatCard
                  icon={TrendingDown}
                  iconClassName="bg-red-50 text-red-600"
                  value={`${data.stats.cancellation_rate}%`}
                  label="Cancellation rate"
                />
              </div>

              {/* Charts — side by side from md up, since two charts fit
                  comfortably on a tablet-width screen. */}
              <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
                {/* Weekly chart */}
                <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-sm sm:text-base">
                    <Activity className="h-4 w-4 text-blue-600" />
                    Appointments this week
                  </div>
                  <div className="h-44 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.weekly_chart}>
                        <XAxis
                          dataKey="day"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          width={20}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                          formatter={(value) => [String(value), "count"]}
                        />
                        <Bar
                          dataKey="count"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={32}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Status breakdown */}
                <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                  <div className="mb-3 font-semibold text-sm sm:text-base">
                    Status breakdown
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="h-44 w-full sm:h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                          >
                            {donutData.map((d) => (
                              <Cell key={d.key} fill={DONUT_COLORS[d.key]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs sm:text-sm">
                      {donutData.map((d) => (
                        <div key={d.key} className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: DONUT_COLORS[d.key] }}
                          />
                          <span className="text-muted-foreground">
                            {d.name} ({d.value})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity / notifications — 3-col split only from xl up,
                  so the two panels don't get squeezed at 1024px (lg). */}
              <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
                {/* Recent activity — a real <table> from sm+ (horizontally
                    scrollable if the viewport is ever narrower than the
                    columns need), and a stacked card list below sm where a
                    3-column table would just squeeze everything unreadable. */}
                <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5 xl:col-span-2">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-sm sm:text-base">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    Recent Activity
                  </div>

                  {data.recent_activity.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No activity yet.
                    </p>
                  ) : (
                    <>
                      {/* Table view — sm and up */}
                      <div className="hidden -mx-1 overflow-x-auto sm:block">
                        <table className="w-full min-w-[420px] border-collapse text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                              <th className="px-1 pb-2 font-medium">
                                Activity
                              </th>
                              <th className="w-28 px-1 pb-2 font-medium">
                                Status
                              </th>
                              <th className="w-32 px-1 pb-2 text-right font-medium">
                                Time
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {data.recent_activity.map((item) => {
                              const { icon: Icon, className } =
                                ACTIVITY_ICON[item.action] ??
                                ACTIVITY_ICON.pending;
                              return (
                                <tr key={item.id}>
                                  <td className="px-1 py-2.5">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <Icon
                                        className={`h-4 w-4 shrink-0 ${className}`}
                                      />
                                      <span className="truncate">
                                        {item.message}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-1 py-2.5">
                                    <StatusBadge status={item.status} />
                                  </td>
                                  <td className="whitespace-nowrap px-1 py-2.5 text-right text-xs text-muted-foreground">
                                    {relativeTime(item.occurred_at)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Card view — below sm. Icon + message on top, then
                          a second row with the timestamp on the left and
                          the status badge on the right. Message wraps
                          instead of truncating, and the badge always gets
                          its own line so nothing gets squeezed off-screen
                          on narrow viewports. */}
                      <div className="flex flex-col divide-y sm:hidden">
                        {data.recent_activity.map((item) => {
                          const { icon: Icon, className } =
                            ACTIVITY_ICON[item.action] ?? ACTIVITY_ICON.pending;
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                            >
                              <Icon
                                className={`mt-0.5 h-4 w-4 shrink-0 ${className}`}
                              />
                              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <span className="break-words text-sm leading-snug">
                                  {item.message}
                                </span>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-muted-foreground">
                                    {relativeTime(item.occurred_at)}
                                  </span>
                                  <StatusBadge status={item.status} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Notifications */}
                <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-sm sm:text-base">
                    <Bell className="h-4 w-4 text-blue-600" />
                    Notifications
                  </div>

                  {notifLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted sm:h-9 sm:w-9">
                        <Bell className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
                      </div>
                      <p className="text-sm font-medium">All caught up</p>
                      <p className="text-xs text-muted-foreground">
                        No new notifications right now.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {notifications.slice(0, 6).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => markNotificationRead(n)}
                          className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/50 sm:p-3 ${
                            !n.read_at
                              ? "bg-blue-50/50 border-blue-100"
                              : "bg-background"
                          }`}
                        >
                          <span
                            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${
                              !n.read_at ? "bg-blue-600" : "bg-transparent"
                            }`}
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-xs font-medium sm:text-sm">
                              {n.title}
                            </span>
                            <span className="line-clamp-2 text-[10px] text-muted-foreground sm:text-xs">
                              {n.message}
                            </span>
                            <span className="text-[10px] text-muted-foreground sm:text-xs">
                              {relativeTime(n.created_at)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
