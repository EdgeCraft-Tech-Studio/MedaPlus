import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./lib/leafletFix";

import RoleProtectedRoute from "./components/RoleProtectedRoute";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import Owner from "./pages/Owner";
import App from "./pages/App";
import PitchDetail from "./pages/PitchDetail";
import OtpVerify from "./pages/OtpVerify";
import Home from "./pages/Home";
import CreateTeam from "./pages/CreateTeam";
import CreateMatch from "./pages/CreateMatch";
import Tournaments from "./pages/Tournaments";
import TeamMembers from "./pages/TeamMembers";
import ProtectedRoute from "./components/ProtectedRoute";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* ── Public routes — no session required ────────────────────── */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<OtpVerify />} />
        <Route path="/home" element={<Home />} />

        {/* ── Protected routes — any authenticated user ───────────────── */}
        <Route element={<ProtectedRoute />}>
          <Route path="/team/create" element={<CreateTeam />} />
          <Route path="/match/create" element={<CreateMatch />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/team/:teamId/members" element={<TeamMembers />} />
          <Route path="/app" element={<App />} />
          <Route path="/app/pitches/:pitchId" element={<PitchDetail />} />
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