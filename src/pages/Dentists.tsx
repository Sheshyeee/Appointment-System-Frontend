import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/api/axios";

interface Dentist {
  id: number;
  full_name: string;
  specialty: string;
  rating: number;
  years_experience: number;
  education: string;
  bio: string;
  appointments_count?: number;
}
interface Staffs {
  id: number;
  name: string;
  email: string;
}

export default function Dentists() {
  const queryClient = useQueryClient();

  // ---- Cached fetches ----
  // Dentists and staff are admin-managed lists that rarely change (only
  // when someone explicitly adds/edits/deletes), so we cache them for 5
  // minutes. Navigating away to another sidebar page and back within that
  // window shows data instantly, no refetch, no loading spinner.
  const { data: dentists = [], isLoading: loadingDentists } = useQuery({
    queryKey: ["dentists"],
    queryFn: async () => {
      const res = await api.get("/dentists");
      return res.data as Dentist[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: staffs = [], isLoading: loadingStaffs } = useQuery({
    queryKey: ["staffs"],
    queryFn: async () => {
      const res = await api.get("/staff");
      return res.data.staffs as Staffs[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const [open, setOpen] = useState(false);
  const [openAddUser, setOpenAddUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dentistSearch, setDentistSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingStaffId, setDeletingStaffId] = useState<number | null>(null);

  const filteredDentists = dentists.filter((d) => {
    const q = dentistSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      d.full_name.toLowerCase().includes(q) ||
      d.specialty?.toLowerCase().includes(q)
    );
  });

  const filteredStaffs = staffs.filter((s) => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  });

  // 👇 One grouped state object for the whole form
  const [formData, setFormData] = useState({
    full_name: "",
    specialty: "",
    rating: "",
    years_experience: "",
    education: "",
    bio: "",
  });

  const [userData, setUserData] = useState({
    name: "",
    email: "",
    role: "staff",
  });

  const [editingDentist, setEditingDentist] = useState<Dentist | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staffs | null>(null);

  // 👇 One handler for every input field
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const handleChangeUser = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingDentist) {
      await api.post("/dentists", formData);
    } else {
      await api.put(`/dentists/${editingDentist.id}/update`, formData);
    }

    resetDentistForm();
    setOpen(false);
    // Invalidate instead of manually refetching — tells React Query the
    // cached "dentists" data is stale, triggering an immediate background
    // refetch since this page is actively displaying it.
    queryClient.invalidateQueries({ queryKey: ["dentists"] });
  };

  const handleSubmitStaff = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      if (!editingStaff) {
        await api.post("/register-user", userData);
      } else {
        await api.put(`/staff/${editingStaff.id}/update`, {
          name: userData.name,
          email: userData.email,
        });
      }

      setUserData({
        name: "",
        email: "",
        role: "staff",
      });
      setEditingStaff(null);
      setOpenAddUser(false);
      queryClient.invalidateQueries({ queryKey: ["staffs"] });
    } finally {
      setLoading(false);
    }
  };

  const handleEditStaff = (id: number) => {
    const selected = staffs.find((s) => s.id === id);
    if (!selected) return;

    setEditingStaff(selected);
    setUserData({
      name: selected.name,
      email: selected.email,
      role: "staff",
    });
    setOpenAddUser(true);
  };

  const handleDeleteStaff = async (id: number) => {
    if (!confirm("Delete this staff member?")) return;
    setDeletingStaffId(id);
    try {
      await api.delete(`/staff/${id}`);
      queryClient.invalidateQueries({ queryKey: ["staffs"] });
    } finally {
      setDeletingStaffId(null);
    }
  };

  const emptyDentistForm = {
    full_name: "",
    specialty: "",
    rating: "",
    years_experience: "",
    education: "",
    bio: "",
  };

  const resetDentistForm = () => {
    setFormData(emptyDentistForm);
    setEditingDentist(null);
  };

  const handleDentistDialogChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetDentistForm();
  };

  const handleEdit = (id: number) => {
    const selectedDentists = dentists.find((d) => d.id === id);
    if (!selectedDentists) return;

    setEditingDentist(selectedDentists);

    setFormData({
      full_name: selectedDentists.full_name,
      specialty: selectedDentists.specialty,
      rating: String(selectedDentists.rating),
      years_experience: String(selectedDentists.years_experience),
      education: selectedDentists.education,
      bio: selectedDentists.bio,
    });

    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this dentist?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/dentists/${id}`);
      queryClient.invalidateQueries({ queryKey: ["dentists"] });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "19rem" } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <div className="hidden items-center gap-2 md:flex">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Dentists</BreadcrumbLink>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Dentists</h1>
              <p className="text-sm text-muted-foreground">
                Manage your dental team
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Dialog open={open} onOpenChange={handleDentistDialogChange}>
                <DialogTrigger
                  render={
                    <Button className="w-full sm:w-auto">
                      Add New Dentist
                    </Button>
                  }
                />

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingDentist ? "Edit Dentist" : "Add New Dentist"}
                  </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      placeholder="Dr. Jane Smith"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Specialty</label>
                    <Input
                      name="specialty"
                      value={formData.specialty}
                      onChange={handleChange}
                      placeholder="General Dentistry"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">
                        Rating (0-5)
                      </label>
                      <Input
                        name="rating"
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={formData.rating}
                        onChange={handleChange}
                        placeholder="4.5"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">
                        Years of Experience
                      </label>
                      <Input
                        name="years_experience"
                        type="number"
                        min="0"
                        value={formData.years_experience}
                        onChange={handleChange}
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Education</label>
                    <Input
                      name="education"
                      value={formData.education}
                      onChange={handleChange}
                      placeholder="DDS, University of..."
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Bio</label>
                    <textarea
                      name="bio"
                      value={formData.bio}
                      onChange={handleChange}
                      placeholder="Short biography..."
                      className="w-full rounded-md border p-2 text-sm"
                      rows={3}
                    />
                  </div>

                  <Button type="submit">Save Dentist</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog
              open={openAddUser}
              onOpenChange={(next) => {
                setOpenAddUser(next);
                if (!next) {
                  setEditingStaff(null);
                  setUserData({
                    name: "",
                    email: "",
                    role: "staff",
                  });
                }
              }}
            >
              <DialogTrigger
                render={<Button variant="outline">Add Staff</Button>}
              />

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingStaff ? "Edit Staff" : "Add New Staff"}
                  </DialogTitle>
                </DialogHeader>

                <form
                  onSubmit={handleSubmitStaff}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      name="name"
                      value={userData.name}
                      onChange={handleChangeUser}
                      placeholder="Dr. Jane Smith"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      name="email"
                      value={userData.email}
                      onChange={handleChangeUser}
                      placeholder="jane@example.com"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Staff sign in with Google using this email — no password
                    needed.
                  </p>

                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : editingStaff ? (
                      "Save Changes"
                    ) : (
                      "Save Staff"
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={dentistSearch}
              onChange={(e) => setDentistSearch(e.target.value)}
              placeholder="Search by name or specialty..."
              className="pl-8"
            />
          </div>
          {/* Tabs: Dentists / Staff */}
          <div>
            <Tabs defaultValue="dentists" className="w-full flex flex-col">
              <TabsList className="w-full">
                <TabsTrigger value="dentists" className="flex-1">Dentists</TabsTrigger>
                <TabsTrigger value="staff" className="flex-1">Staff</TabsTrigger>
              </TabsList>

              {/* Dentists tab */}
              <TabsContent value="dentists" className="flex flex-col gap-3">
                <div className="rounded-2xl border bg-background shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dentist</TableHead>
                        <TableHead className="hidden sm:table-cell">Specialty</TableHead>
                        <TableHead className="hidden sm:table-cell">Rating</TableHead>
                        <TableHead className="hidden sm:table-cell">Appts</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingDentists ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-sm text-muted-foreground py-6"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading dentists...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredDentists.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-sm text-muted-foreground py-6"
                          >
                            {dentists.length === 0
                              ? "No dentists found."
                              : "No dentists match your search."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDentists.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium text-muted-foreground">
                                  {d.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                </div>
                                <span className="truncate max-w-[120px] sm:max-w-none">{d.full_name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">{d.specialty}</TableCell>
                            <TableCell className="hidden sm:table-cell">{d.rating}</TableCell>
                            <TableCell className="hidden sm:table-cell">{d.appointments_count ?? 0}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(d.id)}
                                  className="h-8 px-2 sm:h-9 sm:px-3"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(d.id)}
                                  disabled={deletingId === d.id}
                                  className="h-8 px-2 sm:h-9 sm:px-3"
                                >
                                  {deletingId === d.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Staff tab */}
              <TabsContent value="staff" className="flex flex-col gap-3">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="pl-8"
                  />
                </div>
                <div className="rounded-2xl border bg-background shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">Email</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingStaffs ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-sm text-muted-foreground py-6"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading staff...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredStaffs.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center text-sm text-muted-foreground py-6"
                          >
                            {staffs.length === 0
                              ? "No staff found."
                              : "No staff match your search."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStaffs.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell className="hidden sm:table-cell">{s.email}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditStaff(s.id)}
                                  className="h-8 px-2 sm:h-9 sm:px-3"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteStaff(s.id)}
                                  disabled={deletingStaffId === s.id}
                                  className="h-8 px-2 sm:h-9 sm:px-3"
                                >
                                  {deletingStaffId === s.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}