import { useEffect, useState } from "react";
import { me } from "../lib/auth";
import type { Pitch } from "../lib/pitches";
import {
  approveOwner,
  approvePitch,
  createPitch,
  listOwners,
  listPendingOwners,
  listPendingPitches,
} from "../lib/pitches";

export default function Admin() {
  const [pendingOwners, setPendingOwners] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [pendingPitches, setPendingPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");

  // form state
  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("0");
  const [lng, setLng] = useState("0");
  const [hourly, setHourly] = useState("0");
  const [weekly, setWeekly] = useState("0");
  const [monthly, setMonthly] = useState("0");
  const [dressing, setDressing] = useState(false);
  const [showers, setShowers] = useState(false);
  const [services, setServices] = useState("");
  const [slotDate, setSlotDate] = useState("");
  const [slotHours, setSlotHours] = useState("8,9,10,11");

  async function refresh() {
    setPendingOwners(await listPendingOwners());
    setOwners(await listOwners());
    setPendingPitches(await listPendingPitches());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onApproveOwner(id: string) {
    await approveOwner(id);
    setMsg("Owner approved.");
    refresh();
  }

  async function onApprovePitch(id: string) {
    const res = await approvePitch(id);
    setMsg(res.ok ? "Pitch approved." : "Could not approve pitch.");
    refresh();
  }

  async function onCreatePitch(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    const hours = slotHours
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    await createPitch({
      owner_id: ownerId,
      name,
      address,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      hourly_price: hourly,
      weekly_price: weekly,
      monthly_price: monthly,
      has_dressing_room: dressing,
      has_showers: showers,
      other_services: services,
      slot_date: slotDate || undefined,
      slot_hours: hours,
    });

    setMsg("Pitch created (pending approval).");
    refresh();
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Admin</h2>
      {msg && <p>{msg}</p>}

      <h3>Pending Owners</h3>
      {pendingOwners.length === 0 ? <p>None</p> : null}
      <ul>
        {pendingOwners.map((o) => (
          <li key={o.id}>
            {o.username} ({o.email || "-"}){" "}
            <button onClick={() => onApproveOwner(o.id)}>Approve</button>
          </li>
        ))}
      </ul>

      <h3>Pending Pitches</h3>
      {pendingPitches.length === 0 ? <p>None</p> : null}
      <ul>
        {pendingPitches.map((p) => (
          <li key={p.id}>
            {p.name} | ownerId: {p.owner}{" "}
            <button onClick={() => onApprovePitch(p.id)}>Approve</button>
          </li>
        ))}
      </ul>

      <hr />

      <h3>Create Pitch (Admin)</h3>
      <form onSubmit={onCreatePitch} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">Select owner</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.username} {o.is_approved ? "(approved)" : "(pending)"}
            </option>
          ))}
        </select>

        <input placeholder="Pitch name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />

        <input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
        <input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />

        <input placeholder="Hourly price" value={hourly} onChange={(e) => setHourly(e.target.value)} />
        <input placeholder="Weekly price" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        <input placeholder="Monthly price" value={monthly} onChange={(e) => setMonthly(e.target.value)} />

        <label>
          <input type="checkbox" checked={dressing} onChange={(e) => setDressing(e.target.checked)} /> Dressing room
        </label>
        <label>
          <input type="checkbox" checked={showers} onChange={(e) => setShowers(e.target.checked)} /> Showers
        </label>

        <input placeholder="Other services (comma separated)" value={services} onChange={(e) => setServices(e.target.value)} />
        <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
        <input placeholder="Slot hours (e.g. 8,9,10,11)" value={slotHours} onChange={(e) => setSlotHours(e.target.value)} />

        <button type="submit" disabled={!ownerId || !name}>Create pitch</button>
      </form>
    </div>
  );
}
