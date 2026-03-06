import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register, login, me } from "../lib/auth";

export default function Signup() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"OWNER" | "PLAYER">("PLAYER");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    try {
      await register({ username, email, password, role });

      // auto-login after signup
      await login(username, password);
      const user = await me();

      if (user.role === "OWNER") nav("/owner");
      else nav("/app");
    } catch (e: any) {
      setErr("Signup failed. Try a different username/email.");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Sign up</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email (optional)" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />

        <select value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="PLAYER">Player</option>
          <option value="OWNER">Pitch Owner</option>
        </select>

        <button type="submit">Create account</button>
      </form>

      {err && <p style={{ marginTop: 12 }}>{err}</p>}
    </div>
  );
}
