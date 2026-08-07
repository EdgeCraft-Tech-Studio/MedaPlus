import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import AuthHeader from "../pages/AuthHeader";
import styles from "./css/Otp.module.css";
import LoadingBall from "./LoadingBall";

const CODE_LENGTH = 5;
const RESEND_SECONDS = 60;

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16v.01" />
    </svg>
  );
}

function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
      <path d="M9.2 12.2l1.9 1.9 3.7-3.9" />
    </svg>
  );
}

function maskPhone(phone: string) {
  if (!phone || phone.length < 7) return phone;
  const start = phone.slice(0, 4);
  const end = phone.slice(-3);
  const dots = "•".repeat(Math.max(phone.length - start.length - end.length, 3));
  return `${start}${dots}${end}`;
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// TODO (backend): replace these two stubs with real API calls, e.g.
//
// import { verifyOtp as verifyOtpApi, resendOtp as resendOtpApi } from "../lib/auth";
//
// async function verifyOtp(phone: string, code: string) {
//   return verifyOtpApi({ phone, code }); // should return the created/verified user or a token
// }
//
// async function resendOtp(phone: string) {
//   return resendOtpApi({ phone });
// }
// ---------------------------------------------------------------------
async function verifyOtp(phone: string, code: string): Promise<{ ok: boolean }> {
  // eslint-disable-next-line no-console
  console.log("TODO: call backend to verify OTP", { phone, code });
  throw new Error("verifyOtp not implemented yet");
}

async function resendOtp(phone: string): Promise<{ ok: boolean }> {
  // eslint-disable-next-line no-console
  console.log("TODO: call backend to resend OTP", { phone });
  return { ok: true };
}

export default function OtpVerify() {
  const nav = useNavigate();
  const location = useLocation();

  const state = (location.state || {}) as { phone?: string; role?: "OWNER" | "PLAYER"; password?: string };
  const phone = state.phone || "";

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const autoSubmittedRef = useRef(false);

  // Redirect back to signup if someone lands here directly without a phone.
  useEffect(() => {
    if (!phone) {
      nav("/signup", { replace: true });
    }
  }, [phone, nav]);

  // Focus the first box on mount.
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const code = digits.join("");

  // Auto-verify once all boxes are filled.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      handleVerify();
    }
    if (code.length < CODE_LENGTH) {
      autoSubmittedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function setDigitAt(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    setErr("");
    const onlyDigits = raw.replace(/\D/g, "");

    if (!onlyDigits) {
      setDigitAt(index, "");
      return;
    }

    // Handles autofill/paste landing the whole code in one box.
    if (onlyDigits.length > 1) {
      const chars = onlyDigits.slice(0, CODE_LENGTH).split("");
      setDigits((prev) => {
        const next = [...prev];
        for (let i = 0; i < CODE_LENGTH; i++) {
          next[i] = chars[i] ?? (i < index ? next[i] : "");
        }
        return next;
      });
      const lastFilled = Math.min(chars.length, CODE_LENGTH) - 1;
      inputsRef.current[lastFilled]?.focus();
      return;
    }

    setDigitAt(index, onlyDigits);

    if (index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigitAt(index, "");
        return;
      }
      if (index > 0) {
        inputsRef.current[index - 1]?.focus();
        setDigitAt(index - 1, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    handleChange(0, pasted);
  }

  async function handleVerify() {
    if (code.length !== CODE_LENGTH) {
      setErr(`Enter all ${CODE_LENGTH} digits.`);
      return;
    }

    setErr("");
    setLoading(true);

    try {
      // TODO (backend): wire this up, then decide where to send the user —
      // e.g. auto-login and route by role, or straight to /login.
      //await verifyOtp(phone, code);
      nav("/home", { state: { verified: true, phone } });

      // TODO: on success, e.g.:
      // await login(phone, state.password);
      // const user = await me();
      // nav(user.role === "OWNER" ? "/owner" : "/app");
    } catch (e: any) {
      setErr("Invalid or expired code. Please try again.");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (secondsLeft > 0 || resending) return;
    setErr("");
    setResending(true);
    setResent(false);

    try {
      await resendOtp(phone);
      setSecondsLeft(RESEND_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(""));
      autoSubmittedRef.current = false;
      inputsRef.current[0]?.focus();
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } catch {
      setErr("Couldn't resend the code. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={styles.page}>
      <AuthHeader variant="signup" />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.iconBadge}>
            <ShieldIcon width={22} height={22} />
          </div>

          <div className={styles.cardHead}>
            <span className={styles.cardEyebrow}>Verify your number</span>
            <h1 className={styles.cardTitle}>Enter the code</h1>
            <p className={styles.cardSubtitle}>
              We sent a {CODE_LENGTH}-digit code to{" "}
              <span className={styles.phoneHighlight}>{maskPhone(phone)}</span>
            </p>
          </div>

          {err && (
            <div className={styles.errorBanner}>
              <AlertIcon width={15} height={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{err}</span>
            </div>
          )}

          {resent && (
            <div className={styles.successBanner}>
              <span>New code sent.</span>
            </div>
          )}

          <div className={styles.otpRow} onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputsRef.current[i] = el; }}
                className={`${styles.otpBox} ${err ? styles.otpBoxError : ""}`}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
              />
            ))}
          </div>

          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleVerify}
            disabled={loading || code.length !== CODE_LENGTH}
          >
            {loading ? "Verifying..." : "Verify code"}
          </button>

          <div className={styles.resendRow}>
            {secondsLeft > 0 ? (
              <span>
                Didn't get the code? Resend in{" "}
                <span className={styles.timer}>{formatTime(secondsLeft)}</span>
              </span>
            ) : (
              <span>
                Didn't get the code?{" "}
                <button
                  type="button"
                  className={styles.resendLinkBtn}
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
              </span>
            )}
          </div>

          <div className={styles.footerRow}>
            <Link to="/signup" className={styles.changeLink}>
              <ArrowLeftIcon width={13} height={13} />
              <span>Change phone number</span>
            </Link>
          </div>
        </div>
      </main>

      {loading && <LoadingBall fullscreen label="Verifying code..." size="sm" />}
    </div>
  );
}