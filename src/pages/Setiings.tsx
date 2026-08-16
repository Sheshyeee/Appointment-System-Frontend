import type React from "react";
import { useEffect, useState } from "react";
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
import { Stethoscope, Clock, MapPin, Phone, Mail, Save } from "lucide-react";
import api from "../api/axios";
import { generateHourOptions } from "./TimeOptions";

const HOUR_OPTIONS = generateHourOptions();

const DAYS: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

interface DayHours {
  enabled: boolean;
  open: string | null;
  close: string | null;
}

type WorkingHours = Record<DayKey, DayHours>;

interface ClinicSettings {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  working_hours: WorkingHours;
}

const EMPTY_INFO = { name: "", address: "", phone: "", email: "" };

// Single source of truth for the query key so reads and invalidations
// stay in sync.
const SETTINGS_QUERY_KEY = ["settings"] as const;

export default function Settings() {
  const queryClient = useQueryClient();

  const [info, setInfo] = useState(EMPTY_INFO);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoSaved, setInfoSaved] = useState(false);

  const [hours, setHours] = useState<WorkingHours | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSaved, setHoursSaved] = useState(false);

  // ---------------------------------------------------------------------
  // READ — cached settings fetch. Cached under SETTINGS_QUERY_KEY so
  // revisiting this page doesn't re-trigger a loading state unless the
  // cache is stale or was invalidated by a save.
  // ---------------------------------------------------------------------
  const {
    data: settings,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/settings");
      return res.data.settings as ClinicSettings;
    },
    staleTime: 60_000,
  });

  const error = queryError
    ? (queryError as any)?.response?.status === 403
      ? "You don't have permission to view clinic settings."
      : "Failed to load clinic settings."
    : null;

  // Sync local editable form state whenever fresh settings data arrives
  // (initial load, or a refetch triggered by invalidateQueries below).
  useEffect(() => {
    if (!settings) return;
    setInfo({
      name: settings.name ?? "",
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
    });
    setHours(settings.working_hours);
  }, [settings]);

  // ---------------------------------------------------------------------
  // WRITE — clinic info and working hours are saved via separate
  // endpoints, so they get separate mutations. Each invalidates the same
  // SETTINGS_QUERY_KEY in onSuccess, which is what refreshes the cache
  // (and, through the effect above, the form) after a save.
  // ---------------------------------------------------------------------
  const saveInfoMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_INFO) => {
      await api.put("/settings", payload);
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE: right after clinic info saves.
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      setInfoError(null);
      setInfoSaved(true);
      setTimeout(() => setInfoSaved(false), 2000);
    },
    onError: (err: any) => {
      const validationErrors = err?.response?.data?.errors;
      const firstError = validationErrors
        ? (Object.values(validationErrors)[0] as string[])?.[0]
        : null;
      setInfoError(
        firstError ??
          err?.response?.data?.message ??
          "Failed to save clinic information.",
      );
    },
  });

  const saveHoursMutation = useMutation({
    mutationFn: async (workingHours: WorkingHours) => {
      await api.put("/settings/hours", { working_hours: workingHours });
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE too: right after working hours save.
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      setHoursError(null);
      setHoursSaved(true);
      setTimeout(() => setHoursSaved(false), 2000);
    },
    onError: (err: any) => {
      setHoursError(
        err?.response?.data?.message ?? "Failed to save working hours.",
      );
    },
  });

  const savingInfo = saveInfoMutation.isPending;
  const savingHours = saveHoursMutation.isPending;

  function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    saveInfoMutation.mutate(info);
  }

  function updateDay(day: DayKey, patch: Partial<DayHours>) {
    setHours((prev) => {
      if (!prev) return prev;
      return { ...prev, [day]: { ...prev[day], ...patch } };
    });
  }

  function toggleDay(day: DayKey, enabled: boolean) {
    setHours((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [day]: enabled
          ? { enabled: true, open: "8:00 AM", close: "6:00 PM" }
          : { enabled: false, open: null, close: null },
      };
    });
  }

  function handleSaveHours() {
    if (!hours) return;
    saveHoursMutation.mutate(hours);
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
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage clinic information and working hours
            </p>
          </div>

          {error && (
            <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading settings...
            </div>
          ) : (
            <>
              {/* Clinic Information */}
              <form
                onSubmit={handleSaveInfo}
                className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-blue-600" />
                  <h2 className="font-semibold text-sm sm:text-base">Clinic Information</h2>
                </div>

                {infoError && (
                  <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:text-sm">
                    {infoError}
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium sm:text-sm">
                      Clinic Name
                    </label>
                    <input
                      type="text"
                      required
                      value={info.name}
                      onChange={(e) =>
                        setInfo((f) => ({ ...f, name: e.target.value }))
                      }
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium sm:text-sm">
                      Address
                    </label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={info.address}
                        onChange={(e) =>
                          setInfo((f) => ({ ...f, address: e.target.value }))
                        }
                        className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium sm:text-sm">
                        Phone
                      </label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          value={info.phone}
                          onChange={(e) =>
                            setInfo((f) => ({ ...f, phone: e.target.value }))
                          }
                          className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium sm:text-sm">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                          type="email"
                          value={info.email}
                          onChange={(e) =>
                            setInfo((f) => ({ ...f, email: e.target.value }))
                          }
                          className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingInfo}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {savingInfo
                      ? "Saving..."
                      : infoSaved
                        ? "Saved!"
                        : "Save Changes"}
                  </button>
                </div>
              </form>

              {/* Working Hours */}
              {hours && (
                <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <h2 className="font-semibold text-sm sm:text-base">Working Hours</h2>
                  </div>

                  {hoursError && (
                    <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:text-sm">
                      {hoursError}
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5 sm:gap-3">
                    {DAYS.map(({ key, label }) => {
                      const day = hours[key];
                      return (
                        <div
                          key={key}
                          className="flex flex-col gap-2.5 rounded-xl border p-3 sm:flex-row sm:items-center"
                        >
                          <label className="flex w-full items-center gap-2 sm:w-32 sm:shrink-0">
                            <input
                              type="checkbox"
                              checked={day.enabled}
                              onChange={(e) => toggleDay(key, e.target.checked)}
                              className="h-4 w-4 rounded border-input accent-blue-600"
                            />
                            <span className="text-sm font-medium">{label}</span>
                          </label>

                          {day.enabled ? (
                            <div className="flex flex-1 items-center gap-2">
                              <select
                                value={day.open ?? HOUR_OPTIONS[0]}
                                onChange={(e) =>
                                  updateDay(key, { open: e.target.value })
                                }
                                className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                              >
                                {HOUR_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                              <span className="text-xs text-muted-foreground">
                                to
                              </span>
                              <select
                                value={
                                  day.close ??
                                  HOUR_OPTIONS[HOUR_OPTIONS.length - 1]
                                }
                                onChange={(e) =>
                                  updateDay(key, { close: e.target.value })
                                }
                                className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                              >
                                {HOUR_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span className="flex-1 text-xs text-muted-foreground sm:text-sm">
                              Closed
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleSaveHours}
                      disabled={savingHours}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {savingHours
                        ? "Saving..."
                        : hoursSaved
                          ? "Saved!"
                          : "Save Hours"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
