import { useEffect, useMemo, useState } from "react";
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

type ApprovalFilter = "all" | "approved" | "not_approved";

function matchesSearch(p: Pitch, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    (p.address || "").toLowerCase().includes(q)
  );
}

function matchesPrice(p: Pitch, maxPrice: string) {
  if (!maxPrice.trim()) return true;
  const max = Number(maxPrice);
  if (Number.isNaN(max)) return true;

  const prices = [
    Number(p.hourly_price || 0),
    Number(p.weekly_price || 0),
    Number(p.monthly_price || 0),
  ].filter((v) => !Number.isNaN(v));

  return prices.some((price) => price <= max);
}

function matchesAmenities(
  p: Pitch,
  amenities: {
    dressing: boolean;
    showers: boolean;
    parking: boolean;
    lighting: boolean;
  }
) {
  if (amenities.dressing && !p.has_dressing_room) return false;
  if (amenities.showers && !p.has_showers) return false;
  if (amenities.parking && !p.has_parking) return false;
  if (amenities.lighting && !p.has_lighting) return false;
  return true;
}

function matchesApproval(p: Pitch, approval: ApprovalFilter) {
  if (approval === "all") return true;
  if (approval === "approved") return p.is_approved;
  return !p.is_approved;
}

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

  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [amenities, setAmenities] = useState({
    dressing: false,
    showers: false,
    parking: false,
    lighting: false,
  });

  async function refresh() {
    try {
      setLoading(true);
      setMsg("");

      const [po, o, pp, ap] = await Promise.all([
        listPendingOwners(),
        listOwners(),
        listPendingPitches(),
        listPitches(),
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

  const filteredPendingPitches = useMemo(() => {
    return pendingPitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities) &&
        matchesApproval(p, approvalFilter)
    );
  }, [pendingPitches, search, maxPrice, amenities, approvalFilter]);

  const filteredAllPitches = useMemo(() => {
    return allPitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities) &&
        matchesApproval(p, approvalFilter)
    );
  }, [allPitches, search, maxPrice, amenities, approvalFilter]);

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
          setMsg("Pitch updated successfully.");
          setEditingPitch(null);
          await refresh();
        }}
      />

      <hr style={{ margin: "18px 0" }} />

      <h3>Pitch Filters</h3>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          maxWidth: 980,
          marginBottom: 18,
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by pitch name or address"
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <select
          value={approvalFilter}
          onChange={(e) => setApprovalFilter(e.target.value as ApprovalFilter)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="not_approved">Not approved</option>
        </select>

        <input
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          placeholder="Max price"
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <button
          onClick={() => {
            setSearch("");
            setApprovalFilter("all");
            setMaxPrice("");
            setAmenities({
              dressing: false,
              showers: false,
              parking: false,
              lighting: false,
            });
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
        <label>
          <input
            type="checkbox"
            checked={amenities.dressing}
            onChange={(e) =>
              setAmenities((prev) => ({ ...prev, dressing: e.target.checked }))
            }
          />{" "}
          Dressing room
        </label>
        <label>
          <input
            type="checkbox"
            checked={amenities.showers}
            onChange={(e) =>
              setAmenities((prev) => ({ ...prev, showers: e.target.checked }))
            }
          />{" "}
          Showers
        </label>
        <label>
          <input
            type="checkbox"
            checked={amenities.parking}
            onChange={(e) =>
              setAmenities((prev) => ({ ...prev, parking: e.target.checked }))
            }
          />{" "}
          Parking
        </label>
        <label>
          <input
            type="checkbox"
            checked={amenities.lighting}
            onChange={(e) =>
              setAmenities((prev) => ({ ...prev, lighting: e.target.checked }))
            }
          />{" "}
          Lighting
        </label>
      </div>

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
      {!loading && filteredPendingPitches.length === 0 ? <p>None</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 860 }}>
        {filteredPendingPitches.map((p) => (
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
          </div>
        ))}
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3>All Pitches</h3>
      {!loading && filteredAllPitches.length === 0 ? <p>None</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 860 }}>
        {filteredAllPitches.map((p) => (
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
              Dressing room: {p.has_dressing_room ? "Yes" : "No"} | Showers:{" "}
              {p.has_showers ? "Yes" : "No"} | Parking:{" "}
              {p.has_parking ? "Yes" : "No"} | Lighting:{" "}
              {p.has_lighting ? "Yes" : "No"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
