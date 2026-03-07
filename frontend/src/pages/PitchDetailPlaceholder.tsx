import { Link, useParams } from "react-router-dom";

export default function PitchDetailPlaceholder() {
  const { pitchId } = useParams();

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/app">← Back to player dashboard</Link>
      </div>

      <h2 style={{ marginTop: 0 }}>Pitch Detail Page</h2>
      <p>This page is reserved for the full pitch detail screen that we will build next.</p>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fafafa",
          maxWidth: 700,
        }}
      >
        <div><b>Pitch ID:</b> {pitchId}</div>
        <div style={{ marginTop: 10, color: "#555" }}>
          Later this page will show:
          <ul>
            <li>all pitch images</li>
            <li>address and map</li>
            <li>hourly, weekly and monthly prices</li>
            <li>amenities</li>
            <li>availability calendar</li>
            <li>book button</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
