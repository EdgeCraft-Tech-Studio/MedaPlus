import { useEffect, useState } from "react";
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
} from "../lib/pitches";

type OwnerRow = { id: string; username: string; email: string; is_approved: boolean };

export default function Admin() {
  const [pendingOwners, setPendingOwners] = useState<Array<{ id: string; username: string; email: string }>>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [pendingPitches, setPendingPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");
  const [openAdd, setOpenAdd] = useState(false);

  async function refresh() {
    try {
      const [po, o, pp] = await Promise.all([
        listPendingOwners(),
        listOwners(),
        listPendingPitches(),
      ]);
      setPendingOwners(po);
      setOwners(o);
      setPendingPitches(pp);
    } catch (e) {
      setMsg("Failed to load admin data. Check API / token.");
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

  return (
    <div style={{ padding: 24 }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Admin</h2>
        <AddButton onClick={() => setOpenAdd(true)} />
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {/* Add Pitch Wizard */}
      <PitchWizardModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        isAdmin={true}
        owners={owners}
        onSubmit={async (payload) => {
          // IMPORTANT:
          // Wizard sets payload.owner_id by default.
          // If your backend expects tenant_id instead, change it in PitchWizardModal or here.
          await createPitch(payload);
          setMsg("Pitch created (pending approval).");
          await refresh();
        }}
      />

      <hr style={{ margin: "18px 0" }} />

      {/* Pending Owners */}
      <h3>Pending Owners</h3>
      {pendingOwners.length === 0 ? <p>None</p> : null}
      <ul>
        {pendingOwners.map((o) => (
          <li key={o.id} style={{ marginBottom: 8 }}>
            <b>{o.username}</b> ({o.email || "-"}){" "}
            <button onClick={() => onApproveOwner(o.id)}>Approve</button>
          </li>
        ))}
      </ul>

      <hr style={{ margin: "18px 0" }} />

      {/* Pending Pitches */}
      <h3>Pending Pitches</h3>
      {pendingPitches.length === 0 ? <p>None</p> : null}
      <ul>
        {pendingPitches.map((p) => (
          <li key={p.id} style={{ marginBottom: 8 }}>
            <b>{p.name}</b> — Approved: {p.is_approved ? "Yes" : "No"}{" "}
            <button onClick={() => onApprovePitch(p.id)}>Approve</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
