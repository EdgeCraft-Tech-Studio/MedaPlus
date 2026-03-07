import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./lib/leafletFix";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Admin from "./pages/Admin";
import Owner from "./pages/Owner";
import App from "./pages/App";
import PitchDetailPlaceholder from "./pages/PitchDetailPlaceholder";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/admin" element={<Admin />} />
        <Route path="/owner" element={<Owner />} />
        <Route path="/app" element={<App />} />
        <Route path="/app/pitches/:pitchId" element={<PitchDetailPlaceholder />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
