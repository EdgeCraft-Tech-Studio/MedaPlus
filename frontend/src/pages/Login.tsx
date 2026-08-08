import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../lib/auth";
import AuthHeader from "../pages/AuthHeader";
import styles from "./css/Signup.module.css";
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

// ---------------------------------------------------------------------------
// Same phone validator/normalizer used in Signup.tsx — kept identical so
// login accepts the exact same input formats (local 09/07, +251, 251...).
// ---------------------------------------------------------------------------

interface PhoneValidationResult {
  valid: boolean;
  message: string;
  normalized: string;
}

function validateEthioPhone(value: string): PhoneValidationResult {
  const cleaned = value.replace(/[\s\-()]/g, "");

  if (!cleaned) {
    return { valid: false, message: "Phone number is required", normalized: "" };
  }

  let digits = cleaned;

  if (digits.startsWith("+251")) {
    digits = "0" + digits.slice(4);
  } else if (digits.startsWith("251") && digits.length === 12) {
    digits = "0" + digits.slice(3);
  }

  if (!/^\d+$/.test(digits)) {
    return { valid: false, message: "Phone number can only contain digits", normalized: "" };
  }

  if (digits.length !== 10) {
    return {
      valid: false,
      message: "Enter a 10-digit number, e.g. 09XXXXXXXX or 07XXXXXXXX",
      normalized: "",
    };
  }

  if (digits[0] !== "0") {
    return { valid: false, message: "Phone number must start with 0", normalized: "" };
  }

  const carrierDigit = digits[1];
  if (carrierDigit !== "9" && carrierDigit !== "7") {
    return {
      valid: false,
      message: "Enter a valid Ethio Telecom (09) or Safaricom (07) number",
      normalized: "",
    };
  }

  return { valid: true, message: "", normalized: digits };
}

function toInternationalPhone(local: string): string {
  return "+251" + local.slice(1);
}

function generateRandomString(length = 20) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  function handlePhoneChange(value: string) {
    setPhone(value);
    if (phoneTouched) {
      const result = validateEthioPhone(value);
      setPhoneError(result.valid ? "" : result.message);
    }
  }

  function handlePhoneBlur() {
    setPhoneTouched(true);
    const result = validateEthioPhone(phone);
    setPhoneError(result.valid ? "" : result.message);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const phoneResult = validateEthioPhone(phone);
    setPhoneTouched(true);
    setPhoneError(phoneResult.valid ? "" : phoneResult.message);

    if (!phoneResult.valid) return;

    setLoading(true);

    try {
      const session = await login({
        phone: toInternationalPhone(phoneResult.normalized),
        password,
        device_id: generateRandomString(),
        device_type: "web",
        device_name: "browser",
      });

      const role = session.user.role;

      if (role === "ADMIN") nav("/admin", { replace: true });
      else if (role === "OWNER") nav("/owner", { replace: true });
      else nav("/home", { replace: true });
    } catch (e: any) {
      const data = e?.response?.data;
      let message = "Invalid phone number or password.";

      if (data) {
        if (typeof data === "string") {
          message = data;
        } else if (data.detail) {
          message = data.detail;
        } else {
          const firstKey = Object.keys(data)[0];
          const firstVal = data[firstKey];
          message = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
        }
      }

      setErr(message);
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

          <form onSubmit={onSubmit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-phone">
                Phone number
              </label>
              <input
                id="login-phone"
                className={styles.input}
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="09XXXXXXXX or 07XXXXXXXX"
                autoComplete="tel"
                inputMode="tel"
                disabled={loading}
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? "login-phone-error" : undefined}
                style={phoneError ? { borderColor: "var(--danger, #e5484d)" } : undefined}
              />
              {phoneError && (
                <div id="login-phone-error" className={styles.fieldError}>
                  <AlertIcon width={13} height={13} style={{ flexShrink: 0 }} />
                  <span>{phoneError}</span>
                </div>
              )}
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