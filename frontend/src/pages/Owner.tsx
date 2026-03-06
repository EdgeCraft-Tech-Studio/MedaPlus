import { useEffect, useState } from "react";
import { me } from "../lib/auth";
import type { Pitch } from "../lib/pitches";
import { createPitch, listPitches } from "../lib/pitches";

export default function Owner() {
  const [user, setUser] = useState<any>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");

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
    setUser(await me());
    setPitches(await listPitches());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreatePitch(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    const hours = slotHours
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    await createPitch({
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

    setMsg("Pitch created (pending admin approval).");
    refresh();
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Owner Dashboard</h2>

      {user && (
        <p>
          Account status: <b>{user.is_staff || user.is_superuser ? "Approved" : "Pending (admin approval required)"}</b>
        </p>
      )}

      {msg && <p>{msg}</p>}

      <h3>Add Pitch</h3>
      <form onSubmit={onCreatePitch} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
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

        <button type="submit" disabled={!name}>Create pitch</button>
      </form>

      <hr />

      <h3>My Pitches</h3>
      {pitches.length === 0 ? <p>No pitches yet.</p> : null}
      <ul>
        {pitches.map((p) => (
          <li key={p.id}>
            {p.name} — <b>{p.is_approved ? "Approved" : "Pending"}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
