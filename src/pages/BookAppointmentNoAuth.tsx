import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Star,
  Clock,
  Stethoscope,
  Sparkles,
  Sun,
  Anchor,
  Activity,
  Scissors,
  Crown,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import api from "@/api/axios";
import { useNavigate } from "react-router-dom";
import Header from "@/components/header";

// ---------------- Types ----------------
interface Service {
  id: number;
  name: string;
  description: string;
  price: number;
  duration: number;
  icon: string;
}

interface Dentist {
  id: number;
  full_name: string;
  specialty: string;
  rating: number;
  bio: string;
  avatar_url?: string | null;
}

interface AppointmentResult {
  id: number;
  patient_name: string;
  service_name: string;
  dentist_name: string;
  date: string;
  time: string;
  duration: number;
  price: number;
}

const ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope,
  sparkles: Sparkles,
  sun: Sun,
  anchor: Anchor,
  activity: Activity,
  scissors: Scissors,
  crown: Crown,
};

const STEP_LABELS = [
  "Service",
  "Dentist",
  "Date & Time",
  "Your Details",
  "Confirm",
];

const emptyDetails = { full_name: "", email: "", phone: "", reason: "" };

function generateDateRange(days: number) {
  const out: Date[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function longDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

/**
 * Parses a "9:00 AM" / "6:30 PM" style slot label into minutes since
 * midnight, so it can be compared against the current time.
 */
function timeStringToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3].toUpperCase();

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * A slot is "in the past" only if the selected date is today AND the slot's
 * start time is at or before the current time. Slots on future dates are
 * never considered past.
 */
function isSlotInPast(date: Date | null, time: string): boolean {
  if (!date) return false;

  const now = new Date();
  const isToday = dateKey(date) === dateKey(now);
  if (!isToday) return false;

  const slotMinutes = timeStringToMinutes(time);
  if (slotMinutes === null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes;
}

// ---------------- Stepper ----------------
function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center">
      {STEP_LABELS.map((label, idx) => {
        const step = idx + 1;
        const isDone = step < currentStep;
        const isActive = step === currentStep;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : step}
              </div>
              <span
                className={`text-xs ${isActive ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`mx-2 mb-5 h-[2px] w-16 sm:w-24 ${
                  isDone ? "bg-emerald-500" : "bg-border"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function BookAppointmentNoAuth() {
  // Wizard is now the whole page — it opens automatically, no "Book Now" gate.
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState<AppointmentResult | null>(null);

  // data
  const [services, setServices] = useState<Service[]>([]);
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingDentists, setLoadingDentists] = useState(false);

  // Slots for the currently selected date, as returned by the backend
  // (already filtered to the admin's configured working hours for that day).
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [dayClosed, setDayClosed] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Dates in the 14-day picker that are fully booked OR closed by the admin.
  const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(
    new Set(),
  );
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [loadingDateSummary, setLoadingDateSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // selections
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDentist, setSelectedDentist] = useState<Dentist | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [details, setDetails] = useState(emptyDetails);

  const dateOptions = generateDateRange(14);

  // Load services & dentists as soon as the page mounts
  useEffect(() => {
    fetchServices();
    fetchDentists();
  }, []);

  useEffect(() => {
    if (step === 3 && selectedDentist) {
      fetchDateSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDentist]);

  useEffect(() => {
    if (step === 3 && selectedDentist && selectedDate) {
      fetchAvailableSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDentist, selectedDate]);

  // If a slot was already selected and the clock ticks past its start time
  // while the user is still on this step (e.g. they left the tab open),
  // clear the stale selection instead of letting them continue with a
  // now-invalid time.
  useEffect(() => {
    if (!selectedDate || !selectedTime) return;
    if (isSlotInPast(selectedDate, selectedTime)) {
      setSelectedTime(null);
    }
    const interval = setInterval(() => {
      if (isSlotInPast(selectedDate, selectedTime)) {
        setSelectedTime(null);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedDate, selectedTime]);

  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const res = await api.get("/services");
      setServices(res.data.services ?? res.data);
    } finally {
      setLoadingServices(false);
    }
  };

  const fetchDentists = async () => {
    setLoadingDentists(true);
    try {
      const res = await api.get("/dentists");
      setDentists(res.data.dentists ?? res.data);
    } finally {
      setLoadingDentists(false);
    }
  };

  const fetchDateSummary = async () => {
    if (!selectedDentist) return;
    setLoadingDateSummary(true);
    try {
      const res = await api.get("/appointments/booked-summary", {
        params: {
          dentist_id: selectedDentist.id,
          start_date: dateKey(dateOptions[0]),
          end_date: dateKey(dateOptions[dateOptions.length - 1]),
        },
      });
      const closed: string[] = res.data.closed ?? [];
      const full: string[] = res.data.full ?? [];
      setClosedDates(new Set(closed));
      setFullyBookedDates(new Set([...closed, ...full]));
    } catch {
      setClosedDates(new Set());
      setFullyBookedDates(new Set());
    } finally {
      setLoadingDateSummary(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!selectedDentist || !selectedDate) return;
    setLoadingSlots(true);
    try {
      const res = await api.get("/appointments/available-slots", {
        params: { dentist_id: selectedDentist.id, date: dateKey(selectedDate) },
      });
      setDaySlots(res.data.slots ?? []);
      setBookedSlots(res.data.booked ?? []);
      setDayClosed(Boolean(res.data.closed));
    } catch {
      setDaySlots([]);
      setBookedSlots([]);
      setDayClosed(false);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Resets the wizard back to step 1 (used after a completed booking)
  const resetWizard = () => {
    setStep(1);
    setConfirmed(null);
    setSelectedService(null);
    setSelectedDentist(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setFullyBookedDates(new Set());
    setClosedDates(new Set());
    setDaySlots([]);
    setBookedSlots([]);
    setDayClosed(false);
    setDetails(emptyDetails);
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const goContinue = () => {
    setStep((s) => Math.min(s + 1, 4));
  };

  const canContinue = () => {
    if (step === 1) return !!selectedService;
    if (step === 2) return !!selectedDentist;
    if (step === 3) return !!selectedDate && !!selectedTime;
    return true;
  };

  const handleDetailsChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedDentist || !selectedDate || !selectedTime)
      return;
    setSubmitting(true);
    try {
      const res = await api.post("/appointments", {
        service_id: selectedService.id,
        dentist_id: selectedDentist.id,
        date: dateKey(selectedDate),
        time: selectedTime,
        full_name: details.full_name,
        email: details.email,
        phone: details.phone,
        reason: details.reason,
      });
      setConfirmed(res.data.appointment ?? res.data);
    } finally {
      setSubmitting(false);
    }
  };

  const navigate = useNavigate();

  return (
    <>
      {" "}
      <Header />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
        {confirmed ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-md rounded-2xl border bg-background p-8 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-7 w-7 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold">Appointment Booked!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We've sent a confirmation to your email. The clinic will
                  confirm your slot shortly.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-2 rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium">{confirmed.service_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dentist</span>
                  <span className="font-medium">{confirmed.dentist_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{confirmed.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">{confirmed.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{confirmed.duration}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patient</span>
                  <span className="font-medium">{confirmed.patient_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">
                    ${Number(confirmed.price).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex justify-center gap-3">
                <Button onClick={resetWizard}>
                  <CalendarCheck className="mr-2 h-4 w-4" />
                  Book Another Appointment
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Book an Appointment</h1>
              <p className="text-sm text-muted-foreground">
                Complete the steps below to schedule your visit
              </p>
            </div>

            <Stepper currentStep={step} />

            {/* Step 1: Service */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Select a service</h2>
                {loadingServices ? (
                  <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading services...
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {services.map((s) => {
                      const IconComp = ICONS[s.icon] ?? Stethoscope;
                      const isSelected = selectedService?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedService(s)}
                          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <IconComp className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{s.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {s.description}
                            </span>
                            <div className="mt-1 flex items-center gap-3 text-sm">
                              <span className="font-medium">
                                ${Number(s.price).toFixed(0)}
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                {s.duration >= 60
                                  ? `${Math.floor(s.duration / 60)}h${
                                      s.duration % 60
                                        ? ` ${s.duration % 60}m`
                                        : ""
                                    }`
                                  : `${s.duration}m`}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Dentist */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Choose your dentist</h2>
                {loadingDentists ? (
                  <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading dentists...
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {dentists.map((d) => {
                      const isSelected = selectedDentist?.id === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedDentist(d)}
                          className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {d.avatar_url ? (
                              <img
                                src={d.avatar_url}
                                alt={d.full_name}
                                className="h-11 w-11 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
                                {initials(d.full_name)}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium">{d.full_name}</span>
                              <span className="text-sm text-primary">
                                {d.specialty}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span className="font-medium">{d.rating}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {d.bio}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Date & Time */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Pick a date and time</h2>
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Select a date
                    </p>
                    {loadingDateSummary && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Checking availability...
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {dateOptions.map((d) => {
                      const key = dateKey(d);
                      const isSelected =
                        selectedDate && key === dateKey(selectedDate);
                      const isClosed = closedDates.has(key);
                      const isFull = fullyBookedDates.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={isFull}
                          onClick={() => {
                            setSelectedDate(d);
                            setSelectedTime(null);
                          }}
                          className={`flex flex-col items-center rounded-lg border py-2 text-xs transition-colors ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : isFull
                                ? "cursor-not-allowed border-input bg-muted/50 text-muted-foreground/50 line-through"
                                : "hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className={`uppercase ${
                              isSelected
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
                            }`}
                          >
                            {d.toLocaleDateString("en-US", {
                              weekday: "short",
                            })}
                          </span>
                          <span className="text-base font-semibold">
                            {d.getDate()}
                          </span>
                          <span
                            className={
                              isSelected
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
                            }
                          >
                            {d.toLocaleDateString("en-US", {
                              month: "short",
                            })}
                          </span>
                          {isFull && (
                            <span className="mt-0.5 text-[10px] font-medium text-muted-foreground/70">
                              {isClosed ? "Closed" : "Full"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedDate && (
                  <div className="rounded-xl border p-4">
                    <p className="mb-3 text-sm text-muted-foreground">
                      Available slots for {longDate(selectedDate)}
                    </p>
                    {loadingSlots ? (
                      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking availability...
                      </div>
                    ) : dayClosed || daySlots.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        The clinic is closed on this day. Please pick another
                        date.
                      </p>
                    ) : daySlots.every(
                        (slot) =>
                          bookedSlots.includes(slot) ||
                          isSlotInPast(selectedDate, slot),
                      ) ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No more slots available today. Please pick another
                        date.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                        {daySlots.map((slot) => {
                          const isBooked = bookedSlots.includes(slot);
                          const isPast = isSlotInPast(selectedDate, slot);
                          const isDisabled = isBooked || isPast;
                          const isSelected = selectedTime === slot;
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => setSelectedTime(slot)}
                              title={isPast && !isBooked ? "This time has already passed" : undefined}
                              className={`rounded-lg border py-2 text-sm transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : isDisabled
                                    ? "cursor-not-allowed border-input bg-muted/50 text-muted-foreground/50 line-through"
                                    : "hover:bg-muted/50"
                              }`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Details */}
            {step === 4 && (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4 rounded-xl border p-4">
                  <h2 className="text-lg font-semibold">Your details</h2>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      value={details.full_name}
                      onChange={handleDetailsChange}
                      placeholder="Jane Doe"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={details.email}
                        onChange={handleDetailsChange}
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={details.phone}
                        onChange={handleDetailsChange}
                        placeholder="+1 (555) 123-4567"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reason">Reason for visit (optional)</Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      value={details.reason}
                      onChange={handleDetailsChange}
                      placeholder="Describe your symptoms or reason for the visit"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex h-fit flex-col gap-2 rounded-xl border bg-muted/30 p-4 text-sm">
                  <p className="mb-1 text-muted-foreground">
                    Appointment Summary
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service</span>
                    <span className="font-medium">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dentist</span>
                    <span className="font-medium">
                      {selectedDentist?.full_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">
                      {selectedDate && longDate(selectedDate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">{selectedTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-medium">
                      ${Number(selectedService?.price ?? 0).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={goBack}
                disabled={submitting || step === 1}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              {step < 4 ? (
                <Button onClick={goContinue} disabled={!canContinue()}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmBooking}
                  disabled={
                    submitting ||
                    !details.full_name ||
                    !details.email ||
                    !details.phone
                  }
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Confirm Booking
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}