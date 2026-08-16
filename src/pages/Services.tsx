import React, { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Pencil,
  Trash2,
  Stethoscope,
  Sparkles,
  Sun,
  Anchor,
  Activity,
  Scissors,
  Crown,
  Clock,
  CalendarCheck,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "@/api/axios";

interface Service {
  id: number;
  name: string;
  description: string;
  price: number;
  duration: number;
  icon: string;
  appointments_count?: number;
}

// 👇 Maps the stored icon key (string, saved to backend) to its Lucide component
const ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope,
  sparkles: Sparkles,
  sun: Sun,
  anchor: Anchor,
  activity: Activity,
  scissors: Scissors,
  crown: Crown,
};

const ICON_KEYS = Object.keys(ICONS);

const emptyForm = {
  name: "",
  description: "",
  price: "",
  duration: "",
  icon: "stethoscope",
};

// Single source of truth for the query key so reads and invalidations stay
// in sync.
const SERVICES_QUERY_KEY = ["services"] as const;

export default function Services() {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // READ — cached list fetch. Cached under SERVICES_QUERY_KEY so
  // switching pages and coming back doesn't re-trigger a loading spinner
  // unless the cache is actually stale.
  // ---------------------------------------------------------------------
  const {
    data: services = [],
    isLoading: fetching,
    error: queryError,
  } = useQuery({
    queryKey: SERVICES_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get("/services");
      return (res.data.services ?? res.data ?? []) as Service[];
    },
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------
  // WRITE — create/update/delete mutations. Every one invalidates the
  // "services" query in onSuccess, which is what triggers React Query to
  // refetch and keep the grid in sync after any change.
  // ---------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      id: number | null;
      body: {
        name: string;
        description: string;
        price: number;
        duration: number;
        icon: string;
      };
    }) => {
      if (payload.id) {
        const res = await api.put(
          `/services/${payload.id}/update`,
          payload.body,
        );
        return res.data.service as Service;
      }
      const res = await api.post("/services", payload.body);
      return res.data.service as Service;
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE: right after a create or update succeeds,
      // so the grid re-fetches and reflects the change.
      queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY });
      resetForm();
      setOpen(false);
    },
    onError: (err: any) => {
      const validationErrors = err?.response?.data?.errors;
      const firstError = validationErrors
        ? (Object.values(validationErrors)[0] as string[])?.[0]
        : null;
      setFormError(
        firstError ?? err?.response?.data?.message ?? "Failed to save service.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/services/${id}`);
      return id;
    },
    onSuccess: () => {
      // 👉 invalidateQueries HERE too: after a delete, so the removed
      // service disappears from the cached list.
      queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? "Failed to delete service.");
    },
  });

  const error = queryError ? "Failed to load services." : null;
  const saving = saveMutation.isPending;
  // Track which card's delete is in flight so only that button spins/disables,
  // instead of freezing every delete button in the grid at once.
  const deletingId = deleteMutation.isPending
    ? (deleteMutation.variables as number)
    : null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectIcon = (icon: string) => {
    setFormData((prev) => ({ ...prev, icon }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingService(null);
    setFormError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const handleAdd = () => {
    resetForm();
    setOpen(true);
  };

  const handleEdit = (id: number) => {
    const selected = services.find((s) => s.id === id);
    if (!selected) return;

    setEditingService(selected);
    setFormError(null);
    setFormData({
      name: selected.name,
      description: selected.description ?? "",
      price: String(selected.price),
      duration: String(selected.duration),
      icon: selected.icon || "stethoscope",
    });
    setOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this service?")) return;
    deleteMutation.mutate(id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const body = {
      name: formData.name,
      description: formData.description,
      price: Number(formData.price),
      duration: Number(formData.duration),
      icon: formData.icon,
    };

    saveMutation.mutate({ id: editingService?.id ?? null, body });
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
                <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Services</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-5 p-4 pt-0 sm:gap-6">
          {/* Page title + primary action live in one row, matching the rest
              of the admin app. On mobile the button drops below the title
              and goes full width instead of squeezing onto the same line. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                Services
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage the treatments and pricing patients can book
              </p>
            </div>

            <Dialog open={open} onOpenChange={handleOpenChange}>
              <DialogTrigger
                render={
                  <Button onClick={handleAdd} className="w-full sm:w-auto">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add New Service
                  </Button>
                }
              />

              <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingService ? "Edit Service" : "Add New Service"}
                  </DialogTitle>
                </DialogHeader>

                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4"
                >
                  {formError && (
                    <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:text-sm">
                      {formError}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name" className="text-xs sm:text-sm">
                      Service Name
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Routine Checkup"
                      required
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="description"
                      className="text-xs sm:text-sm"
                    >
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="Service description..."
                      rows={3}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="price" className="text-xs sm:text-sm">
                        Price ($)
                      </Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price}
                        onChange={handleChange}
                        placeholder="95"
                        required
                        className="rounded-xl"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="duration" className="text-xs sm:text-sm">
                        Duration (minutes)
                      </Label>
                      <Input
                        id="duration"
                        name="duration"
                        type="number"
                        min="0"
                        value={formData.duration}
                        onChange={handleChange}
                        placeholder="30"
                        required
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="text-xs sm:text-sm">Icon</Label>
                    {/* A fixed grid instead of flex-wrap keeps icon buttons
                        evenly sized and aligned at every viewport, including
                        very narrow phones, instead of wrapping raggedly. */}
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                      {ICON_KEYS.map((key) => {
                        const IconComp = ICONS[key];
                        const isSelected = formData.icon === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleSelectIcon(key)}
                            aria-label={key}
                            aria-pressed={isSelected}
                            className={`flex h-11 w-full items-center justify-center rounded-xl border transition-colors sm:h-10 ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <IconComp className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleOpenChange(false)}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="w-full sm:w-auto"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : editingService ? (
                        "Save Changes"
                      ) : (
                        "Add Service"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {error && (
            <div className="rounded-xl border bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {fetching ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading services...
            </div>
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">No services yet</p>
                <p className="text-xs text-muted-foreground">
                  Add your first service so patients can start booking.
                </p>
              </div>
              <Button size="sm" onClick={handleAdd}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add New Service
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {services.map((s) => {
                const IconComp = ICONS[s.icon] ?? Stethoscope;
                const isDeleting = deletingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2.5 rounded-2xl border bg-background p-3.5 shadow-sm sm:gap-3 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-muted-foreground">
                        <IconComp className="h-4 w-4" />
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary sm:px-2.5 sm:py-1 sm:text-xs">
                        <CalendarCheck className="h-3 w-3" />
                        {s.appointments_count ?? 0} appointment
                        {s.appointments_count === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {s.name}
                      </span>
                      <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                        {s.description || "No description provided."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <span className="font-medium">
                        ${Number(s.price).toFixed(2)}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {s.duration} min
                      </span>
                    </div>

                    <div className="mt-1 flex gap-1.5 border-t pt-2.5 sm:gap-2 sm:pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-xs sm:h-9 sm:text-sm"
                        onClick={() => handleEdit(s.id)}
                        disabled={isDeleting}
                      >
                        <Pencil className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Delete service"
                        disabled={isDeleting}
                        onClick={() => handleDelete(s.id)}
                        className="h-8 w-8 shrink-0 p-0 sm:h-9 sm:w-auto sm:px-3"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" />
                        ) : (
                          <Trash2 className="h-3 w-3 text-destructive sm:h-3.5 sm:w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}