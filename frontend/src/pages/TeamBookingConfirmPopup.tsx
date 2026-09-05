import { useState } from "react";
import styles from "./css/TeamBookingConfirmPopup.module.css";
import type { PendingTeamBookingConfirmation } from "../lib/teamBooking";

interface Props {
  confirmation: PendingTeamBookingConfirmation;
  onConfirmed: () => void;
  onDeclined: () => void;
  onConfirm: (requestId: string) => Promise<void>;
  onDecline: (requestId: string) => Promise<void>;
  onClose?: () => void; // only used in read-only mode
  readOnly?: boolean;
  readOnlyStatusLabel?: string; // e.g. "You confirmed" / "You declined" / "Window closed"
}

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l3.5 2.5-1.3 4H9.8l-1.3-4L12 7z" />
      <path d="M12 3v4M12 17v4M3.5 9.5l3.5 1.3M17 12.8l3.5 1.3M3.5 14.5L7 13M17 11l3.5-1.3" />
    </svg>
  );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </svg>
  );
}

function CoinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10a2.5 2 0 012.5-1.5c1.4 0 2.5.7 2.5 1.7 0 2.3-5 1.3-5 3.6 0 1 1.1 1.7 2.5 1.7s2.5-.6 2.5-1.5" />
    </svg>
  );
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l9.5 17H2.5L12 3z" />
      <path d="M12 10v4M12 17v.01" />
    </svg>
  );
}

function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle
        cx="12" cy="12" r="9"
        stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeDasharray="42 100"
      />
    </svg>
  );
}

function formatWhen(selections: { start_iso: string; end_iso: string }[]) {
  if (!selections.length) return "";
  const first = new Date(selections[0].start_iso);
  const label = first.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (selections.length === 1) return label;
  return `${label} (+${selections.length - 1} more)`;
}

export default function TeamBookingConfirmPopup({
  confirmation,
  onConfirmed,
  onDeclined,
  onConfirm,
  onDecline,
  onClose,
  readOnly = false,
  readOnlyStatusLabel,
}: Props) {
  const [step, setStep] = useState<"main" | "decline-confirm">("main");
  const [loading, setLoading] = useState(false);

  async function handleYes() {
    setLoading(true);
    try {
      await onConfirm(confirmation.request_id);
      onConfirmed();
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalDecline() {
    setLoading(true);
    try {
      await onDecline(confirmation.request_id);
      onDeclined();
    } finally {
      setLoading(false);
    }
  }

  return (
    // No onMouseDown-to-close on the overlay, no X button, no
    // Escape handler — this is intentionally NOT dismissible. It
    // only disappears once the user answers Yes, or Yes on the
    // decline sub-confirm.
        <div className={styles.overlay} onMouseDown={readOnly ? onClose : undefined}>
      <div
        className={styles.card}
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {readOnly && onClose && (
          <button className={styles.readOnlyClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}

        {readOnly && (
          <div className={styles.readOnlyBanner}>{readOnlyStatusLabel || "This window has closed."}</div>
        )}

        {step === "main" && (
          <>
            <div className={styles.iconWrap}>
              <BallIcon className={styles.icon} />
            </div>

            <div className={styles.title}>{confirmation.team_name} has a game!</div>
            <div className={styles.subtitle}>Can you make it?</div>

            <div className={styles.detailCard}>
              <div className={styles.detailRow}>
                <CalendarIcon className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>{confirmation.pitch_name}</div>
                  <div className={styles.detailValue}>{formatWhen(confirmation.selections)}</div>
                </div>
              </div>
              <div className={styles.detailRow}>
                <CoinIcon className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>Your share</div>
                  <div className={styles.detailValue}>{confirmation.price_per_member} Br</div>
                </div>
              </div>
            </div>

            <div className={styles.footerRow}>
              <button
                className={styles.noBtn}
                onClick={() => setStep("decline-confirm")}
                disabled={loading || readOnly}
              >
                No, I can't
              </button>
              <button className={styles.yesBtn} onClick={handleYes} disabled={loading || readOnly}>
                {loading ? <SpinnerIcon className={styles.spinner} /> : "Yes, I'll play"}
              </button>
            </div>
          </>
        )}

        {step === "decline-confirm" && (
          <>
            <div className={`${styles.iconWrap} ${styles.iconWrapWarn}`}>
              <AlertIcon className={styles.icon} />
            </div>

            <div className={styles.title}>Are you sure?</div>
            <div className={styles.subtitle}>
              You're about to tell {confirmation.team_name} you won't play at{" "}
              {confirmation.pitch_name} on {formatWhen(confirmation.selections)}.
            </div>

            <div className={styles.footerRow}>
              <button
                className={styles.noBtn}
                onClick={() => setStep("main")}
                disabled={loading}
              >
                Go back
              </button>
              <button className={styles.declineBtn} onClick={handleFinalDecline} disabled={loading}>
                {loading ? <SpinnerIcon className={styles.spinner} /> : "Yes, I can't play"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}