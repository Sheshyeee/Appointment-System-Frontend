import type React from "react";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  ArrowLeft,
  Mail,
  Phone,
  User,
  MapPin,
  Save,
  CalendarDays,
  Loader2,
} from "lucide-react";
import api from "@/api/axios";

// ---------------------------------------------------------------------------
// Types — mirrored from PatientController@show response shape
// ---------------------------------------------------------------------------
interface PatientDetailData {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  medical_notes: string | null;
}

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface PatientAppointment {
  id: number;
  service_name: string;
  dentist_name: string;
  date: string; // pre-formatted, e.g. "Tue, Aug 11, 2026"
  date_raw: string; // "YYYY-MM-DD"
  time: string;
  status: AppointmentStatus;
}

// ---------------------------------------------------------------------------
// Query keys — shared shape so this file and ManagePatients.tsx can
// invalidate each other's caches when data overlaps.
// ---------------------------------------------------------------------------
const patientDetailKey = (id: string | number) =>
  ["patients", "detail", id] as const;
const PATIENTS_LIST_KEY = ["patients"] as const; // same key used in ManagePatients.tsx

function avatarUrl(id: number) {
  return `https://picsum.photos/seed/patient-${id}/64/64`;
}

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

function todayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // READ — cached fetch of patient + appointments, keyed per-patient so
  // switching between patient pages doesn't stomp on each other's cache.
  // ---------------------------------------------------------------------
  const {
    data,
    isLoading: loading,
    error: queryErr,
  } = useQuery({
    queryKey: patientDetailKey(id!),
    queryFn: async () => {
      const res = await api.get(`/patients/${id}`);
      return {
        patient: res.data.patient as PatientDetailData,
        appointments: (res.data.appointments ?? []) as PatientAppointment[],
      };
    },
    enabled: !!id,
    staleTime: 60_000, // treat cached data as fresh for 60s
  });

  const patient = data?.patient ?? null;
  const appointments = data?.appointments ?? [];
  const error = queryErr
    ? (queryErr as any)?.response?.status === 403
      ? "You don't have permission to view this patient."
      : (queryErr as any)?.response?.status === 404
        ? "Patient not found."
        : "Failed to load patient details."
    : null;

  const upcoming = useMemo(() => {
    const today = todayKey();
    return appointments
      .filter(
        (a) =>
          a.date_raw >= today &&
          (a.status === "pending" || a.status === "confirmed"),
      )
      .sort((a, b) => a.date_raw.localeCompare(b.date_raw));
  }, [appointments]);

  // ---------------------------------------------------------------------
  // WRITE — saving a note. invalidateQueries lives in onSuccess below.
  // ---------------------------------------------------------------------
  const saveNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await api.post(`/patients/${id}/notes`, { note });
      return res.data.medical_notes as string;
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE: right after the note saves.
      // Refresh this patient's cached detail so the new note shows up...
      queryClient.invalidateQueries({ queryKey: patientDetailKey(id!) });
      // ...and the patients list cache too, in case it ever surfaces notes.
      queryClient.invalidateQueries({ queryKey: PATIENTS_LIST_KEY });
      setNoteText("");
      setNoteError(null);
    },
    onError: (err: any) => {
      setNoteError(err?.response?.data?.message ?? "Failed to save note.");
    },
  });

  function handleSaveNote() {
    if (!noteText.trim()) return;
    saveNoteMutation.mutate(noteText.trim());
  }

  const savingNote = saveNoteMutation.isPending;

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
                <BreadcrumbLink href="/patients">
                  Manage Patients
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{patient?.name ?? "Patient"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading patient...
            </div>
          ) : error || !patient ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-muted-foreground">
                {error ?? "Patient not found."}
              </p>
              <Button variant="outline" onClick={() => navigate("/patients")}>
                Back to Patients
              </Button>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              <button
                type="button"
                onClick={() => navigate("/patients")}
                className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to patients
              </button>

              {/* Profile card */}
              <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start gap-3 sm:gap-4">
                  <img
                    src={avatarUrl(patient.id)}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover sm:h-16 sm:w-16"
                  />
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div>
                      <h1 className="text-lg font-bold sm:text-xl">{patient.name}</h1>
                      <span className="text-xs font-medium text-blue-600 sm:text-sm">
                        Patient ID: p{patient.id}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                        <Mail className="h-3.5 w-3.5" />
                        {patient.email}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                        <Phone className="h-3.5 w-3.5" />
                        {patient.phone ?? "—"}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                        <User className="h-3.5 w-3.5" />
                        DOB: {patient.date_of_birth ?? "—"}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                        <MapPin className="h-3.5 w-3.5" />
                        {patient.address ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {patient.medical_notes && (
                  <div className="mt-3 sm:mt-4">
                    <p className="mb-1 text-xs font-medium sm:text-sm">Medical Notes</p>
                    <div className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground sm:text-sm">
                      {patient.medical_notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Add quick note */}
              <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                <h2 className="mb-2.5 font-semibold text-sm sm:text-base">Add Quick Note</h2>
                {noteError && (
                  <div className="mb-2.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:text-sm">
                    {noteError}
                  </div>
                )}
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note to the patient's medical record..."
                  rows={3}
                  className="w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteText.trim()}
                    className="w-full sm:w-auto"
                  >
                    {savingNote ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Note
                  </Button>
                </div>
              </div>

              {/* Upcoming appointments */}
              <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center gap-2 font-semibold text-sm sm:text-base">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  Upcoming Appointments
                </div>
                {upcoming.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground sm:text-sm">
                    No upcoming appointments.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {upcoming.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-xl border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.service_name}</p>
                          <p className="truncate text-xs text-muted-foreground sm:text-sm">
                            Dr. {a.dentist_name} · {a.time} · {a.date}
                          </p>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Appointment history */}
              <div className="rounded-2xl border bg-background shadow-sm overflow-hidden">
                <h2 className="p-4 pb-3 font-semibold text-sm sm:text-base sm:p-5 sm:pb-3">Appointment History</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                        <th className="px-3 py-2.5 font-medium sm:px-5 sm:py-2">Service</th>
                        <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-5 sm:py-2">Dentist</th>
                        <th className="hidden px-3 py-2.5 font-medium sm:table-cell sm:px-5 sm:py-2">Date</th>
                        <th className="px-3 py-2.5 font-medium sm:px-5 sm:py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-5 py-6 text-center text-muted-foreground"
                          >
                            No appointment history.
                          </td>
                        </tr>
                      ) : (
                        appointments.map((a) => (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="px-3 py-3 font-medium text-blue-700 sm:px-5 sm:py-3">
                              <div className="truncate max-w-[120px] sm:max-w-none">{a.service_name}</div>
                            </td>
                            <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                              Dr. {a.dentist_name}
                            </td>
                            <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                              {a.date}
                            </td>
                            <td className="px-3 py-3 sm:px-5 sm:py-3">
                              <StatusBadge status={a.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
