import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./css/JoinTeam.module.css";
import { BallIcon, HashIcon, XIcon, ClockIcon } from "./Icons";
import { lookupInvitationByCode, requestJoinViaCode, type InvitationPreview } from "../lib/team";

type ViewState = "code_entry" | "loading" | "preview" | "requesting" | "requested" | "not_found";

export default function JoinTeam() {
  const nav = useNavigate();
  const [view, setView] = useState<ViewState>("code_entry");
  const [manualCode, setManualCode] = useState("");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);

  function resetToCodeEntry() {
    setManualCode("");
    setInvitation(null);
    setError("");
    setLogoFailed(false);
    setView("code_entry");
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;

    setView("loading");
    setError("");
    try {
      const result = await lookupInvitationByCode(code);
      setInvitation(result);
      setLogoFailed(false);
      setView("preview");
    } catch (err) {
      console.error("Failed to look up invitation code:", err);
      setView("not_found");
    }
  }

  async function handleRequestJoin() {
    if (!invitation) return;
    setView("requesting");
    try {
      await requestJoinViaCode(manualCode.trim());
      setView("requested");
    } catch (err: any) {
      console.error("Failed to request join:", err);
      setError(
        err.response?.data?.detail ||
        "Couldn't send your join request. The code may have expired."
      );
      setView("preview");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to="/home" className={styles.brand}>
            <span className={styles.brandMark}><BallIcon /></span>
            <span className={styles.brandName}>MedaPlus</span>
          </Link>
          <button
            type="button"
            onClick={() => nav("/home")}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <XIcon width={18} height={18} />
          </button>
        </div>

        {view === "code_entry" && (
          <>
            <div className={styles.iconBadge}><HashIcon width={22} height={22} /></div>
            <h1 className={styles.title}>Enter your join code</h1>
            <p className={styles.subtitle}>Got a code from a teammate? Enter it below to find their team.</p>

            <form onSubmit={handleCodeSubmit} className={styles.codeForm}>
              <input
                className={styles.codeInput}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. 82KF"
                autoFocus
                autoCapitalize="characters"
              />
              <button type="submit" className={styles.primaryBtn} disabled={!manualCode.trim()}>
                Find team
              </button>
            </form>
          </>
        )}

        {view === "loading" && (
          <div className={styles.stateBlock}>
            <div className={styles.spinner} />
            <p>Looking up your code...</p>
          </div>
        )}

        {view === "preview" && invitation && (
          <>
            <span className={styles.teamLogo}>
              {invitation.team.logo && !logoFailed ? (
                <img
                  src={invitation.team.logo}
                  alt=""
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                invitation.team.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
              )}
            </span>
            <h1 className={styles.title}>Request to join</h1>
            <div className={styles.teamName}>{invitation.team.name}</div>
            <div className={styles.teamMeta}>
              {invitation.team.sport} · {invitation.team.area || invitation.team.city} ·{" "}
              {invitation.team.active_member_count}/{invitation.team.max_roster_size} players
            </div>
            <p className={styles.invitedBy}>
              Invited by{" "}
              <strong>
                {`${invitation.invited_by.first_name ?? ""} ${invitation.invited_by.last_name ?? ""}`.trim() ||
                  invitation.invited_by.username}
              </strong>
            </p>
            <p className={styles.subtitle}>
              Your request will need to be approved by the team's owner or an admin before you join.
            </p>

            {!invitation.is_redeemable && (
              <p className={styles.subtitle} style={{ color: "var(--danger)" }}>
                {invitation.is_expired ? "This code has expired." : "This code is no longer available."}
              </p>
            )}

            {error && <p className={styles.subtitle} style={{ color: "var(--danger)" }}>{error}</p>}

            <div className={styles.actionsRow}>
              <button className={styles.declineBtn} onClick={resetToCodeEntry}>
                Try another code
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleRequestJoin}
                disabled={!invitation.is_redeemable}
              >
                Request to join
              </button>
            </div>
          </>
        )}

        {view === "requesting" && (
          <div className={styles.stateBlock}>
            <div className={styles.spinner} />
            <p>Sending your request...</p>
          </div>
        )}

        {view === "requested" && invitation && (
          <div className={styles.stateBlock}>
            <div className={styles.successIconWrap}><ClockIcon width={30} height={30} /></div>
            <h1 className={styles.title}>Request sent</h1>
            <p className={styles.subtitle}>
              Your request to join {invitation.team.name} is pending approval from the team's owner or an admin.
              You'll be notified once they respond.
            </p>
            <Link to="/home" className={styles.ghostBtn}>Back to home</Link>
          </div>
        )}

        {view === "not_found" && (
          <div className={styles.stateBlock}>
            <div className={styles.errorIconWrap}><XIcon width={26} height={26} /></div>
            <h1 className={styles.title}>Code not found</h1>
            <p className={styles.subtitle}>This code doesn't match any invitation. Double-check it, or ask for a new one.</p>
            <button className={styles.ghostBtn} onClick={resetToCodeEntry}>
              Try a different code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}