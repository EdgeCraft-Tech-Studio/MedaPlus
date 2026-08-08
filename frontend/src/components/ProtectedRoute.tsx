import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated } from "../lib/session";

/**
 * Gate for any route that requires a logged-in user.
 *
 * This is a client-side UX guard ONLY — it prevents the page from
 * flashing on screen for a logged-out user and redirects instantly
 * without waiting on a network round trip. It is NOT the security
 * boundary; the backend's IsAuthenticated + SessionTokenAuthentication
 * is the real enforcement, since every protected API call is checked
 * server-side regardless of what this component does.
 *
 * isAuthenticated() only checks refresh_expires_at (cheap, synchronous,
 * no network call). It does NOT check whether the access token itself
 * is expired — that's fine, because the api.ts request interceptor
 * transparently refreshes the access token on the first API call this
 * page makes. So: "logged in at all" is decided here; "still has a
 * valid access token this second" is decided by api.ts.
 */
export default function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}