import { useEffect, useState } from "react";
import type { Pitch } from "../lib/pitches";
import { listPitches } from "../lib/pitches";

export default function App() {
  const [pitches, setPitches] = useState<Pitch[]>([]);

  useEffect(() => {
    listPitches().then(setPitches);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h2>Available Pitches</h2>
      {pitches.length === 0 ? <p>No approved pitches yet.</p> : null}

      <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        {pitches.map((p) => (
          <div key={p.id} style={{ border: "1px solid #ccc", padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div>{p.address}</div>
            <div>Hourly: {p.hourly_price} | Weekly: {p.weekly_price} | Monthly: {p.monthly_price}</div>
            <div>
              Dressing room: {p.has_dressing_room ? "Yes" : "No"} | Showers: {p.has_showers ? "Yes" : "No"}
            </div>
            <div>Other: {p.other_services || "-"}</div>
            <div>Location: {p.latitude}, {p.longitude}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
