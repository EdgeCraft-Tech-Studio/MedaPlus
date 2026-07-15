import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Pitch } from "../lib/pitches";
import AddButton from "../components/AddButton";
import PitchWizardModal from "../components/PitchWizardModal";
import {
  approveOwner,
  approvePitch,
  createPitch,
  listOwners,
  listPendingOwners,
  listPendingPitches,
  listPitches,
  updatePitch,
} from "../lib/pitches";

type OwnerRow = {
  id: string;
  username: string;
  email: string;
  is_approved: boolean;
};

export default function Admin() {
  const navigate = useNavigate();

  const [pendingOwners, setPendingOwners] = useState<
    Array<{ id: string; username: string; email: string }>
  >([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [pendingPitches, setPendingPitches] = useState<Pitch[]>([]);
  const [allPitches, setAllPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editingPitch, setEditingPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setLoading(true);
      setMsg("");

      const [po, o, pp, ap] = await Promise.all([
        listPendingOwners(),
        listOwners(),
        listPendingPitches(),
        listPitches(), // admin sees all pitches
      ]);

      setPendingOwners(po);
      setOwners(o);
      setPendingPitches(pp);
      setAllPitches(ap);
    } catch {
      setMsg("Failed to load admin data. Check API / token.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onApproveOwner(id: string) {
    setMsg("");
    try {
      await approveOwner(id);
      setMsg("Owner approved.");
      await refresh();
    } catch {
      setMsg("Failed to approve owner.");
    }
  }

  async function onApprovePitch(id: string) {
    setMsg("");
    try {
      const res = await approvePitch(id);
      setMsg(res?.ok ? "Pitch approved." : "Could not approve pitch.");
      await refresh();
    } catch {
      setMsg("Failed to approve pitch.");
    }
  }

  function goToPitch(pitchId: string) {
    navigate(`/app/pitches/${pitchId}`);
  }

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
        <h2 style={{ margin: 0 }}>Admin</h2>
        <AddButton onClick={() => setOpenAdd(true)} />
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <PitchWizardModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        isAdmin={true}
        owners={owners}
        onSubmit={async (payload) => {
          await createPitch(payload);
          setMsg("Pitch created (pending approval).");
          setOpenAdd(false);
          await refresh();
        }}
      />

      <PitchWizardModal
        open={!!editingPitch}
        onClose={() => setEditingPitch(null)}
        isAdmin={true}
        owners={owners}
        mode="edit"
        initialData={
          editingPitch
            ? {
                id: editingPitch.id,
                name: editingPitch.name,
                address: editingPitch.address,
                latitude: editingPitch.latitude,
                longitude: editingPitch.longitude,
                opening_time: editingPitch.opening_time,
                closing_time: editingPitch.closing_time,
                hourly_price: editingPitch.hourly_price,
                weekly_price: editingPitch.weekly_price,
                monthly_price: editingPitch.monthly_price,
                min_hours: editingPitch.min_hours,
                allow_hourly: editingPitch.allow_hourly,
                allow_weekly: editingPitch.allow_weekly,
                allow_monthly: editingPitch.allow_monthly,
                has_dressing_room: editingPitch.has_dressing_room,
                has_showers: editingPitch.has_showers,
                has_parking: editingPitch.has_parking,
                has_lighting: editingPitch.has_lighting,
                other_services: editingPitch.other_services,
              }
            : undefined
        }
        onSubmit={async (payload) => {
          if (!editingPitch?.id) return;
          await updatePitch(editingPitch.id, payload);
          setEditingPitch(null);
          await refresh();
        }}
      />

      <hr style={{ margin: "18px 0" }} />

      <h3>Pending Owners</h3>
      {loading ? <p>Loading...</p> : null}
      {!loading && pendingOwners.length === 0 ? <p>None</p> : null}

      <ul>
        {pendingOwners.map((o) => (
          <li key={o.id} style={{ marginBottom: 8 }}>
            <b>{o.username}</b> ({o.email || "-"}){" "}
            <button onClick={() => onApproveOwner(o.id)}>Approve</button>
          </li>
        ))}
      </ul>

      <hr style={{ margin: "18px 0" }} />

      <h3>Pending Pitches</h3>
      {!loading && pendingPitches.length === 0 ? <p>None</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 860 }}>
        {pendingPitches.map((p) => (
          <div
            key={p.id}
            onClick={() => goToPitch(p.id)}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              cursor: "pointer",
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
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                <div style={{ color: "#555", marginTop: 6 }}>
                  {p.address || "—"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprovePitch(p.id);
                  }}
                >
                  Approve
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMsg("");
                    setEditingPitch(p);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Edit
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 14 }}>
              Working hours:{" "}
              {p.opening_time_label && p.closing_time_label
                ? `${p.opening_time_label} - ${p.closing_time_label}`
                : `${p.opening_time} - ${p.closing_time}`}
            </div>

            <div style={{ marginTop: 8, fontSize: 14 }}>
              Hourly: {p.hourly_price} | Weekly: {p.weekly_price} | Monthly:{" "}
              {p.monthly_price}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Minimum hours: {p.min_hours}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Booking modes: Hourly {p.allow_hourly ? "Yes" : "No"} | Weekly{" "}
              {p.allow_weekly ? "Yes" : "No"} | Monthly{" "}
              {p.allow_monthly ? "Yes" : "No"}
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

            <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
              Location: {p.latitude}, {p.longitude}
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
              Click card to open slot table / manage occupancy.
            </div>
          </div>
        ))}
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3>All Pitches</h3>
      {!loading && allPitches.length === 0 ? <p>None</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 860 }}>
        {allPitches.map((p) => (
          <div
            key={p.id}
            onClick={() => goToPitch(p.id)}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              cursor: "pointer",
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
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                <div style={{ color: "#555", marginTop: 6 }}>
                  {p.address || "—"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div>
                  Status:{" "}
                  <b style={{ color: p.is_approved ? "green" : "#b00020" }}>
                    {p.is_approved ? "Approved" : "Pending"}
                  </b>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMsg("");
                    setEditingPitch(p);
                  }}
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Edit
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 14 }}>
              Working hours:{" "}
              {p.opening_time_label && p.closing_time_label
                ? `${p.opening_time_label} - ${p.closing_time_label}`
                : `${p.opening_time} - ${p.closing_time}`}
            </div>

            <div style={{ marginTop: 8, fontSize: 14 }}>
              Hourly: {p.hourly_price} | Weekly: {p.weekly_price} | Monthly:{" "}
              {p.monthly_price}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Minimum hours: {p.min_hours}
            </div>

            <div style={{ marginTop: 6, fontSize: 14 }}>
              Booking modes: Hourly {p.allow_hourly ? "Yes" : "No"} | Weekly{" "}
              {p.allow_weekly ? "Yes" : "No"} | Monthly{" "}
              {p.allow_monthly ? "Yes" : "No"}
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

            <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
              Location: {p.latitude}, {p.longitude}
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
              Click card to open slot table / manage occupancy.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
