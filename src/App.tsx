import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Register from "./pages/Register";
import Dashboard from "./pages/staff/Dashboard";
import Dentists from "./pages/Dentists";
import Services from "./pages/Services";
import BookAppointment from "./pages/patient/Book-appointment";
import MyAppointments from "./pages/patient/My-appointments";
import AppointmentDetail from "./pages/patient/Detail-appointment";
import History from "./pages/patient/History";
import Profile from "./pages/patient/Profile";
import AllAppointments from "./pages/All-appointments";
import ManagePatients from "./pages/Patients";
import Settings from "./pages/Setiings";
import AppoinmentsStaff from "./pages/staff/Appointments";
import PatientDetail from "./pages/PatientDetails";
import PatientDashboard from "./pages/patient/PatientDashboard";
import AdminDashboard from "./pages/Dashboard";
import LandingPage from "./pages/LandingPage";
import BookAppointmentNoAuth from "./pages/BookAppointmentNoAuth";
import GoogleCallback from "./hooks/GoogleCallback";

function Unauthorized() {
  return <h2>403 - You don't have access to this page</h2>;
}

// NOTE: these string literals must exactly match `user.role` values coming
// back from /me. Keep this list in sync with the backend's `role:` middleware
// checks in routes/api.php — that's the real enforcement, this is UX/defense
// in depth so a patient can't even load the shell of an admin page.
const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  PATIENT: "patient",
} as const;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/register" element={<Register />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/book" element={<BookAppointmentNoAuth />} />
          <Route path="/login/google/callback" element={<GoogleCallback />} />

          {/* Any logged-in user, any role */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard/staff" element={<Dashboard />} />
            <Route path="/dashboard/patient" element={<PatientDashboard />} />
            <Route path="/dashboard/admin" element={<AdminDashboard />} />
          </Route>

          {/* Admin only */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]} />}>
            <Route path="/dentists" element={<Dentists />} />
            <Route path="/services" element={<Services />} />
            <Route path="/all-appointments" element={<AllAppointments />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Staff + Admin */}
          <Route
            element={
              <ProtectedRoute allowedRoles={[ROLES.STAFF, ROLES.ADMIN]} />
            }
          >
            <Route path="/patients" element={<ManagePatients />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/appoinments-staff" element={<AppoinmentsStaff />} />
          </Route>

          {/* Patient only */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.PATIENT]} />}>
            <Route path="/appointments" element={<MyAppointments />} />
            <Route path="/book-appointments" element={<BookAppointment />} />
            <Route path="/appointments/:id" element={<AppointmentDetail />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
