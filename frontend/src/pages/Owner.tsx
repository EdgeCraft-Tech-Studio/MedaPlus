import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me } from "../lib/auth";
import type { Pitch } from "../lib/pitches";
import { createPitch, listPitches } from "../lib/pitches";
import AddButton from "../components/AddButton";
import PitchWizardModal from "../components/PitchWizardModal";

export default function Owner() {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setLoading(true);
      setMsg("");
      const u = await me();
      setUser(u);
      const data = await listPitches();
      setPitches(data);
    } catch {
      setMsg("Failed to load owner data. Check API / token.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const isApproved = !!user?.is_approved;

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Owner Dashboard</h2>

        <div
          style={{
            opacity: isApproved ? 1 : 0.5,
            pointerEvents: isApproved ? "auto" : "none",
          }}
        >
          <AddButton
            onClick={() => setOpenAdd(true)}
            title={isApproved ? "Add Pitch" : "Waiting for admin approval"}
          />
        </div>
      </div>

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
          You can log in, but your pitches will not appear to players until the
          admin approves your account and your pitches.
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <PitchWizardModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSubmit={async (payload) => {
          await createPitch(payload);
          setMsg("Pitch created (pending admin approval).");
          setOpenAdd(false);
          await refresh();
        }}
      />

      <hr style={{ margin: "18px 0" }} />

      <h3>My Pitches</h3>

      {loading ? <p>Loading pitches...</p> : null}
      {!loading && pitches.length === 0 ? <p>No pitches yet.</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 760 }}>
        {pitches.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/app/pitches/${p.id}`)}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              cursor: "pointer",
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
              <div>
                Status:{" "}
                <b style={{ color: p.is_approved ? "green" : "#b00020" }}>
                  {p.is_approved ? "Approved" : "Pending"}
                </b>
              </div>
            </div>

            <div style={{ color: "#555", marginTop: 6 }}>{p.address || "—"}</div>

            <div style={{ marginTop: 8, fontSize: 14 }}>
              Hourly: {p.hourly_price} | Weekly: {p.weekly_price} | Monthly:{" "}
              {p.monthly_price}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Working hours: {p.opening_time_label} - {p.closing_time_label}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Dressing room: {p.has_dressing_room ? "Yes" : "No"} | Showers:{" "}
              {p.has_showers ? "Yes" : "No"} | Parking:{" "}
              {p.has_parking ? "Yes" : "No"} | Lighting:{" "}
              {p.has_lighting ? "Yes" : "No"}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Other services: {p.other_services || "—"}
            </div>

            {p.cover_image_url ? (
              <div style={{ marginTop: 12 }}>
                <img
                  src={p.cover_image_url}
                  alt={p.name}
                  style={{
                    width: 220,
                    maxWidth: "100%",
                    height: 140,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #eee",
                    display: "block",
                  }}
                />
              </div>
            ) : null}

            <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
              Click card to open slot table and manage bookings.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
