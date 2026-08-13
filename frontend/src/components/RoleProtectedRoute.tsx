import { Navigate, Outlet } from "react-router-dom";
import {
  isAuthenticated,
  getCurrentUser,
} from "../lib/session";

type Role = "ADMIN" | "OWNER" | "PLAYER";

interface RoleProtectedRouteProps {
  allowedRoles: Role[];
}

export default function RoleProtectedRoute({
  allowedRoles,
}: RoleProtectedRouteProps) {
  // First: user must be logged in
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Second: get logged-in user
  const user = getCurrentUser();

  // Third: check role
  const role = user?.role as Role | undefined;

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}