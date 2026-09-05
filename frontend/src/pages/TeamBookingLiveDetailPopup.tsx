import { useEffect, useState } from "react";
import styles from "./css/TeamBookingLiveDetailPopup.module.css";
import {
  getTeamBookingLiveDetail,
  type TeamBookingLiveDetail,
  type TeamBookingMemberStatus,
  type ConfirmSummaryAction,
} from "../lib/teamBooking";
import TeamAvatar from "./TeamAvatar";
import ShimmerRows from "./ShimmerRows";

interface Props {
  requestId: string;
  onClose: () => void;
  onResolveSummary: (requestId: string, action: ConfirmSummaryAction) => Promise<void>;
  resolveLoading: boolean;
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function BackIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}
function XIcon2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
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
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" />
    </svg>
  );
}

function MemberChip({ m, tone }: { m: TeamBookingMemberStatus; tone: "green" | "gray" | "red" }) {
  return (
    <div className={`${styles.chip} ${styles[`chip_${tone}`]}`}>
      <TeamAvatar
        src={m.profile_photo_url}
        name={m.name}
        className={styles.chipAvatar}
        fallbackClassName={styles.chipAvatarFallbackText}
      />
      <span className={styles.chipName}>{m.name}</span>
    </div>
  );
}

export default function TeamBookingLiveDetailPopup({ requestId, onClose, onResolveSummary, resolveLoading }: Props) {
  const [detail, setDetail] = useState<TeamBookingLiveDetail | null>(null);
  const [chosen, setChosen] = useState<ConfirmSummaryAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getTeamBookingLiveDetail(requestId);
        if (!cancelled) {
          setDetail(data);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setDetail(null);
          setError(err?.response?.data?.detail || "You don't have access to this booking.");
        }
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId]);

  if (error) {
    return (
      <div className={styles.overlay} onMouseDown={onClose}>
        <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><CloseIcon /></button>
          <div className={styles.errorState}>{error}</div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.overlay} onMouseDown={onClose}>
        <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
          <ShimmerRows count={1} height={60} />
          <div style={{ height: 16 }} />
          <ShimmerRows count={4} height={44} />
        </div>
      </div>
    );
  }

  const totalMembers =
    detail.confirmed_members.length + detail.pending_members.length + detail.declined_members.length;
  const unconfirmedCount = detail.pending_members.length + detail.declined_members.length;
  const allConfirmed = unconfirmedCount === 0;
  const canAct =
    (detail.status === "pending" && allConfirmed) || detail.status === "expired";
  const isWaiting = detail.status === "pending" && !allConfirmed;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.backBtn} onClick={onClose}>
          <BackIcon /> Back to list
        </button>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className={styles.header}>
          <TeamAvatar
            src={detail.team_logo}
            name={detail.team_name}
            className={styles.avatar}
            fallbackClassName={styles.avatarFallbackText}
          />
          <div>
            <div className={styles.headerTeam}>{detail.team_name}</div>
            <div className={styles.headerPitch}>{detail.pitch_name}</div>
          </div>
        </div>

        <div className={styles.progressRow}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(detail.confirmed_members.length / Math.max(totalMembers, 1)) * 100}%` }}
            />
          </div>
          <span className={styles.progressText}>
            {detail.confirmed_members.length}/{totalMembers} confirmed
          </span>
        </div>

        {isWaiting && (
          <div className={styles.statusBanner}>
            <ClockIcon className={styles.statusBannerIcon} />
            Waiting on {unconfirmedCount} more response{unconfirmedCount === 1 ? "" : "s"} — window
            closes at{" "}
            {new Date(detail.expires_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
        {detail.status === "payment_pending" && (
          <div className={`${styles.statusBanner} ${styles.statusBannerPurple}`}>
            Payment window is open — closes at{" "}
            {detail.payment_expires_at &&
              new Date(detail.payment_expires_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
        {detail.status === "booked" && (
          <div className={`${styles.statusBanner} ${styles.statusBannerGreen}`}>
            Booked! Code: <b>{detail.final_booking_code}</b>
          </div>
        )}

        {detail.confirmed_members.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <CheckIcon className={styles.sectionIconGreen} /> Confirmed
            </div>
            <div className={styles.chipList}>
              {detail.confirmed_members.map((m) => <MemberChip key={m.id} m={m} tone="green" />)}
            </div>
          </div>
        )}

        {detail.pending_members.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <ClockIcon className={styles.sectionIconGray} /> Waiting for response
            </div>
            <div className={styles.chipList}>
              {detail.pending_members.map((m) => <MemberChip key={m.id} m={m} tone="gray" />)}
            </div>
          </div>
        )}

        {detail.declined_members.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <XIcon2 className={styles.sectionIconRed} /> Declined
            </div>
            <div className={styles.chipList}>
              {detail.declined_members.map((m) => <MemberChip key={m.id} m={m} tone="red" />)}
            </div>
          </div>
        )}

        {/* Everyone confirmed — celebratory, single action, no cover/recalculate/etc. */}
        {canAct && allConfirmed && (
          <>
            <div className={styles.allConfirmedBanner}>
              <TrophyIcon className={styles.allConfirmedIcon} />
              <span>Full squad confirmed! Ready to start payment.</span>
            </div>
            <button
              className={styles.primaryBtn}
              disabled={resolveLoading}
              onClick={() => onResolveSummary(detail.id, "cover")}
            >
              {resolveLoading ? <SpinnerIcon className={styles.spinner} /> : "Start Payment"}
            </button>
          </>
        )}

        {/* Window closed with gaps — show the 4 resolution options */}
        {canAct && !allConfirmed && (
          <>
            <div className={styles.optionsGrid}>
              <button className={`${styles.optionBtn} ${chosen === "cover" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("cover")}>
                I'll cover for them
              </button>
              <button className={`${styles.optionBtn} ${chosen === "recalculate" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("recalculate")}>
                Recalculate share
              </button>
              <button className={`${styles.optionBtn} ${chosen === "open_slot" ? styles.optionBtnActive : ""}`} onClick={() => setChosen("open_slot")}>
                Leave slot open
              </button>
              <button
                className={`${styles.optionBtn} ${styles.optionBtnDanger} ${chosen === "cancel" ? styles.optionBtnActive : ""}`}
                onClick={() => setChosen("cancel")}
              >
                Cancel booking
              </button>
            </div>
            <button
              className={styles.primaryBtn}
              disabled={resolveLoading || !chosen}
              onClick={() => chosen && onResolveSummary(detail.id, chosen)}
            >
              {resolveLoading ? <SpinnerIcon className={styles.spinner} /> : "Continue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}