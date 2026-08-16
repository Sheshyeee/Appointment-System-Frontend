import React, { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  Save,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import api from "@/api/axios";

interface ProfileData {
  id: number;
  name: string;
  email: string;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  medical_notes: string | null;
}

// ---------------- Profile cache ----------------
// Module-level so it survives unmount/remount when navigating away from and
// back to this page within the same session. Stale-while-revalidate shows
// the cached profile instantly while quietly confirming it's current.
const CACHE_TTL_MS = 60_000; // 1 minute

interface ProfileCacheEntry {
  data: ProfileData;
  timestamp: number;
}

let profileCache: ProfileCacheEntry | null = null;

function isCacheFresh(entry: ProfileCacheEntry | null) {
  return !!entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
}

function formToState(data: ProfileData) {
  return {
    name: data.name ?? "",
    email: data.email ?? "",
    date_of_birth: data.date_of_birth ?? "",
    phone: data.phone ?? "",
    address: data.address ?? "",
    medical_notes: data.medical_notes ?? "",
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatLastUpdated(ts: number | null) {
  if (!ts) return null;
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(
    () => profileCache?.data ?? null,
  );
  const [form, setForm] = useState(() =>
    profileCache
      ? formToState(profileCache.data)
      : formToState({} as ProfileData),
  );

  const [loading, setLoading] = useState(
    () => !isCacheFresh(profileCache) && profileCache === null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(
    () => profileCache?.timestamp ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    setError(null);

    // Fresh cache and no forced refresh: skip the network call entirely.
    if (!force && isCacheFresh(profileCache)) {
      setProfile(profileCache!.data);
      setForm(formToState(profileCache!.data));
      setLastUpdated(profileCache!.timestamp);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate: show whatever we have while refetching quietly.
    const hasCachedData = profileCache !== null;
    if (hasCachedData) {
      setProfile(profileCache!.data);
      setForm(formToState(profileCache!.data));
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.get("/profile");
      const data: ProfileData = res.data.user ?? res.data;
      const timestamp = Date.now();
      profileCache = { data, timestamp };
      setProfile(data);
      setForm(formToState(data));
      setLastUpdated(timestamp);
    } catch {
      // Only surface the error if we had nothing cached to fall back on.
      if (!hasCachedData) {
        setError("We couldn't load your profile.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.put("/profile", form);
      const data: ProfileData = res.data.user ?? res.data;
      const timestamp = Date.now();
      profileCache = { data, timestamp };
      setProfile(data);
      setLastUpdated(timestamp);
      setSaved(true);
    } catch (err: any) {
      const message =
        err?.response?.data?.errors &&
        Object.values(err.response.data.errors).flat().join(" ");
      setError(message || "We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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
                <BreadcrumbPage>My Profile</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          <div className="flex flex-col gap-3 sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">My Profile</h1>
              <p className="text-sm text-muted-foreground">
                View and update your personal information
              </p>
            </div>
            {!loading && profile && (
              <button
                type="button"
                onClick={() => fetchProfile({ force: true })}
                disabled={refreshing}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
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

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading profile...
            </div>
          ) : !profile ? (
            <div className="py-16 text-center text-muted-foreground">
              {error ?? "Profile not found."}
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
              <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
                {/* Header */}
                <div className="flex items-center gap-3 border-b pb-4 sm:gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary sm:h-16 sm:w-16 sm:text-lg">
                    {initials(profile.name || "?")}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold sm:text-lg">
                      {profile.name}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground sm:text-sm">
                      {profile.email}
                    </p>
                    <p className="text-xs font-medium text-primary sm:text-sm">
                      Patient ID: p{profile.id}
                    </p>
                  </div>
                </div>

                {/* Form */}
                <div className="grid gap-3 py-4 sm:gap-4 sm:py-6 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name"
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        className="pl-9"
                        placeholder="Jane Doe"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                    <Input
                      id="date_of_birth"
                      name="date_of_birth"
                      type="date"
                      value={form.date_of_birth ?? ""}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        className="pl-9"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="phone"
                        name="phone"
                        value={form.phone ?? ""}
                        onChange={handleChange}
                        className="pl-9"
                        placeholder="+1 (555) 100-2000"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="address"
                        name="address"
                        value={form.address ?? ""}
                        onChange={handleChange}
                        className="pl-9"
                        placeholder="100 Main St, Springfield, IL"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="medical_notes">Medical Notes</Label>
                    <Textarea
                      id="medical_notes"
                      name="medical_notes"
                      value={form.medical_notes ?? ""}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Allergies, ongoing conditions, etc."
                    />
                  </div>
                </div>

                {error && (
                  <p className="mb-3 text-sm text-destructive">{error}</p>
                )}

                <div className="flex items-center justify-end gap-3">
                  {saved && (
                    <span className="text-sm text-emerald-600">Saved!</span>
                  )}
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>

              {/* Privacy note */}
              <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3 sm:p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 sm:h-9 sm:w-9">
                  <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-sky-900">
                    Your medical information is private
                  </p>
                  <p className="text-xs text-sky-700 sm:text-sm">
                    Only you and your dental care team can view your medical
                    notes and appointment history.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
