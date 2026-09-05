import { useEffect } from "react";
import styles from "./css/BookingTeamModal.module.css";
import type { MyTeam } from "../lib/team";

export type BookingStep = "closed" | "choice" | "team-select" | "team-confirm";
export type BookingModeLite = "daily" | "weekly" | "monthly";

interface BookingTeamModalProps {
  step: BookingStep;
  teams: MyTeam[];
  selectedTeam: MyTeam | null;
  pitchName: string;
  mode: BookingModeLite;
  pricePerSlot: number;
  selectedCount: number;
  totalPrice: number;
  loading: boolean;
  onClose: () => void;
  onChooseIndividual: () => void;
  onChooseTeam: () => void;
  onSelectTeam: (team: MyTeam) => void;
  onProceedToConfirm: () => void;
  onConfirmTeamBooking: () => void;
  onBack: () => void;
  onBackToTeams: () => void;
}

/* ---------------- inline icons ---------------- */

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </svg>
  );
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.2 2.9-5.5 6.5-5.5s6.5 2.3 6.5 5.5" />
      <path d="M16 9.2a3 3 0 100-6" />
      <path d="M15 14.3c2.8.4 4.9 2.4 4.9 5.7" />
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

function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.3l2.3 2.3 4.7-5" />
    </svg>
  );
}

function CoinsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M3 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      <path d="M15 9.3c2.9.4 5 1.6 5 3.2s-2.1 2.8-5 3.2" />
    </svg>
  );
}

function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="42 100"
      />
    </svg>
  );
}

function fmtBirr(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " Br";
}

function modeLabel(mode: BookingModeLite) {
  if (mode === "daily") return "hour";
  if (mode === "weekly") return "week";
  return "month";
}

export default function BookingTeamModal(props: BookingTeamModalProps) {
  const {
    step,
    teams,
    selectedTeam,
    pitchName,
    mode,
    pricePerSlot,
    selectedCount,
    totalPrice,
    loading,
    onClose,
    onChooseIndividual,
    onChooseTeam,
    onSelectTeam,
    onProceedToConfirm,
    onConfirmTeamBooking,
    onBack,
    onBackToTeams,
  } = props;

  const isOpen = step !== "closed";

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const memberCount = selectedTeam?.active_member_count || 1;
  const perMember = totalPrice / memberCount;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        {/* ---------------- STEP 1: choice ---------------- */}
        {step === "choice" && (
          <>
            <div className={styles.headerIconWrap}>
              <CoinsIcon className={styles.headerIcon} />
            </div>
            <div className={styles.title}>How are you booking?</div>
            <div className={styles.subtitle}>
              {selectedCount} slot{selectedCount === 1 ? "" : "s"} selected on{" "}
              <b>{pitchName}</b>
            </div>

            <div className={styles.optionGrid}>
              <button className={styles.optionCard} onClick={onChooseIndividual}>
                <div className={`${styles.optionIconWrap} ${styles.optionIconIndividual}`}>
                  <UserIcon />
                </div>
                <div className={styles.optionTitle}>Individual</div>
                <div className={styles.optionDesc}>I'll pay for it myself</div>
              </button>

              <button className={styles.optionCard} onClick={onChooseTeam}>
                <div className={`${styles.optionIconWrap} ${styles.optionIconTeam}`}>
                  <UsersIcon />
                </div>
                <div className={styles.optionTitle}>Team</div>
                <div className={styles.optionDesc}>Split it with my team</div>
              </button>
            </div>

            <button className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
          </>
        )}

        {/* ---------------- STEP 2: pick a team ---------------- */}
        {step === "team-select" && (
          <>
            <button className={styles.backBtn} onClick={onBack}>
              <ChevronLeftIcon /> Back
            </button>

            <div className={styles.title}>Pick a team</div>
            <div className={styles.subtitle}>
              Only teams you own are shown — members get notified to chip in.
            </div>

            {teams.length === 0 ? (
              <div className={styles.emptyTeams}>You don't own any teams yet.</div>
            ) : (
              <div className={styles.teamList}>
                {teams.map((team) => {
                  const isSelected = selectedTeam?.id === team.id;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className={`${styles.teamRow} ${isSelected ? styles.teamRowSelected : ""}`}
                      onClick={() => onSelectTeam(team)}
                    >
                      <div className={styles.teamAvatar}>
                        {team.logo ? (
                          <img src={team.logo} alt={team.name} />
                        ) : (
                          <ShieldIcon className={styles.teamAvatarFallback} />
                        )}
                      </div>
                      <div className={styles.teamRowText}>
                        <div className={styles.teamRowName}>{team.name}</div>
                        <div className={styles.teamRowMeta}>
                          {team.active_member_count} member
                          {team.active_member_count === 1 ? "" : "s"}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircleIcon className={styles.teamRowCheck} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.footerRow}>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                onClick={onProceedToConfirm}
                disabled={!selectedTeam}
              >
                Book for this team
              </button>
            </div>
          </>
        )}

        {/* ---------------- STEP 3: confirm & split cost ---------------- */}
        {step === "team-confirm" && selectedTeam && (
          <>
            <button className={styles.backBtn} onClick={onBackToTeams}>
              <ChevronLeftIcon /> Back
            </button>

            <div className={styles.confirmTeamHead}>
              <div className={styles.teamAvatar}>
                {selectedTeam.logo ? (
                  <img src={selectedTeam.logo} alt={selectedTeam.name} />
                ) : (
                  <ShieldIcon className={styles.teamAvatarFallback} />
                )}
              </div>
              <div>
                <div className={styles.title} style={{ marginBottom: 2 }}>
                  {selectedTeam.name}
                </div>
                <div className={styles.subtitle} style={{ margin: 0 }}>
                  {pitchName}
                </div>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLine}>
                <span>Slots selected</span>
                <b>{selectedCount}</b>
              </div>
              <div className={styles.summaryLine}>
                <span>Price per {modeLabel(mode)}</span>
                <b>{fmtBirr(pricePerSlot)}</b>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryLineTotal}>
                <span>Total price</span>
                <span>{fmtBirr(totalPrice)}</span>
              </div>
            </div>

            <div className={styles.splitCard}>
              <div className={styles.splitLabel}>
                Each of {memberCount} member{memberCount === 1 ? "" : "s"} pays
              </div>
              <div className={styles.splitValue}>{fmtBirr(perMember)}</div>
            </div>

            <div className={styles.footerRow}>
              <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                className={styles.primaryBtn}
                onClick={onConfirmTeamBooking}
                disabled={loading}
              >
                {loading ? (
                  <SpinnerIcon className={styles.spinner} />
                ) : (
                  "Confirm & Notify Team"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}