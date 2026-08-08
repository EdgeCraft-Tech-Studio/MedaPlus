// components/RoleProtectedRoute.tsx
import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated, getCurrentUser } from "../lib/session";

export default function RoleProtectedRoute({
  allowedRoles,
}: {
  allowedRoles: Array<"ADMIN" | "OWNER" | "PLAYER">;
}) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = getCurrentUser();
  const role = user?.role;

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}