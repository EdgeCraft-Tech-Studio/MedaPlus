import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./lib/leafletFix";

import RoleProtectedRoute from "./components/RoleProtectedRoute";
import ProtectedRoute from "./components/ProtectedRoute";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import Owner from "./pages/Owner";
import App from "./pages/App";
import PitchDetail from "./pages/PitchDetail";
import OtpVerify from "./pages/OtpVerify";

// New pages from this build
import Home from "./pages/Home";
import AppShell from "./pages/AppShell";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* ── Public routes — no session required ────────────────────── */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<OtpVerify />} />

        {/* ── Main app shell — top nav / bottom tabs + notifications ──── */}
        <Route element={<AppShell />}>
          <Route path="/home" element={<Home />} />
        </Route>

        {/* ── Your existing pages (unchanged) ─────────────────────────── */}
        <Route path="/app" element={<App />} />
        <Route path="/app/pitches/:pitchId" element={<PitchDetail />} />

        {/* ── Protected routes — any authenticated user ───────────────── */}
        <Route element={<ProtectedRoute />}>
        </Route>

        {/* ── Admin-only route ─────────────────────────────────────────── */}
        <Route element={<RoleProtectedRoute allowedRoles={["ADMIN"]} />}>
          <Route path="/admin" element={<Admin />} />
        </Route>

        {/* ── Owner-only route (admins can also access it) ───────────── */}
        <Route element={<RoleProtectedRoute allowedRoles={["OWNER", "ADMIN"]} />}>
          <Route path="/owner" element={<Owner />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);