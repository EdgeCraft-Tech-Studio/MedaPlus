import { useEffect, useState } from "react";
import { me } from "../lib/auth";
import type { Pitch } from "../lib/pitches";
import { createPitch, listPitches } from "../lib/pitches";
import AddButton from "../components/AddButton";
import PitchWizardModal from "../components/PitchWizardModal";

export default function Owner() {
  const [user, setUser] = useState<any>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");
  const [openAdd, setOpenAdd] = useState(false);

  async function refresh() {
    try {
      const u = await me();
      setUser(u);

      // listPitches() already filters by role in backend:
      // OWNER sees only their own pitches
      setPitches(await listPitches());
    } catch {
      setMsg("Failed to load owner data. Check API / token.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const isApproved = !!user?.is_approved;

  return (
    <div style={{ padding: 24 }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Owner Dashboard</h2>

        {/* Disable add if owner not approved */}
        <div style={{ opacity: isApproved ? 1 : 0.5, pointerEvents: isApproved ? "auto" : "none" }}>
          <AddButton onClick={() => setOpenAdd(true)} title={isApproved ? "Add Pitch" : "Waiting for admin approval"} />
        </div>
      </div>

      {/* Status */}
      {user && (
        <p style={{ marginTop: 12 }}>
          Account status:{" "}
          <b style={{ color: isApproved ? "green" : "#b00020" }}>
            {isApproved ? "Approved" : "Pending (admin approval required)"}
          </b>
        </p>
      )}

      {!isApproved && (
        <p style={{ color: "#666", marginTop: 8 }}>
          You can log in, but your pitches will not appear to players until the admin approves your account and your pitches.
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {/* Add Pitch Wizard */}
      <PitchWizardModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSubmit={async (payload) => {
          // Owner creates pitch under their tenant automatically in backend.
          await createPitch(payload);
          setMsg("Pitch created (pending admin approval).");
          await refresh();
        }}
      />

      <hr style={{ margin: "18px 0" }} />

      {/* My pitches */}
      <h3>My Pitches</h3>
      {pitches.length === 0 ? <p>No pitches yet.</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
        {pitches.map((p) => (
          <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <div>
                Status:{" "}
                <b style={{ color: p.is_approved ? "green" : "#b00020" }}>
                  {p.is_approved ? "Approved" : "Pending"}
                </b>
              </div>
            </div>

            <div style={{ color: "#555", marginTop: 6 }}>{p.address || "—"}</div>

            <div style={{ marginTop: 8, fontSize: 14 }}>
              Hourly: {p.hourly_price} | Weekly: {p.weekly_price} | Monthly: {p.monthly_price}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Dressing room: {p.has_dressing_room ? "Yes" : "No"} | Showers: {p.has_showers ? "Yes" : "No"} | Parking:{" "}
              {p.has_parking ? "Yes" : "No"} | Lighting: {p.has_lighting ? "Yes" : "No"}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Other services: {p.other_services || "—"}
            </div>

            <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
              Location: {p.latitude}, {p.longitude}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
