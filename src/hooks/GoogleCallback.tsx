import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_HOME: Record<string, string> = {
  admin: "/dashboard/admin",
  staff: "/dashboard/staff",
  patient: "/dashboard/patient",
};

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = searchParams.get("token");
    if (!token) {
      navigate("/login?error=google_auth_failed", { replace: true });
      return;
    }

    loginWithToken(token)
      .then((user) => {
        navigate(ROLE_HOME[user.role] ?? "/", { replace: true });
      })
      .catch(() => {
        navigate("/login?error=google_auth_failed", { replace: true });
      });
  }, []);

  return <p>Signing you in...</p>;
}