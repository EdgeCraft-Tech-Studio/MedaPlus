import styles from "./css/PaymentCompletedPopup.module.css";
import type { PaymentCompletionInfo } from "../lib/payment";

interface Props {
  info: PaymentCompletionInfo;
  loading: boolean;
  onDone: () => void;
}

function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.3l2.3 2.3 4.7-5" /></svg>;
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" /></svg>;
}

export default function PaymentCompletedPopup({ info, loading, onDone }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="alertdialog" aria-modal="true">
        <div className={styles.successBox}>
          <CheckCircleIcon className={styles.successIcon} />
          <div className={styles.successText}>Payment Completed! 🎉</div>
          <div className={styles.successSub}>
            {info.kind === "team"
              ? `You paid ${info.amount} Br for ${info.team_name} at ${info.pitch_name} on ${info.when_label}.`
              : `You paid ${info.amount} Br for ${info.pitch_name}${info.when_label ? ` — ${info.when_label}` : ""}.`}
          </div>
          <button className={styles.doneBtn} onClick={onDone} disabled={loading}>
            {loading ? <SpinnerIcon className={styles.spinner} /> : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}