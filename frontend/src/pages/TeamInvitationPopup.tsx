import { useEffect, useState } from "react";
import styles from "./css/TeamInvitationPopup.module.css";
import {
  getMyInvitationDetail,
  acceptInvitationById,
  declineInvitationById,
  type InvitationDetailPreview,
} from "../lib/team";

interface Props {
  invitationId: string;
  onClose: () => void;
  onAccepted: () => void;
  onDeclined: () => void;
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l7 3v6c0 4.6-3 8-7 9-4-1-7-4.4-7-9V6l7-3z" />
    </svg>
  );
}
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.2 2.9-5.5 6.5-5.5s6.5 2.3 6.5 5.5" />
    </svg>
  );
}
function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
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

export default function TeamInvitationPopup({ invitationId, onClose, onAccepted, onDeclined }: Props) {
  const [detail, setDetail] = useState<InvitationDetailPreview | null>(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyInvitationDetail(invitationId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this invitation.");
      });
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  async function handleAccept() {
    setActing("accept");
    try {
      await acceptInvitationById(invitationId);
      onAccepted();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Couldn't accept this invitation.");
      setActing(null);
    }
  }

  async function handleDecline() {
    setActing("decline");
    try {
      await declineInvitationById(invitationId);
      onDeclined();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Couldn't decline this invitation.");
      setActing(null);
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.card} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {!detail && !error && (
          <div className={styles.loadingWrap}>
            <SpinnerIcon className={styles.spinnerLarge} />
          </div>
        )}

        {error && <div className={styles.errorState}>{error}</div>}

        {detail && (
          <>
            <div className={styles.teamAvatar}>
              {detail.team.logo ? (
                <img src={detail.team.logo} alt={detail.team.name} />
              ) : (
                <ShieldIcon className={styles.teamAvatarFallback} />
              )}
            </div>

            <div className={styles.title}>{detail.team.name}</div>
            <div className={styles.subtitle}>
              {detail.invited_by.first_name || detail.invited_by.username} invited you to join this team.
            </div>

            <div className={styles.detailCard}>
              <div className={styles.detailRow}>
                <UsersIcon className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>Squad size</div>
                  <div className={styles.detailValue}>
                    {detail.team.active_member_count}/{detail.team.max_roster_size} players
                  </div>
                </div>
              </div>
              <div className={styles.detailRow}>
                <PinIcon className={styles.detailIcon} />
                <div>
                  <div className={styles.detailLabel}>Location</div>
                  <div className={styles.detailValue}>
                    {[detail.team.area, detail.team.city].filter(Boolean).join(", ") || "Not specified"}
                  </div>
                </div>
              </div>
            </div>

            {!confirmingDecline ? (
              <div className={styles.footerRow}>
                <button
                  className={styles.rejectBtn}
                  onClick={() => setConfirmingDecline(true)}
                  disabled={!!acting}
                >
                  Reject
                </button>
                <button className={styles.acceptBtn} onClick={handleAccept} disabled={!!acting}>
                  {acting === "accept" ? <SpinnerIcon className={styles.spinner} /> : "Accept"}
                </button>
              </div>
            ) : (
              <div className={styles.confirmDeclineBox}>
                <div className={styles.confirmDeclineText}>
                  Reject this invitation from {detail.team.name}?
                </div>
                <div className={styles.footerRow}>
                  <button
                    className={styles.rejectBtnGhost}
                    onClick={() => setConfirmingDecline(false)}
                    disabled={!!acting}
                  >
                    Go back
                  </button>
                  <button className={styles.rejectBtnFinal} onClick={handleDecline} disabled={!!acting}>
                    {acting === "decline" ? <SpinnerIcon className={styles.spinner} /> : "Yes, reject"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}