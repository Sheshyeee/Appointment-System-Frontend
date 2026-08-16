import type React from "react";
import { useMemo, useState } from "react";
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
import { Search, Pencil, Trash2, Filter, X, Loader2 } from "lucide-react";
import api from "../api/axios";

// ---------------------------------------------------------------------------
// Types — mirrored from AppointmentController@index / store response shape
// ---------------------------------------------------------------------------
type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

// AppointmentController@update only validates status against these three —
// "completed" isn't in its `in:` rule, so it's excluded from the edit form.
type EditableStatus = "pending" | "confirmed" | "cancelled";

interface Service {
  id: number;
  name: string;
  duration?: number;
  price?: number;
}

interface Dentist {
  id: number;
  full_name: string;
}

interface Appointment {
  id: number;
  user_id: number | null;
  service_id: number;
  dentist_id: number;
  date: string; // "YYYY-MM-DD"
  time: string;
  full_name: string;
  email: string;
  phone: string;
  reason: string | null;
  status: AppointmentStatus;
  service?: Service;
  dentist?: Dentist;
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  completed: "bg-blue-50 text-blue-700 border border-blue-200",
  cancelled: "bg-rose-50 text-rose-700 border border-rose-200",
};

const STATUS_TABS: { label: string; value: AppointmentStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

// ---------------------------------------------------------------------------
// Query keys — kept as functions/constants so every read + invalidate call
// stays in sync.
//   - Appointments are cached per dentist filter, since that filter is sent
//     to the server as a query param and changes what's returned.
//   - invalidateQueries({ queryKey: APPOINTMENTS_BASE_KEY }) (no exact match)
//     invalidates *every* cached dentist-filter variant at once.
// ---------------------------------------------------------------------------
const APPOINTMENTS_BASE_KEY = ["appointments"] as const;
const appointmentsKey = (dentistFilter: string) =>
  [...APPOINTMENTS_BASE_KEY, { dentistFilter }] as const;
const DENTISTS_QUERY_KEY = ["dentists"] as const;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeStr: string) {
  // Handles "HH:mm" or "HH:mm:ss" -> "h:mm AM/PM"
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Generates 30-minute clinic slots between 08:00 and 18:00.
// Adjust the start/end hours here if your clinic's hours differ.
function buildTimeSlots(existingTime?: string) {
  const slots: string[] = [];
  for (let h = 8; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) continue;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  const normalized = existingTime?.slice(0, 5);
  if (normalized && !slots.includes(normalized)) {
    slots.push(normalized);
    slots.sort();
  }
  return slots;
}

export default function AllAppointments() {
  const queryClient = useQueryClient();

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [dentistFilter, setDentistFilter] = useState<string>("all");
  const [patientFilter, setPatientFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusTab, setStatusTab] =
    useState<(typeof STATUS_TABS)[number]["value"]>("all");

  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [editForm, setEditForm] = useState<{
    status: EditableStatus;
    date: string;
    time: string;
    dentist_id: string;
    reason: string;
  }>({ status: "pending", date: "", time: "", dentist_id: "", reason: "" });
  const [editError, setEditError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // READ — appointments list, cached per dentist filter. Switching the
  // filter back and forth reuses whatever's already cached instead of
  // re-hitting the network every time.
  // ---------------------------------------------------------------------
  const {
    data: appointments = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: appointmentsKey(dentistFilter),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dentistFilter !== "all") params.dentist_id = dentistFilter;
      const res = await api.get("/appointments", { params });
      return (res.data.appointments ?? []) as Appointment[];
    },
    staleTime: 30_000,
  });

  const error = queryError
    ? (queryError as any)?.response?.status === 401
      ? "Session expired. Please log in again."
      : "Failed to load appointments."
    : null;

  // READ — dentist list for the filter dropdown, cached separately.
  // Falls back to nothing (derived list below covers the fallback case)
  // if the endpoint 404s or errors, rather than surfacing an error banner
  // for what's just a "nice to have" dropdown.
  const { data: dentists = [] } = useQuery({
    queryKey: DENTISTS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/dentists");
      return (res.data.dentists ?? res.data ?? []) as Dentist[];
    },
    staleTime: 5 * 60_000, // dentist list changes rarely, cache longer
    retry: false,
  });

  // ---------------------------------------------------------------------
  // WRITE — edit and delete mutations. Both invalidate every cached
  // dentist-filter variant of the appointments list via the shared base
  // key, so the table stays correct no matter which filter is active.
  // ---------------------------------------------------------------------
  const editMutation = useMutation({
    mutationFn: async (payload: {
      id: number;
      body: Record<string, string>;
    }) => {
      // NOTE: AppointmentController@update currently only validates
      // status/date/time. dentist_id and reason are sent here but will be
      // silently dropped by $request->validate() until the backend rule
      // list is extended to include them.
      const res = await api.put(
        `/appointments/${payload.id}/update`,
        payload.body,
      );
      return res.data.appointment as Appointment;
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE: after a successful edit. Using the base
      // key (not the exact filtered key) invalidates every cached
      // dentist-filter variant of the appointments list in one call.
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_BASE_KEY });
      closeEditModal();
    },
    onError: (err: any) => {
      const validationErrors = err?.response?.data?.errors;
      const firstError = validationErrors
        ? (Object.values(validationErrors)[0] as string[])?.[0]
        : null;
      setEditError(
        firstError ??
          err?.response?.data?.message ??
          "Failed to update appointment.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/appointments/${id}`);
      return id;
    },
    onMutate: (id: number) => setDeletingId(id),
    onSuccess: () => {
      // 👉 invalidateQueries HERE too: after a delete, so the cancelled
      // appointment disappears from the table under every filter.
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_BASE_KEY });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? "Failed to delete appointment.");
    },
    onSettled: () => setDeletingId(null),
  });

  const savingEdit = editMutation.isPending;

  // Fallback dentist list derived from loaded appointments, if the
  // /dentists endpoint isn't available or returned nothing.
  const dentistOptions = useMemo(() => {
    if (dentists.length) return dentists;
    const map = new Map<number, Dentist>();
    appointments.forEach((a) => {
      if (a.dentist) map.set(a.dentist.id, a.dentist);
    });
    return Array.from(map.values());
  }, [dentists, appointments]);

  const patientOptions = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => set.add(a.full_name));
    return Array.from(set).sort();
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((a) => (statusTab === "all" ? true : a.status === statusTab))
      .filter((a) =>
        patientFilter === "all" ? true : a.full_name === patientFilter,
      )
      .filter((a) => (dateFrom ? a.date >= dateFrom : true))
      .filter((a) => (dateTo ? a.date <= dateTo : true))
      .filter((a) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          a.full_name.toLowerCase().includes(q) ||
          a.dentist?.full_name.toLowerCase().includes(q) ||
          a.service?.name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        return dateCompare !== 0 ? dateCompare : b.time.localeCompare(a.time);
      });
  }, [appointments, statusTab, patientFilter, dateFrom, dateTo, search]);

  function handleDelete(id: number) {
    if (!confirm("Cancel and delete this appointment?")) return;
    deleteMutation.mutate(id);
  }

  function handleEdit(appointment: Appointment) {
    setEditingAppointment(appointment);
    setEditError(null);
    setEditForm({
      // Fall back to "pending" if the stored status is "completed", since
      // that value isn't accepted back by the update endpoint's validation.
      status:
        appointment.status === "completed" ? "pending" : appointment.status,
      date: appointment.date,
      time: appointment.time,
      dentist_id: String(appointment.dentist_id),
      reason: appointment.reason ?? "",
    });
  }

  function closeEditModal() {
    setEditingAppointment(null);
    setEditError(null);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAppointment) return;
    setEditError(null);

    editMutation.mutate({
      id: editingAppointment.id,
      body: {
        status: editForm.status,
        date: editForm.date,
        time: editForm.time,
        dentist_id: editForm.dentist_id,
        reason: editForm.reason,
      },
    });
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
                <BreadcrumbPage>Manage Appointments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Manage Appointments
            </h1>
            <p className="text-sm text-muted-foreground">
              View, edit, or cancel any appointment across the clinic
            </p>
          </div>

          {/* Filters */}
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, dentist, or service..."
                className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={dentistFilter}
                onChange={(e) => setDentistFilter(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All dentists</option>
                {dentistOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>

              <select
                value={patientFilter}
                onChange={(e) => setPatientFilter(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All patients</option>
                {patientOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />

              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusTab(tab.value)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                    statusTab === tab.value
                      ? "bg-blue-600 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-hidden rounded-2xl border bg-background shadow-sm">
            {error && (
              <div className="border-b bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                    <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Date</th>
                    <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Patient</th>
                    <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Dentist</th>
                    <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Service</th>
                    <th className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium sm:px-4 sm:py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading appointments...
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading && filteredAppointments.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No appointments match your filters.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filteredAppointments.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-3 sm:px-4 sm:py-3">
                          <div className="font-medium">
                            {formatDate(a.date)}
                          </div>
                          <div className="text-[10px] text-muted-foreground sm:text-xs">
                            {formatTime(a.time)}
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-3">{a.full_name}</td>
                        <td className="px-3 py-3 text-blue-600 sm:px-4 sm:py-3">
                          {a.dentist?.full_name ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-blue-600 sm:px-4 sm:py-3">
                          {a.service?.name ?? "—"}
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize sm:px-2.5 sm:text-xs ${STATUS_STYLES[a.status]}`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 sm:px-4 sm:py-3">
                          <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                            <button
                              onClick={() => handleEdit(a)}
                              className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {a.status !== "cancelled" && (
                              <button
                                onClick={() => handleDelete(a.id)}
                                disabled={deletingId === a.id}
                                className="rounded-xl p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {editingAppointment && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            onClick={closeEditModal}
          >
            <div
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Edit Appointment</h2>
                <button
                  onClick={closeEditModal}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 rounded-xl bg-muted/50 px-4 py-3 text-xs sm:text-sm">
                <p>
                  <span className="font-semibold">Patient:</span>{" "}
                  <span className="text-muted-foreground">
                    {editingAppointment.full_name}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">Service:</span>{" "}
                  <span className="text-muted-foreground">
                    {editingAppointment.service?.name ?? "—"}
                  </span>
                </p>
              </div>

              <form onSubmit={handleEditSubmit} className="flex flex-col gap-3 sm:gap-4">
                {editError && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:text-sm">
                    {editError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium sm:text-sm">
                    Dentist
                  </label>
                  <select
                    value={editForm.dentist_id}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        dentist_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {dentistOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium sm:text-sm">
                      Date
                    </label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, date: e.target.value }))
                      }
                      required
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium sm:text-sm">
                      Time
                    </label>
                    <select
                      value={editForm.time.slice(0, 5)}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, time: e.target.value }))
                      }
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      {buildTimeSlots(editingAppointment.time).map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium sm:text-sm">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        status: e.target.value as EditableStatus,
                      }))
                    }
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium sm:text-sm">
                    Reason for visit
                  </label>
                  <textarea
                    value={editForm.reason}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    rows={3}
                    className="w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
