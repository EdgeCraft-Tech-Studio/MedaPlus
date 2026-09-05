import { useEffect, useState } from "react";
import styles from "./css/MemberPaymentPopup.module.css";
import type { PendingPayment } from "../lib/teamBooking";

interface Props {
  payment: PendingPayment;
  loading: boolean;
  onPay: (requestId: string) => Promise<void>;
  onClose?: () => void;
  readOnly?: boolean;
  readOnlyStatusLabel?: string;
}

function CoinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5c0-1 1-2 3-2s3 .8 3 1.9c0 2.5-6 1.5-6 4 0 1.1 1.3 1.9 3 1.9s3-.7 3-1.7" />
    </svg>
  );
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" />
    </svg>
  );
}

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    function tick() {
      const diff = new Date(targetIso).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  const totalSeconds = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function MemberPaymentPopup({ payment, loading, onPay, onClose, readOnly = false, readOnlyStatusLabel }: Props) {
  const countdown = useCountdown(payment.payment_expires_at);

  return (
        <div className={styles.overlay} onMouseDown={readOnly ? onClose : undefined}>
      <div className={styles.card} role="alertdialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {readOnly && onClose && (
          <button className={styles.readOnlyClose} onClick={onClose} aria-label="Close">✕</button>
        )}
        {readOnly ? (
          <div className={styles.readOnlyBanner}>{readOnlyStatusLabel || "This payment window has closed."}</div>
        ) : (
          <div className={styles.countdown}>{countdown}</div>
        )}

        <div className={styles.iconWrap}>
          <CoinIcon className={styles.icon} />
        </div>

        <div className={styles.title}>Pay for {payment.pitch_name}</div>
        <div className={styles.subtitle}>{payment.team_name} is booking this pitch — pay your share now.</div>

        <div className={styles.amountCard}>
          <span>Your share</span>
          <b>{payment.amount} Br</b>
        </div>

                <button className={styles.payBtn} onClick={() => onPay(payment.request_id)} disabled={loading || readOnly}>
          {loading ? <SpinnerIcon className={styles.spinner} /> : `Pay ${payment.amount} Br`}
        </button>
      </div>
    </div>
  );
}