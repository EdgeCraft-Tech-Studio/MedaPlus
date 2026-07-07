import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register, login, me } from "../lib/auth";
import AuthHeader from "../pages/AuthHeader";
import styles from "./css/Auth.module.css";
import LoadingBall from "./LoadingBall";

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17.5 17.5 0 01-3.2 4.1M6.3 6.3A17.6 17.6 0 002 12s3.6 7 10 7a10.3 10.3 0 004.2-.9" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16v.01" />
    </svg>
  );
}

export default function Signup() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"OWNER" | "PLAYER">("PLAYER");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      await register({ username, email, password, role });

      // auto-login after signup
      await login(username, password);
      const user = await me();

      if (user.role === "OWNER") nav("/owner");
      else nav("/app");
      // no setLoading(false) on success — the loader stays up through
      // the redirect so there's no flash of the form again beforehand.
    } catch (e: any) {
      setErr("Signup failed. Try a different username/email.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <AuthHeader variant="signup" />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardEyebrow}>Get started</span>
            <h1 className={styles.cardTitle}>Create account</h1>
            <p className={styles.cardSubtitle}>
              Join Meda Plus to book pitches or list your own.
            </p>
          </div>

          {err && (
            <div className={styles.errorBanner} style={{ marginBottom: 14 }}>
              <AlertIcon width={15} height={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-username">
                Username
              </label>
              <input
                id="signup-username"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-email">
                Email <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
              </label>
              <input
                id="signup-email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-password">
                Password
              </label>
              <div className={styles.passwordField}>
                <input
                  id="signup-password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  style={{ paddingRight: 40 }}
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={loading}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>I am a</label>
              <div className={styles.roleRow}>
                <label
                  className={`${styles.roleOption} ${
                    role === "PLAYER" ? styles.roleOptionOn : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    checked={role === "PLAYER"}
                    onChange={() => setRole("PLAYER")}
                    disabled={loading}
                  />
                  <span className={styles.roleOptionLabel}>Player</span>
                  <span className={styles.roleOptionHint}>Book pitches to play</span>
                </label>

                <label
                  className={`${styles.roleOption} ${
                    role === "OWNER" ? styles.roleOptionOn : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    checked={role === "OWNER"}
                    onChange={() => setRole("OWNER")}
                    disabled={loading}
                  />
                  <span className={styles.roleOptionLabel}>Pitch Owner</span>
                  <span className={styles.roleOptionHint}>List your pitch</span>
                </label>
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div className={styles.footerRow}>
            Already have an account?
            <Link to="/login" className={styles.navLink}>
              <button type="button" className={styles.footerLinkBtn} disabled={loading}>
                Login
              </button>
            </Link>
          </div>
        </div>
      </main>

      {loading && <LoadingBall fullscreen label="Creating your account..." size="sm" />}
    </div>
  );
}
