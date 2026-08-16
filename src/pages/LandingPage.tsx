import React from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  ShieldCheck,
  FileText,
  Users,
} from "lucide-react";
import Header from "@/components/header";

const SERVICES = [
  "Check-up & cleaning",
  "Whitening",
  "Braces consult",
  "Emergency visit",
];

// Static, descriptive — no per-user or fetched data, so nothing here
// depends on a backend to be true.
const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Same-day openings",
    text: "Real chairtime, not a queue — most days have a slot free within hours.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent pricing",
    text: "Every service is priced upfront, before you ever sit in the chair.",
  },
  {
    icon: FileText,
    title: "Your records, always on hand",
    text: "X-rays, plans, and visit summaries kept in one place you can revisit.",
  },
  {
    icon: Users,
    title: "Dentists you choose",
    text: "Pick who treats you and stick with them, visit after visit.",
  },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [service, setService] = React.useState(SERVICES[0]);

  return (
    <div className="min-h-screen bg-white text-[#0F172A]">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[#3B5EF6] opacity-[0.06] blur-[100px]" />

        <div className="relative mx-auto max-w-2xl px-6 pt-24 pb-16 text-center">
          <h1 className="text-[38px] font-semibold leading-[1.15] tracking-tight text-[#0F172A] sm:text-[48px]">
            Dental care that's
            <br />
            easy to say yes to
          </h1>

          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#0F172A]/55">
            Pick a service, see what's open, and book in under a minute — no
            phone calls, no waiting on hold.
          </p>

          <div className="mx-auto mt-8 flex max-w-lg flex-col gap-2.5 rounded-2xl border border-[#0F172A]/10 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center">
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full appearance-none rounded-xl bg-transparent px-4 py-2.5 text-[14px] text-[#0F172A] outline-none sm:w-auto sm:flex-1"
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button
              onClick={() => navigate("/book")}
              className="w-full shrink-0 rounded-xl bg-[#3B5EF6] px-5 py-5 text-[14px] font-medium text-white hover:bg-[#3350D8] sm:w-auto"
            >
              Check availability
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
          <p className="mt-3 text-[12.5px] text-[#0F172A]/40">
            No account needed · Free first consultation
          </p>
        </div>

        {/* Feature cards — plain text, no simulated user data */}
        <div className="relative mx-auto grid max-w-4xl grid-cols-1 gap-4 px-6 pb-24 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-2xl border border-[#0F172A]/8 bg-white p-5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#3B5EF6]/10 text-[#3B5EF6]">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                  {title}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[#0F172A]/55">
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
