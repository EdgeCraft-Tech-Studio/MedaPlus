import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, me } from "../lib/auth";
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

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(username, password);
      const user = await me();
      if (user.role === "ADMIN") nav("/admin");
      else if (user.role === "OWNER") nav("/owner");
      else nav("/app");
      // no setLoading(false) here on success — keep the loader up through
      // the redirect so the form doesn't flash back before navigating away.
    } catch (e: any) {
      setErr("Login failed. Check username/password or API config.");
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <AuthHeader variant="login" />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardEyebrow}>Welcome back</span>
            <h1 className={styles.cardTitle}>Login</h1>
            <p className={styles.cardSubtitle}>
              Sign in to book pitches, manage listings, or check your matches.
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
              <label className={styles.label} htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">
                Password
              </label>
              <div className={styles.passwordField}>
                <input
                  id="login-password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <div className={styles.footerRow}>
            Don't have an account?
            <Link to="/signup" className={styles.navLink}>
              <button type="button" className={styles.footerLinkBtn} disabled={loading}>
                Create account?
              </button>
            </Link>
          </div>
        </div>
      </main>

      {loading && <LoadingBall fullscreen label="Logging in..." size="sm" />}
    </div>
  );
}
