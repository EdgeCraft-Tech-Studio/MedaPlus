import { useState } from "react";
import styles from "./css/OwnerBookingSummaryPopup.module.css";
import type { PendingOwnerAction, ConfirmSummaryAction, PaymentTimeoutAction } from "../lib/teamBooking";
import TeamAvatar from "./TeamAvatar";

type AnyAction = ConfirmSummaryAction | PaymentTimeoutAction;

interface Props {
  action: PendingOwnerAction;
  loading: boolean;
  onResolveSummary: (requestId: string, action: ConfirmSummaryAction) => Promise<void>;
  onResolvePaymentTimeout: (requestId: string, action: PaymentTimeoutAction) => Promise<void>;
  onAcknowledgeSuccess: (requestId: string) => Promise<void>;
  onOpenSlotChosen: () => void;
  onClose?: () => void; // only used for confirm_summary — payment_timeout/payment_success stay mandatory
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l9.5 17H2.5L12 3z" />
      <path d="M12 10v4M12 17v.01" />
    </svg>
  );
}
function TrophyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...props}>
      <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
      <path d="M8 5H5a2 2 0 002 4M16 5h3a2 2 0 01-2 4" />
      <path d="M12 13v3M9 20h6M10 20v-2.5h4V20" />
    </svg>
  );
}
function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.3l2.3 2.3 4.7-5" />
    </svg>
  );
}
function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
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

const CONFIRM_LABELS: Record<ConfirmSummaryAction, string> = {
  cover: "Start Payment",
  recalculate: "Start Payment",
  open_slot: "Open Slot",
  cancel: "Cancel Booking",
};
const PAYMENT_LABELS: Record<PaymentTimeoutAction, string> = {
  remind: "Send Reminder (5 min)",
  cover: "Cover & Pay",
  recalculate: "Recalculate & Send",
  cancel: "Cancel Booking",
};

