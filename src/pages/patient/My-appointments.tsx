import React, { useEffect, useMemo, useState } from "react";
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
  CalendarCheck,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import api from "@/api/axios";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate } from "react-router-dom";

// ---------------- Types ----------------
type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface Appointment {
  id: number;
  date: string; // "2026-08-06"
  time: string; // "11:30 AM"
  status: AppointmentStatus;
  reason?: string | null;
  service: { id: number; name: string };
  dentist: { id: number; full_name: string };
}

// ---------------- Appointments cache ----------------
// Module-level so it survives unmount/remount when navigating away from and
// back to this page within the same session. Stale-while-revalidate keeps
// the list feeling instant while still refreshing quietly in the background.
const CACHE_TTL_MS = 60_000; // 1 minute

interface AppointmentsCacheEntry {
  data: Appointment[];
  timestamp: number;
}

let appointmentsCache: AppointmentsCacheEntry | null = null;

function isCacheFresh(entry: AppointmentsCacheEntry | null) {
  return !!entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

const STATUS_FILTERS: { label: string; value: "all" | AppointmentStatus }[] = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-50 text-amber-600 border border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  completed: "bg-sky-50 text-sky-600 border border-sky-200",
  cancelled: "bg-rose-50 text-rose-600 border border-rose-200",
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d;
}

function isToday(dateStr: string) {
  return dateStr === startOfToday().toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string) {
  if (isToday(dateStr)) return "Today";
  return parseDate(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthAbbrev(dateStr: string) {
  return parseDate(dateStr)
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
}

function dayNumber(dateStr: string) {
  return parseDate(dateStr).getDate();
}

function formatLastUpdated(ts: number | null) {
  if (!ts) return null;
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export default function MyAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>(
    () => appointmentsCache?.data ?? [],
  );
  const [loading, setLoading] = useState(
    () => !isCacheFresh(appointmentsCache) && appointmentsCache === null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(
    () => appointmentsCache?.timestamp ?? null,
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AppointmentStatus>(
    "all",
  );

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;

    // Fresh cache and no forced refresh: skip the network call entirely.
    if (!force && isCacheFresh(appointmentsCache)) {
      setAppointments(appointmentsCache!.data);
      setLastUpdated(appointmentsCache!.timestamp);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate: show whatever we have while refetching quietly.
    const hasCachedData = appointmentsCache !== null;
    if (hasCachedData) {
      setAppointments(appointmentsCache!.data);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.get("/appointments");
      const data: Appointment[] = res.data.appointments ?? res.data;
      const timestamp = Date.now();
      appointmentsCache = { data, timestamp };
      setAppointments(data);
      setLastUpdated(timestamp);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      const matchesSearch =
        !q ||
        a.service.name.toLowerCase().includes(q) ||
        a.dentist.full_name.toLowerCase().includes(q) ||
        (a.reason ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [appointments, search, statusFilter]);

  const upcoming = useMemo(
    () =>
      filtered
        .filter((a) => parseDate(a.date) >= startOfToday())
        .sort((a, b) => (a.date + a.time > b.date + b.time ? 1 : -1)),
    [filtered],
  );

  const past = useMemo(
    () =>
      filtered
        .filter((a) => parseDate(a.date) < startOfToday())
        .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1)),
    [filtered],
  );
  const navigate = useNavigate();

  const goToBooking = () => {
    navigate("/book-appointments");
  };

  const renderRow = (a: Appointment) => (
    <Link to={`/appointments/${a.id}`} className="block">
      <div
        key={a.id}
        className="flex items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-muted/30 sm:gap-4 sm:p-4"
      >
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-14 sm:w-14">
          <span className="text-[9px] font-semibold sm:text-[10px]">
            {monthAbbrev(a.date)}
          </span>
          <span className="text-base font-bold leading-none sm:text-lg">
            {dayNumber(a.date)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium">{a.service.name}</p>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            {a.dentist.full_name} · {a.time} · {formatDateLabel(a.date)}
          </p>
        </div>

        <span
          className={`hidden sm:inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[a.status]}`}
        >
          {a.status}
        </span>
        <span
          className={`sm:hidden rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[a.status]}`}
        >
          {a.status}
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );

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
                <BreadcrumbLink href="/appointments">
                  Appointments
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          <div className="flex flex-col gap-3 sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">My Appointments</h1>
              <p className="text-sm text-muted-foreground">
                Manage your upcoming and past visits
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!loading && (
                <button
                  type="button"
                  onClick={() => fetchAppointments({ force: true })}
                  disabled={refreshing}
                  className="flex shrink-0 items-center justify-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60 sm:px-3"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  />
                  <span className="hidden sm:inline">
                    {refreshing
                      ? "Refreshing…"
                      : lastUpdated
                        ? `Updated ${formatLastUpdated(lastUpdated)}`
                        : "Refresh"}
                  </span>
                </button>
              )}
              <Button onClick={goToBooking} className="flex-1 sm:flex-none">
                <CalendarCheck className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Book</span>
                <span className="hidden sm:inline">Book New</span>
              </Button>
            </div>
          </div>

          {/* Search + status filters */}
          <div className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by service, dentist, or reason..."
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading appointments...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <CalendarCheck className="h-8 w-8" />
              <p className="text-sm">No appointments match your search.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {upcoming.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    Upcoming
                  </h2>
                  <div className="flex flex-col gap-3">
                    {upcoming.map(renderRow)}
                  </div>
                </div>
              )}

              {past.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    Past
                  </h2>
                  <div className="flex flex-col gap-3">
                    {past.map(renderRow)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
