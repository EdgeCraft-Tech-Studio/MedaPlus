import styles from "./css/BookedPitchSummaryPopup.module.css";
import type { BookedPitchSummary } from "../lib/teamBooking";
import TeamAvatar from "./TeamAvatar";

interface Props {
  summary: BookedPitchSummary;
  onClose: () => void;
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

function formatWhen(selections: { start_iso: string; end_iso: string }[]) {
  if (!selections.length) return "";
  const first = new Date(selections[0].start_iso);
  const label = first.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
  return selections.length === 1 ? label : `${label} (+${selections.length - 1} more)`;
}

export default function BookedPitchSummaryPopup({ summary, onClose }: Props) {
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className={styles.iconWrap}>
          <CheckCircleIcon className={styles.icon} />
        </div>

        <div className={styles.title}>Pitch Booked!</div>
        <div className={styles.subtitle}>{summary.team_name}'s game is confirmed.</div>

        <div className={styles.detailCard}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Pitch</span>
            <span className={styles.detailValue}>{summary.pitch_name}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>When</span>
            <span className={styles.detailValue}>{formatWhen(summary.selections)}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Booking code</span>
            <span className={styles.detailValueMono}>{summary.final_booking_code}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Total paid</span>
            <span className={styles.detailValueMono}>{summary.total_price} Br</span>
          </div>
        </div>

        {summary.is_owner_or_admin ? (
          <>
            <div className={styles.sectionLabel}>
              Paid ({summary.paid_count}/{summary.total_count})
            </div>
            <div className={styles.chipList}>
              {summary.paid_members.map((m) => (
                <div key={m.id} className={styles.chip}>
                  <TeamAvatar src={m.profile_photo_url} name={m.name} className={styles.chipAvatar} fallbackClassName={styles.chipAvatarFallback} />
                  <span>{m.name}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.playerCountCard}>
            <span>Players who paid</span>
            <b>{summary.paid_count}/{summary.total_count}</b>
          </div>
        )}
      </div>
    </div>
  );
}