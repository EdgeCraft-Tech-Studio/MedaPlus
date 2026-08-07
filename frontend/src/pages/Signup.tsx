import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../lib/auth";
import AuthHeader from "../pages/AuthHeader";
import styles from "./css/Auth.module.css";
import LoadingBall from "./LoadingBall";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.4 19.4 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.2 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" strokeLinecap="round" />
      <line x1="12" y1="16.5" x2="12" y2="16.51" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface PhoneValidationResult {
  valid: boolean;
  message: string;
  normalized: string;
}

interface FieldValidationResult {
  valid: boolean;
  message: string;
}

/**
 * Validates Ethiopian mobile numbers for the two carriers currently
 * issuing numbers: Ethio Telecom (09XXXXXXXX) and Safaricom Ethiopia
 * (07XXXXXXXX). Accepts local (0...), and international (+251... / 251...)
 * formats, and normalizes everything to the local 10-digit form
 * (e.g. "0912345678") since that's what the UI asks the user to enter.
 */
function validateEthioPhone(value: string): PhoneValidationResult {
  const cleaned = value.replace(/[\s\-()]/g, "");

  if (!cleaned) {
    return { valid: false, message: "Phone number is required", normalized: "" };
  }

  let digits = cleaned;

  // Normalize international prefixes down to the local 0-prefixed form.
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

  // NOTE: carrier blocks (e.g. which 090x / 070x ranges are actually
  // issued) shift over time as new blocks get allocated. If you need
  // stricter carrier-block validation, add the specific 3rd-digit
  // ranges here — for now we validate the structural pattern that's
  // guaranteed to hold: 0 + (9|7) + 8 digits.

  return { valid: true, message: "", normalized: digits };
}

/** Email is optional on this form, so an empty value is valid. */
function validateEmail(value: string): FieldValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: true, message: "" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, message: "Enter a valid email address" };
  }

  return { valid: true, message: "" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Signup() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"OWNER" | "PLAYER">("PLAYER");
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

  function handleEmailChange(value: string) {
    setEmail(value);
    if (emailTouched) {
      const result = validateEmail(value);
      setEmailError(result.valid ? "" : result.message);
    }
  }

  function handleEmailBlur() {
    setEmailTouched(true);
    const result = validateEmail(email);
    setEmailError(result.valid ? "" : result.message);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const phoneResult = validateEthioPhone(phone);
    const emailResult = validateEmail(email);

    setPhoneTouched(true);
    setEmailTouched(true);
    setPhoneError(phoneResult.valid ? "" : phoneResult.message);
    setEmailError(emailResult.valid ? "" : emailResult.message);

    if (!phoneResult.valid || !emailResult.valid) {
      return;
    }

    setLoading(true);

    try {
      await register({
        username: phoneResult.normalized,
        phone: phoneResult.normalized,
        email: email.trim(),
        password,
        role,
      });

      nav("/verify-otp", {
        state: {
          phone: phoneResult.normalized,
          password,
          role,
        },
      });
    } catch (e: any) {
      setErr("Signup failed. This phone number or email might already be in use.");
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

          <form onSubmit={onSubmit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-phone">
                Phone number
              </label>
              <input
                id="signup-phone"
                className={styles.input}
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="09XXXXXXXX or 07XXXXXXXX"
                autoComplete="tel"
                inputMode="tel"
                disabled={loading}
                aria-invalid={!!phoneError}
                aria-describedby={phoneError ? "signup-phone-error" : undefined}
                style={phoneError ? { borderColor: "var(--danger, #e5484d)" } : undefined}
              />
              {phoneError && (
                <div
                  id="signup-phone-error"
                  className={styles.fieldError}
                  style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: "var(--danger, #e5484d)" }}
                >
                  <AlertIcon width={13} height={13} style={{ flexShrink: 0 }} />
                  <span>{phoneError}</span>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-email">
                Email <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
              </label>
              <input
                id="signup-email"
                className={styles.input}
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleEmailBlur}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "signup-email-error" : undefined}
                style={emailError ? { borderColor: "var(--danger, #e5484d)" } : undefined}
              />
              {emailError && (
                <div
                  id="signup-email-error"
                  className={styles.fieldError}
                  style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: "var(--danger, #e5484d)" }}
                >
                  <AlertIcon width={13} height={13} style={{ flexShrink: 0 }} />
                  <span>{emailError}</span>
                </div>
              )}
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
                <label className={`${styles.roleOption} ${role === "PLAYER" ? styles.roleOptionOn : ""}`}>
                  <input type="radio" name="role" checked={role === "PLAYER"} onChange={() => setRole("PLAYER")} disabled={loading} />
                  <span className={styles.roleOptionLabel}>Player</span>
                  <span className={styles.roleOptionHint}>Book pitches to play</span>
                </label>

                <label className={`${styles.roleOption} ${role === "OWNER" ? styles.roleOptionOn : ""}`}>
                  <input type="radio" name="role" checked={role === "OWNER"} onChange={() => setRole("OWNER")} disabled={loading} />
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