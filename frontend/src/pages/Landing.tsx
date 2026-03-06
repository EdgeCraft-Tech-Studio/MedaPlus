import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div style={{ padding: 24 }}>
      <h1>PitchConnect</h1>
      <p>Book football pitches, find matches, and join tournaments.</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <Link to="/login">
          <button>Login</button>
        </Link>

        <Link to="/signup">
          <button>Sign up</button>
        </Link>
      </div>
    </div>
  );
}
