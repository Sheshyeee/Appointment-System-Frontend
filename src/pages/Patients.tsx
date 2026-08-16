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
import {
  Search,
  Pencil,
  Trash2,
  UserPlus,
  ArrowUpDown,
  X,
  Mail,
  Phone,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "./Usecurrentuser";

// ---------------------------------------------------------------------------
// Types — mirrored from PatientController@index response shape
// ---------------------------------------------------------------------------
interface Patient {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  medical_notes: string | null;
  appointments_count: number;
  last_visit: string | null; // "YYYY-MM-DD" or null if never visited
}

interface PatientFormState {
  name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  address: string;
  medical_notes: string;
  password: string;
}

const EMPTY_FORM: PatientFormState = {
  name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  address: "",
  medical_notes: "",
  password: "",
};

// Single source of truth for the query key so every read/invalidate call
// stays in sync. If you ever add server-side filters/pagination, fold the
// params into this array, e.g. ["patients", { page, search }].
const PATIENTS_QUERY_KEY = ["patients"] as const;

function formatShortDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function avatarUrl(patient: Patient) {
  return `https://picsum.photos/seed/patient-${patient.id}/64/64`;
}

type SortKey = "name" | "last_visit";
type SortDirection = "asc" | "desc";

function getErrorMessage(err: any, fallback: string) {
  const status = err?.response?.status;
  const message =
    err?.response?.data?.message ??
    (status === 401
      ? "Session expired. Please log in again."
      : status === 403
        ? "You don't have permission to do that."
        : fallback);
  return status ? `${message} (${status})` : message;
}

// ---------------------------------------------------------------------------
// Mobile patient card — replaces the table row below md. Tapping the card
// opens the patient (same as clicking a table row); edit/delete stay as
// explicit icon buttons so they don't fight the tap-to-open target.
// ---------------------------------------------------------------------------
function PatientCard({
  patient,
  isAdmin,
  deleting,
  onOpen,
  onEdit,
  onDelete,
}: {
  patient: Patient;
  isAdmin: boolean;
  deleting: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="rounded-2xl border bg-background p-3.5 shadow-sm active:bg-muted/30 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <img
          src={avatarUrl(patient)}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-blue-50"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-blue-700">{patient.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{patient.email}</span>
          </div>
          {patient.phone && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              {patient.phone}
            </div>
          )}
        </div>

        {isAdmin && (
          <div
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onEdit}
              className="rounded-xl p-2 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
              aria-label="Edit patient"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="rounded-xl p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              aria-label="Delete patient"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-3 border-t pt-2.5 text-[10px] text-muted-foreground sm:text-xs">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatShortDate(patient.last_visit)}
        </span>
        <span className="flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" />
          {patient.appointments_count} appts
        </span>
      </div>
    </div>
  );
}

export default function ManagePatients() {
  const { isAdmin } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // READ — cached list fetch. React Query dedupes/caches this under
  // PATIENTS_QUERY_KEY, so re-mounting this page (or any other component
  // that queries the same key) won't refetch until it's stale/invalidated.
  // ---------------------------------------------------------------------
  const {
    data: patients = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: PATIENTS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/patients");
      return (res.data.patients ?? []) as Patient[];
    },
    staleTime: 60_000, // treat cached data as fresh for 60s
  });

  const error = queryError
    ? getErrorMessage(queryError, "Failed to load patients.")
    : null;

  // ---------------------------------------------------------------------
  // WRITE — create/update/delete mutations. Each one invalidates the
  // "patients" query on success, which tells React Query the cache is
  // stale and triggers an automatic refetch for any mounted observers.
  // ---------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post("/patients", payload);
      return res.data.patient as Patient;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_QUERY_KEY });
      closeModal();
    },
    onError: (err: any) => {
      const validationErrors = err?.response?.data?.errors;
      const firstError = validationErrors
        ? (Object.values(validationErrors)[0] as string[])?.[0]
        : null;
      setFormError(
        firstError ?? err?.response?.data?.message ?? "Failed to save patient.",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: Record<string, unknown>;
    }) => {
      const res = await api.put(`/patients/${id}/update`, payload);
      return res.data.patient as Patient;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_QUERY_KEY });
      closeModal();
    },
    onError: (err: any) => {
      const validationErrors = err?.response?.data?.errors;
      const firstError = validationErrors
        ? (Object.values(validationErrors)[0] as string[])?.[0]
        : null;
      setFormError(
        firstError ?? err?.response?.data?.message ?? "Failed to save patient.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/patients/${id}`);
      return id;
    },
    onMutate: (id: number) => setDeletingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PATIENTS_QUERY_KEY });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? "Failed to delete patient.");
    },
    onSettled: () => setDeletingId(null),
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? patients.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.email.toLowerCase().includes(q) ||
            (p.phone ?? "").toLowerCase().includes(q),
        )
      : patients;

    return [...filtered].sort((a, b) => {
      let result = 0;
      if (sortKey === "name") {
        result = a.name.localeCompare(b.name);
      } else {
        if (!a.last_visit && !b.last_visit) result = 0;
        else if (!a.last_visit) return 1;
        else if (!b.last_visit) return -1;
        else result = a.last_visit.localeCompare(b.last_visit);
      }
      return sortDirection === "asc" ? result : -result;
    });
  }, [patients, search, sortKey, sortDirection]);

  function openAddModal() {
    setEditingPatient(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  }

  function openEditModal(patient: Patient) {
    setEditingPatient(patient);
    setForm({
      name: patient.name,
      email: patient.email,
      phone: patient.phone ?? "",
      date_of_birth: patient.date_of_birth ?? "",
      address: patient.address ?? "",
      medical_notes: patient.medical_notes ?? "",
      password: "",
    });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingPatient(null);
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      date_of_birth: form.date_of_birth || null,
      address: form.address || null,
      medical_notes: form.medical_notes || null,
      ...(!editingPatient && form.password ? { password: form.password } : {}),
    };

    if (editingPatient) {
      updateMutation.mutate({ id: editingPatient.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(patient: Patient) {
    if (
      !confirm(
        `Delete ${patient.name}? This cannot be undone and will remove their record permanently.`,
      )
    )
      return;
    deleteMutation.mutate(patient.id);
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "19rem" } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        {/* Desktop trigger/breadcrumb hides below md — Breadcrumb itself
            renders the mobile trigger + avatar, so there's only ever one
            trigger visible at a time. */}
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
                <BreadcrumbPage>Manage Patients</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Manage Patients
              </h1>
              <p className="text-sm text-muted-foreground">
                View, edit, or remove patient records
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={openAddModal}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 sm:rounded-lg sm:px-4"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Patient</span>
              </button>
            )}
          </div>

          {/* Search */}
          <div className="rounded-2xl border bg-background p-3 shadow-sm sm:rounded-xl sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or phone..."
                className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Mobile: sort control, since the table headers (with their
              click-to-sort buttons) are hidden below md */}
            <div className="flex flex-wrap items-center gap-2 md:hidden">
              <span className="text-xs font-medium text-muted-foreground">
                Sort by
              </span>
              <button
                onClick={() => toggleSort("name")}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                  sortKey === "name"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "text-muted-foreground"
                }`}
              >
                Name <ArrowUpDown className="h-3 w-3" />
              </button>
              <button
                onClick={() => toggleSort("last_visit")}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                  sortKey === "last_visit"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "text-muted-foreground"
                }`}
              >
                Last Visit <ArrowUpDown className="h-3 w-3" />
              </button>
            </div>

          {/* Mobile: card list */}
          <div className="flex flex-col gap-3 md:hidden">
            {loading && (
              <div className="rounded-2xl border bg-background py-10 text-center text-sm text-muted-foreground shadow-sm">
                Loading patients...
              </div>
            )}
            {!loading && filteredPatients.length === 0 && (
              <div className="rounded-2xl border bg-background py-10 text-center text-sm text-muted-foreground shadow-sm">
                No patients found.
              </div>
            )}
            {!loading &&
              filteredPatients.map((p) => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  isAdmin={isAdmin}
                  deleting={deletingId === p.id}
                  onOpen={() => navigate(`/patients/${p.id}`)}
                  onEdit={() => openEditModal(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden flex-1 overflow-hidden rounded-xl border bg-background shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">
                      <button
                        onClick={() => toggleSort("name")}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        Name <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Contact</th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        onClick={() => toggleSort("last_visit")}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        Last Visit <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Appts</th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right font-medium">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td
                        colSpan={isAdmin ? 5 : 4}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Loading patients...
                      </td>
                    </tr>
                  )}

                  {!loading && filteredPatients.length === 0 && (
                    <tr>
                      <td
                        colSpan={isAdmin ? 5 : 4}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No patients found.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filteredPatients.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/patients/${p.id}`)}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={avatarUrl(p)}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                            />
                            <span className="font-medium text-blue-700">
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-blue-600">
                            <Mail className="h-3.5 w-3.5" />
                            {p.email}
                          </div>
                          {p.phone && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-blue-600">
                              <Phone className="h-3.5 w-3.5" />
                              {p.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatShortDate(p.last_visit)}
                        </td>
                        <td className="px-4 py-3">{p.appointments_count}</td>
                        {isAdmin && (
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEditModal(p)}
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(p)}
                                disabled={deletingId === p.id}
                                className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Add / Edit modal */}
        {isAdmin && showModal && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            onClick={closeModal}
          >
            <div
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-6 shadow-xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  {editingPatient ? "Edit Patient" : "Add Patient"}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          date_of_birth: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Medical Notes
                  </label>
                  <textarea
                    value={form.medical_notes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        medical_notes: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {!editingPatient && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Password{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional — leave blank to auto-generate)
                      </span>
                    </label>
                    <input
                      type="password"
                      minLength={8}
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}

                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : editingPatient
                        ? "Save Changes"
                        : "Add Patient"}
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