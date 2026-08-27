import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./lib/leafletFix";

import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";

// Public pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import OtpVerify from "./pages/OtpVerify";

// Existing pages
import App from "./pages/App";
import PitchDetail from "./pages/PitchDetail";

// Admin / Owner
import Admin from "./pages/Admin";
import Owner from "./pages/Owner";

// Main app shell
import Home from "./pages/Home";
import AppShell from "./pages/AppShell";

//Teams
import TeamsPage from "./pages/TeamsPage";
import TeamDashboard from "./pages/TeamDashboard";
import CreateTeam from "./pages/CreateTeam";
import JoinTeam from "./pages/JoinTeam";

// Matches
import MatchesPage from "./pages/MatchesPage";
import MatchDetail from "./pages/MatchDetail";
import MakeMatch from "./pages/MakeMatch";

// Discover
import DiscoverPage from "./pages/DiscoverPage";
import TournamentDetail from "./pages/TournamentDetail";
import CreateTournament from "./pages/CreateTournament";

// Profile
import ProfilePage from "./pages/ProfilePage";
import ChatPage from "./pages/chatPage";
function ChatRoute() {
  const { slug } = useParams();
  return <ChatPage key={slug} />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  
  <React.StrictMode>
    <BrowserRouter>
      <Routes>

        {/* =========================================================
            PUBLIC ROUTES
            No login required
        ========================================================= */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-otp" element={<OtpVerify />} />


        {/* =========================================================
            AUTHENTICATED ROUTES
            Every route inside here requires login
        ========================================================= */}
        <Route element={<ProtectedRoute />}>

          {/* ---------------------------------------------------------
              Team invitation
          --------------------------------------------------------- */}
          <Route path="/join" element={<JoinTeam />} />
          <Route path="/join/:teamId" element={<JoinTeam />} />


          {/* ---------------------------------------------------------
              Full-screen authenticated forms
          --------------------------------------------------------- */}
          
          <Route path="/team/create" element={<CreateTeam />} />
          <Route path="/match/create" element={<MakeMatch />} />
          <Route
            path="/tournaments/create"
            element={<CreateTournament />}
          />


          {/* ---------------------------------------------------------
              Main application shell
              Any authenticated user can access these
          --------------------------------------------------------- */}
          <Route element={<AppShell />}>

            {/* Home */}
            <Route path="/home" element={<Home />} />

            {/* Teams */}
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/teams/:slug" element={<TeamDashboard />} />
            
            <Route path="/chat/:slug" element={<ChatRoute />} />
            {/* Matches */}
            <Route path="/matches" element={<MatchesPage />} />
            <Route
              path="/matches/:matchId"
              element={<MatchDetail />}
            />

            {/* Discover */}
            <Route path="/discover" element={<DiscoverPage />} />
            <Route
              path="/discover/tournaments/:tournamentId"
              element={<TournamentDetail />}
            />

            {/* Profile */}
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/app" element={<App />} /> 
         <Route
            path="/app/pitches/:pitchId"
            element={<PitchDetail />}
          />




         


          {/* =========================================================
              ADMIN ONLY
              Must be logged in AND role must be ADMIN
          ========================================================= */}
          <Route
            element={
              <RoleProtectedRoute allowedRoles={["ADMIN"]} />
            }
          >
            <Route path="/admin" element={<Admin />} />
          </Route>


          {/* =========================================================
              OWNER + ADMIN
              Must be logged in AND role must be OWNER or ADMIN
          ========================================================= */}
          <Route
            element={
              <RoleProtectedRoute
                allowedRoles={["OWNER", "ADMIN"]}
              />
            }
          >
            <Route path="/owner" element={<Owner />} />
          </Route>
          
          </Route>

        </Route>



      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);