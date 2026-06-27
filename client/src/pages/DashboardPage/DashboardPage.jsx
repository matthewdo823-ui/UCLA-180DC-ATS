import { useAuth } from "../../auth/AuthContext";
import { isAdminRole } from "../../utils/auth";
import AdminDashboard from "./AdminDashboard";
import GraderDashboard from "./GraderDashboard";

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <GraderDashboard />;
}
