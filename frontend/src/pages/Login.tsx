import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, me } from "../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await login(username, password);
      const user = await me();

      if (user.role === "ADMIN") nav("/admin");
      else if (user.role === "OWNER") nav("/owner");
      else nav("/app");
    } catch (e: any) {
      setErr("Login failed. Check username/password or API config.");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Login</h2>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
        <button type="submit">Login</button>
      </form>
      {err && <p style={{ marginTop: 12 }}>{err}</p>}
    </div>
  );
}