export default function OwnerBookingSummaryPopup({
  action, loading, onResolveSummary, onResolvePaymentTimeout, onAcknowledgeSuccess, onOpenSlotChosen, onClose,
}: Props) {
  const [chosen, setChosen] = useState<AnyAction | null>(null);

  // ---------------- Payment success ----------------
  if (action.type === "payment_success") {
    return (
      <div className={styles.overlay}>
        <div className={`${styles.card} ${styles.cardAttention}`} role="alertdialog" aria-modal="true">
          <div className={`${styles.iconWrap} ${styles.iconWrapSuccess}`}>
            <CheckCircleIcon className={styles.icon} />
          </div>
          <div className={styles.title}>Payment Completed! 🎉</div>
          <div className={styles.subtitle}>
            {action.team_name}'s pitch at {action.pitch_name} is booked. Code:{" "}
            <b>{action.final_booking_code}</b>
          </div>
          <div className={styles.priceCard}>
            <span>Total collected</span>
            <b>{action.total_price} Br</b>
          </div>
          {action.paid_members && action.paid_members.length > 0 && (
            <div className={styles.memberList}>
              {action.paid_members.map((m) => (
                <div key={m.id} className={styles.memberRow}>
                  <TeamAvatar src={m.profile_photo_url} name={m.name} className={styles.memberAvatar} fallbackClassName={styles.memberAvatarFallbackText} />
                  <span className={styles.memberName}>{m.name}</span>
                  <span className={styles.paidTag}>Paid</span>
                </div>
              ))}
            </div>
          )}
          <button className={styles.primaryBtn} disabled={loading} onClick={() => onAcknowledgeSuccess(action.request_id)}>
            {loading ? <SpinnerIcon className={styles.spinner} /> : "Great!"}
          </button>
        </div>
      </div>
    );
  }

  const isSummary = action.type === "confirm_summary";
  const people = isSummary ? action.declined_members ?? [] : action.unpaid_members ?? [];
  const allConfirmed = isSummary && people.length === 0;

  function submit() {
    if (!chosen) return;
    if (chosen === "open_slot") {
      onOpenSlotChosen();
      return;
    }
    if (isSummary) onResolveSummary(action.request_id, chosen as ConfirmSummaryAction);
    else onResolvePaymentTimeout(action.request_id, chosen as PaymentTimeoutAction);
  }

  const buttonLabel = chosen
    ? chosen === "open_slot"
      ? "Open Slot"
      : isSummary
      ? CONFIRM_LABELS[chosen as ConfirmSummaryAction]
      : PAYMENT_LABELS[chosen as PaymentTimeoutAction]
    : "";

  return (
    <div className={styles.overlay} onMouseDown={isSummary ? onClose : undefined}>
      <div
        className={`${styles.card} ${styles.cardAttention}`}
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isSummary && onClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        )}

        {allConfirmed ? (
          <>
            <div className={`${styles.iconWrap} ${styles.iconWrapSuccess}`}>
              <TrophyIcon className={styles.icon} />
            </div>
            <div className={styles.title}>Full squad confirmed! 🎉</div>
            <div className={styles.subtitle}>
              All {action.total_count} players are in for {action.pitch_name}. Time to lock it in.
            </div>
            <div className={styles.priceCard}>
              <span>Price per player</span>
              <b>{action.price_per_member} Br</b>
            </div>
            <button className={styles.primaryBtn} disabled={loading} onClick={() => onResolveSummary(action.request_id, "cover")}>
              {loading ? <SpinnerIcon className={styles.spinner} /> : "Start Payment"}
            </button>
          </>
        ) : (
          <>
            <div className={`${styles.iconWrap} ${styles.iconWrapWarn}`}>
              <AlertIcon className={styles.icon} />
            </div>
            <div className={styles.title}>
              {isSummary ? "Confirmation window closed" : "Payment window closed"}
            </div>
            <div className={styles.subtitle}>
              {isSummary
                ? `${action.confirmed_count} of ${action.total_count} confirmed for ${action.pitch_name}.`
                : `${action.paid_count ?? 0} of ${action.total_count ?? 0} paid. ${people.length} teammate${people.length === 1 ? "" : "s"} didn't pay in time.`}
            </div>

            <div className={styles.memberList}>
              {people.map((m) => (
                <div key={m.id} className={styles.memberRow}>
                  <TeamAvatar src={m.profile_photo_url} name={m.name} className={styles.memberAvatar} fallbackClassName={styles.memberAvatarFallbackText} />
                  <span className={styles.memberName}>{m.name}</span>
                  <span className={styles.declinedTag}>{isSummary ? "Not confirmed" : "Unpaid"}</span>
                </div>
              ))}
            </div>

            <div className={styles.optionsGrid}>
              {isSummary ? (
                <>
                  <button className={`${styles.optionBtn} ${chosen === "cover" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("cover")}>I'll cover for them</button>
                  <button className={`${styles.optionBtn} ${chosen === "recalculate" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("recalculate")}>Recalculate share</button>
                  <button className={`${styles.optionBtn} ${chosen === "open_slot" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("open_slot")}>Leave slot open</button>
                  <button className={`${styles.optionBtn} ${styles.optionBtnDanger} ${chosen === "cancel" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("cancel")}>Cancel booking</button>
                </>
              ) : (
                <>
                  <button className={`${styles.optionBtn} ${chosen === "remind" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("remind")}>Send again (5 min)</button>
                  <button className={`${styles.optionBtn} ${chosen === "recalculate" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("recalculate")}>Recalculate share</button>
                  <button className={`${styles.optionBtn} ${chosen === "cover" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("cover")}>I'll cover for them</button>
                  <button className={`${styles.optionBtn} ${styles.optionBtnDanger} ${chosen === "cancel" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("cancel")}>Cancel booking</button>
                </>
              )}
            </div>

            {chosen && (
              <button className={styles.primaryBtn} disabled={loading} onClick={submit}>
                {loading ? <SpinnerIcon className={styles.spinner} /> : buttonLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}