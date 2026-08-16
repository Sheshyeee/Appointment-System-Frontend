import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import api from "@/api/axios";

// ---------------- Types (matches AppointmentController@index response) ----------------
interface Service {
  id: number;
  name: string;
}

interface Dentist {
  id: number;
  full_name: string;
}

interface Appointment {
  id: number;
  full_name: string;
  email: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  service: Service;
  dentist: Dentist;
}

type FilterStatus = "all" | "completed" | "cancelled" | "confirmed" | "pending";

const FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
];

// Same key used on PatientDashboard.tsx — this endpoint is server-scoped to
// the logged-in patient's own appointments, so both pages can safely share
// one cache entry instead of each fetching it independently.
const MY_APPOINTMENTS_QUERY_KEY = ["appointments", "mine"] as const;
const STALE_TIME_APPOINTMENTS = 2 * 60_000; // 2 min — matches PatientDashboard.tsx

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  if (isToday) return "Today";

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  const styles: Record<Appointment["status"], string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
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

export default function History() {
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<FilterStatus>("all");

  // ---------------------------------------------------------------------
  // READ — cached fetch of the patient's own appointments. The API
  // filters to the logged-in user's own appointments based on the auth
  // token (Auth::id()) — no params needed here. Shares its cache entry
  // with PatientDashboard.tsx via the same query key, so navigating
  // between the two doesn't re-fetch unless the cache is stale.
  // ---------------------------------------------------------------------
  const {
    data: appointments = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: MY_APPOINTMENTS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/appointments");
      return (res.data.appointments ?? res.data ?? []) as Appointment[];
    },
    staleTime: STALE_TIME_APPOINTMENTS,
  });

  const error = queryError
    ? "We couldn't load your appointment history."
    : null;

  const filtered = useMemo(() => {
    return appointments
      .filter((a) => {
        if (statusFilter === "all") return true;
        return a.status === statusFilter;
      })
      .filter((a) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          a.service?.name?.toLowerCase().includes(q) ||
          a.dentist?.full_name?.toLowerCase().includes(q) ||
          (a as any).reason?.toLowerCase?.().includes(q)
        );
      })
      .filter((a) => {
        if (!fromDate) return true;
        return a.date >= fromDate;
      })
      .filter((a) => {
        if (!toDate) return true;
        return a.date <= toDate;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [appointments, search, fromDate, toDate, statusFilter]);

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
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Appointment History</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Appointment History</h1>
            <p className="text-sm text-muted-foreground">
              Search and filter your full appointment history
            </p>
          </div>

          {/* Filters card */}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground sm:text-sm">
                  From date
                </label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground sm:text-sm">To date</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
              {FILTERS.map((f) => {
                const isActive = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setStatusFilter(f.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table card */}
          <div className="rounded-xl border bg-background">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground sm:py-16">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading appointment history...
              </div>
            ) : error ? (
              <div className="py-12 text-center text-muted-foreground sm:py-16">
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground sm:py-16">
                No appointments match your filters.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left text-[10px] uppercase text-muted-foreground sm:text-xs">
                        <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Service</th>
                        <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Dentist</th>
                        <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-4 sm:py-3">Date</th>
                        <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-4 sm:py-3">Time</th>
                        <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => (
                        <tr
                          key={a.id}
                          onClick={() => navigate(`/appointments/${a.id}`)}
                          className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-3 py-3 font-medium sm:px-4 sm:py-4">
                            <div className="truncate max-w-[120px] sm:max-w-none">{a.service?.name}</div>
                          </td>
                          <td className="px-3 py-3 text-primary sm:px-4 sm:py-4">
                            <div className="truncate max-w-[100px] sm:max-w-none">{a.dentist?.full_name}</div>
                          </td>
                          <td className="hidden px-4 py-4 sm:table-cell">
                            {formatDate(a.date)}
                          </td>
                          <td className="hidden px-4 py-4 sm:table-cell">
                            {a.time}
                          </td>
                          <td className="px-3 py-3 sm:px-4 sm:py-4">
                            <StatusBadge status={a.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t py-3 text-center text-xs text-muted-foreground sm:py-4 sm:text-sm">
                  {filtered.length} appointment
                  {filtered.length === 1 ? "" : "s"} found
                </div>
              </>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
