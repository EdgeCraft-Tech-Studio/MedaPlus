import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import styles from "./css/JoinTeam.module.css";
import { BallIcon, HashIcon, CheckCircleIcon, XIcon, ClockIcon } from "./Icons";
import { mockLookupInvitation } from "./teamMockData";
import { type InvitationLookupResult } from "./teamTypes";

type ViewState = "loading" | "code_entry" | "preview" | "not_found" | "already_handled" | "accepted" | "declined";

/**
 * Handles three of the four "Add Players" pathways from the spec:
 *  - QR code:      QR encodes this same URL, e.g. /join/bole-united?code=BOLE-7X2K
 *  - Shared link:   identical URL, just sent as a link instead of a QR image
 *  - Join code:     opened with no params (e.g. from a "Have a code?" button
 *                    elsewhere in the app) -> shows a manual code entry form
 *
 * The 4th pathway, "Search existing player", doesn't land here — that
 * invitation can be accepted directly from the notification bell in
 * AppShell.tsx, since the recipient is already inside the app.
 */
export default function JoinTeam() {
  const nav = useNavigate();
  const { teamId } = useParams<{ teamId?: string }>();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get("code") || "";

  const [view, setView] = useState<ViewState>(teamId ? "loading" : "code_entry");
  const [manualCode, setManualCode] = useState("");
  const [invitation, setInvitation] = useState<InvitationLookupResult | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // TODO: check real auth state here. If the person isn't logged in, this
  // whole page should redirect to /login?redirect=<current url> and bounce
  // them back here after they sign in/register, e.g.:
  //
  // const { user } = useAuth();
  // if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  useEffect(() => {
    if (!teamId) return;
    lookup(teamId, codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, codeFromUrl]);

  async function lookup(id: string, code: string) {
    setView("loading");
    // TODO: replace with a real API call, e.g.
    // const result = await lookupInvitation(id, code);
    await new Promise((r) => setTimeout(r, 500));
    const result = mockLookupInvitation(id, code);

    if (!result) {
      setView("not_found");
      return;
    }
    if (result.status !== "PENDING") {
      setInvitation(result);
      setView("already_handled");
      return;
    }
    setInvitation(result);
    setView("preview");
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    // The code alone doesn't tell us which team it belongs to in this demo
    // setup, so we look it up against the one team we have mock data for.
    // TODO: replace with a real "resolve code -> team + invitation" endpoint
    // that doesn't require knowing the team id up front.
    lookup("bole-united", manualCode.trim());
  }

  async function handleAccept() {
    if (!invitation) return;
    setActionLoading(true);
    try {
      // TODO: replace with the real API call, e.g.
      // await acceptTeamInvitation(invitation.invitationId);
      // The backend — not this page — is what actually creates the ACTIVE
      // TeamMembership row, per the spec's invitation-vs-membership rule.
      await new Promise((r) => setTimeout(r, 700));
      console.log("TODO: accept invitation", invitation.invitationId);
      setView("accepted");
    } catch {
      setView("not_found"); // TODO: replace with a proper inline error state
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDecline() {
    if (!invitation) return;
    setActionLoading(true);
    try {
      // TODO: await declineTeamInvitation(invitation.invitationId);
      await new Promise((r) => setTimeout(r, 500));
      console.log("TODO: decline invitation", invitation.invitationId);
      setView("declined");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link to="/home" className={styles.brand}>
          <span className={styles.brandMark}><BallIcon /></span>
          <span className={styles.brandName}>MedaPlus</span>
        </Link>

        {view === "loading" && (
          <div className={styles.stateBlock}>
            <div className={styles.spinner} />
            <p>Checking your invitation...</p>
          </div>
        )}

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
                placeholder="e.g. BOLE-7X2K"
                autoFocus
                autoCapitalize="characters"
              />
              <button type="submit" className={styles.primaryBtn} disabled={!manualCode.trim()}>
                Find team
              </button>
            </form>
          </>
        )}

        {view === "preview" && invitation && (
          <>
            <span className={styles.teamLogo}>
              {invitation.team.logo
                ? <img src={invitation.team.logo} alt="" />
                : invitation.team.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <h1 className={styles.title}>You're invited to join</h1>
            <div className={styles.teamName}>{invitation.team.name}</div>
            <div className={styles.teamMeta}>
              {invitation.team.sport} · {invitation.team.homeArea} · {invitation.team.activeCount}/{invitation.team.capacity} players
            </div>
            <p className={styles.invitedBy}>Invited by <strong>{invitation.invitedBy}</strong></p>

            <div className={styles.actionsRow}>
              <button className={styles.declineBtn} onClick={handleDecline} disabled={actionLoading}>
                Decline
              </button>
              <button className={styles.primaryBtn} onClick={handleAccept} disabled={actionLoading}>
                {actionLoading ? "Joining..." : "Accept & join"}
              </button>
            </div>
          </>
        )}

        {view === "accepted" && invitation && (
          <div className={styles.stateBlock}>
            <div className={styles.successIconWrap}><CheckCircleIcon width={30} height={30} /></div>
            <h1 className={styles.title}>You're in!</h1>
            <p className={styles.subtitle}>You're now an active member of {invitation.team.name}.</p>
            <Link to={`/teams/${invitation.team.id}`} className={styles.primaryBtn} style={{ textDecoration: "none", display: "inline-block" }}>
              Go to team
            </Link>
          </div>
        )}

        {view === "declined" && (
          <div className={styles.stateBlock}>
            <div className={styles.mutedIconWrap}><XIcon width={26} height={26} /></div>
            <h1 className={styles.title}>Invitation declined</h1>
            <p className={styles.subtitle}>No hard feelings — you can always join later with a new invite.</p>
            <Link to="/home" className={styles.ghostBtn}>Back to home</Link>
          </div>
        )}

        {view === "already_handled" && invitation && (
          <div className={styles.stateBlock}>
            <div className={styles.mutedIconWrap}><ClockIcon width={26} height={26} /></div>
            <h1 className={styles.title}>
              {invitation.status === "ACCEPTED" && "Already accepted"}
              {invitation.status === "DECLINED" && "Already declined"}
              {invitation.status === "CANCELLED" && "Invitation cancelled"}
              {invitation.status === "EXPIRED" && "Invitation expired"}
            </h1>
            <p className={styles.subtitle}>
              {invitation.status === "ACCEPTED"
                ? `You're already a member of ${invitation.team.name}.`
                : "This invitation is no longer valid. Ask for a new one if you still want to join."}
            </p>
            {invitation.status === "ACCEPTED" ? (
              <Link to={`/teams/${invitation.team.id}`} className={styles.primaryBtn} style={{ textDecoration: "none", display: "inline-block" }}>
                Go to team
              </Link>
            ) : (
              <Link to="/home" className={styles.ghostBtn}>Back to home</Link>
            )}
          </div>
        )}

        {view === "not_found" && (
          <div className={styles.stateBlock}>
            <div className={styles.errorIconWrap}><XIcon width={26} height={26} /></div>
            <h1 className={styles.title}>Invite not found</h1>
            <p className={styles.subtitle}>This link or code doesn't match an invitation. Double-check it, or ask for a new one.</p>
            <button className={styles.ghostBtn} onClick={() => { setManualCode(""); setView("code_entry"); }}>
              Try a different code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
