import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Smile } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Header = () => {
  const navigate = useNavigate();

  const googleLoginUrl = `${import.meta.env.VITE_API_URL}/auth/google/redirect`;

  return (
    <header className="sticky top-0 z-50 border-b border-[#0F172A]/[0.06] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo / name only */}
        <a href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B5EF6] text-white">
            <Smile className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-[#0F172A]">
            Bright Smile
          </span>
        </a>

        {/* Just login + book, no nav links */}
        <div className="flex items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                className="text-[14px] font-medium text-[#0F172A]/70 hover:bg-[#0F172A]/5 hover:text-[#0F172A]"
              >
                Log in
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border-[#0F172A]/10 bg-white sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-[#0F172A]">
                  Welcome back
                </DialogTitle>
                <DialogDescription className="text-[#0F172A]/60">
                  Sign in to view and manage your appointments.
                </DialogDescription>
              </DialogHeader>
              <a href={googleLoginUrl} className="w-full">
                <Button
                  type="button"
                  className="w-full bg-[#0F172A] text-white hover:bg-[#0F172A]/90"
                >
                  Continue with Google
                </Button>
              </a>
            </DialogContent>
          </Dialog>

          <Button
            onClick={() => navigate("/book")}
            className="rounded-full bg-[#3B5EF6] px-5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-[#3350D8]"
          >
            Book appointment
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
