import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import styles from "./css/TeamMembers.module.css";
import AppHeader from "./AppHeader";

/*
 * Grounded in the "Team Creation & Membership" focused specification:
 * - Team roles: Owner / Admin / Member permissions.
 * - Visibility (2 types): Public — listed in search, players send a join
 *   request that the owner/admin approves or rejects. Private — hidden
 *   from search, no join requests accepted at all; membership only via
 *   invite link, join code, or direct invitation.
 * - Any invite (link, code, direct) adds the recipient as a member
 *   immediately — sending the invite is the approval, no separate step.
 * - Membership business rules: exactly one owner at all times; ownership
 *   must be transferred before the owner can leave; a member in an active
 *   payment session can't leave until it ends; removing a member never
 *   deletes historical messages, payments, or bookings; a team can be
 *   deactivated but its financial/booking history stays available to
 *   authorized users and admins.
 * - TM-02: "Owner/admin can invite, approve, reject, remove and promote
 *   members."
 *
 * This page intentionally has no "assign players" field on the create-team
 * form — team creation and membership are two separate steps, and this
 * page is where the roster actually gets built.
 */

/* ---------- icons ---------- */

function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}
function LinkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9.5 14.5l5-5M8 10.5L6 12.5a3.2 3.2 0 004.5 4.5l2-2M16 13.5l2-2a3.2 3.2 0 00-4.5-4.5l-2 2" />
    </svg>
  );
}
function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9.5 3.5L7 20.5M17 3.5l-2.5 17M4 8.5h16M3 15.5h16" />
    </svg>
  );
}
function MailIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7l7.5 6 7.5-6" />
    </svg>
  );
}
function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
      <path d="M5.5 15.5h-1a2 2 0 01-2-2v-9a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3" />
    </svg>
  );
}
function ArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
function ArrowDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
function CrownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 17.5h16M5 17.5l-1.4-9L9 12l3-6.5L15 12l5.4-3.5-1.4 9" />
    </svg>
  );
}
function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 12.5a1 1 0 001 1h6a1 1 0 001-1L18 7" />
    </svg>
  );
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.4" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function DocIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 3.5h8l4 4V20a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" />
      <path d="M14 3.5V8h4M8 12h8M8 15.5h8" />
    </svg>
  );
}

/* ---------- types & mock data ---------- */
/* TODO: replace every MOCK_* constant below with data fetched by teamId
   from the team-management service (see §10 "Team" and "Team membership"
   entities) once that API exists. */

type Role = "owner" | "admin" | "member";
type Visibility = "public" | "private";

interface Member {
  id: string;
  name: string;
  role: Role;
  isYou?: boolean;
  photoUrl?: string; // profile photo — falls back to initials when absent
  inActiveSession?: boolean; // §3: can't leave/be removed mid payment session
}

interface JoinRequest {
  id: string;
  name: string;
  photoUrl?: string;
  requestedAgo: string;
}

interface PendingInvite {
  id: string;
  target: string;
  sentAgo: string;
}

function humanize(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const ROLE_INFO: Record<Role, { label: string; permissions: string }> = {
  owner: {
    label: "Owner",
    permissions: "Edit or deactivate the team, manage roles, transfer ownership, initiate bookings, moderate chat.",
  },
  admin: {
    label: "Admin",
    permissions: "Approve requests, invite or remove members, moderate chat, initiate bookings if permitted.",
  },
  member: {
    label: "Member",
    permissions: "Take part in chat, polls, games and payments; can leave when there's no active obligation.",
  },
};

function Avatar({
  name,
  photoUrl,
  role,
}: {
  name: string;
  photoUrl?: string;
  role?: Role;
}) {
  return (
    <span className={styles.avatar} data-role={role}>
      {photoUrl ? (
        <img src={photoUrl} alt="" className={styles.avatarImg} />
      ) : (
        initialsFromName(name)
      )}
    </span>
  );
}

export default function TeamMembers() {
  const navigate = useNavigate();
  const { teamId: rawTeamId } = useParams();
  const teamId = rawTeamId || "riverside-falcons";

  const team = useMemo(
    () => ({
      id: teamId,
      name: humanize(teamId),
      sport: "Football",
      homeArea: "Bole, Addis Ababa",
      capacity: 16,
      visibility: "public" as Visibility,
    }),
    [teamId]
  );

  const [members, setMembers] = useState<Member[]>([
    { id: "m1", name: "You", role: "owner", isYou: true },
    { id: "m2", name: "Abel Tesfaye", role: "admin" },
    { id: "m3", name: "Sara Getu", role: "member", inActiveSession: true },
    { id: "m4", name: "Nahom Bekele", role: "member" },
  ]);

  const [requests, setRequests] = useState<JoinRequest[]>([
    { id: "r1", name: "Mekdes Alemu", requestedAgo: "2h ago" },
    { id: "r2", name: "Yonas Fikru", requestedAgo: "1d ago" },
  ]);

  const [invites, setInvites] = useState<PendingInvite[]>([
    { id: "i1", target: "kebede@example.com", sentAgo: "3h ago" },
  ]);

  const [joinCode] = useState("RVF-7K2Q");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(null);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateInput, setDeactivateInput] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  const currentUserRole: Role = members.find((m) => m.isYou)?.role ?? "member";
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const isOwner = currentUserRole === "owner";

  async function copyToClipboard(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1800);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — fail quietly.
    }
  }

  function isValidInviteTarget(v: string) {
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const username = /^[a-zA-Z0-9_.]{3,24}$/;
    return email.test(v) || username.test(v);
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    const value = inviteInput.trim();
    if (!value) {
      setInviteError("Enter an email or username to invite.");
      return;
    }
    if (!isValidInviteTarget(value)) {
      setInviteError("Enter a valid email or a username (3–24 letters, numbers, . or _).");
      return;
    }
    setInviteError(null);
    setSendingInvite(true);
    try {
      // TODO: await teamsApi.inviteMember(team.id, value) — TM-02 "invite"
      // direct-invitation path (§3 private-team joining rule); triggers the
      // "Invitation or join request" notification event (§5).
      await new Promise((resolve) => setTimeout(resolve, 700));
      setInvites((list) => [{ id: `i${Date.now()}`, target: value, sentAgo: "just now" }, ...list]);
      setInviteInput("");
    } finally {
      setSendingInvite(false);
    }
  }

  async function cancelInvite(id: string) {
    setBusyId(id);
    try {
      // TODO: await teamsApi.cancelInvite(team.id, id)
      await new Promise((resolve) => setTimeout(resolve, 500));
      setInvites((list) => list.filter((i) => i.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  async function approveRequest(req: JoinRequest) {
    setBusyId(req.id);
    try {
      // TODO: await teamsApi.approveJoinRequest(team.id, req.id) — TM-02
      // "approve"; adds the player as a member (§3 "Request to join" rule).
      await new Promise((resolve) => setTimeout(resolve, 700));
      setRequests((list) => list.filter((r) => r.id !== req.id));
      setMembers((list) => [...list, { id: `m${Date.now()}`, name: req.name, role: "member" }]);
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRequest(req: JoinRequest) {
    setBusyId(req.id);
    try {
      // TODO: await teamsApi.rejectJoinRequest(team.id, req.id) — TM-02 "reject".
      await new Promise((resolve) => setTimeout(resolve, 500));
      setRequests((list) => list.filter((r) => r.id !== req.id));
    } finally {
      setBusyId(null);
    }
  }

  async function promote(member: Member) {
    setBusyId(member.id);
    try {
      // TODO: await teamsApi.updateMemberRole(team.id, member.id, "admin") — TM-02 "promote".
      await new Promise((resolve) => setTimeout(resolve, 600));
      setMembers((list) =>
        list.map((m) => (m.id === member.id ? { ...m, role: "admin" } : m))
      );
    } finally {
      setBusyId(null);
    }
  }

  async function demote(member: Member) {
    setBusyId(member.id);
    try {
      // TODO: await teamsApi.updateMemberRole(team.id, member.id, "member").
      await new Promise((resolve) => setTimeout(resolve, 600));
      setMembers((list) =>
        list.map((m) => (m.id === member.id ? { ...m, role: "member" } : m))
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(member: Member) {
    setBusyId(member.id);
    try {
      // TODO: await teamsApi.removeMember(team.id, member.id) — TM-02
      // "remove". §3: this never deletes the member's historical messages,
      // payments, or booking records.
      await new Promise((resolve) => setTimeout(resolve, 700));
      setMembers((list) => list.filter((m) => m.id !== member.id));
    } finally {
      setBusyId(null);
      setConfirmRemoveId(null);
    }
  }

  async function transferOwnership(member: Member) {
    setBusyId(member.id);
    try {
      // TODO: await teamsApi.transferOwnership(team.id, member.id) — §3:
      // "A team must always have exactly one owner. Ownership must be
      // transferred before the current owner can leave."
      await new Promise((resolve) => setTimeout(resolve, 800));
      setMembers((list) =>
        list.map((m) => {
          if (m.id === member.id) return { ...m, role: "owner" };
          if (m.role === "owner") return { ...m, role: "admin" };
          return m;
        })
      );
    } finally {
      setBusyId(null);
      setConfirmTransferId(null);
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      // TODO: await teamsApi.deactivateTeam(team.id) — §3: the team can be
      // deactivated, but its financial and booking history stays available
      // to authorized users and administrators.
      await new Promise((resolve) => setTimeout(resolve, 900));
      navigate("/");
    } finally {
      setDeactivating(false);
    }
  }

  const capacityUsed = members.length;
  const capacityPct = Math.min(100, (capacityUsed / team.capacity) * 100);

  return (
    <div className={styles.page}>
      
        <AppHeader variant="logout"/>
        <br />
        <Link to="/home" className={styles.backLink}>
          <ArrowLeftIcon width={15} height={15} />
          Back home
        </Link>

      <header className={styles.hero}>
        <div className={styles.heroBadge}>
          <span>{initialsFromName(team.name)}</span>
        </div>
        <span className={styles.eyebrow}>Team management</span>
        <h1 className={styles.heroTitle}>
          Build the <em>{team.name}</em> roster
        </h1>
        <p className={styles.heroSubtitle}>
          {team.sport} · {team.homeArea} · {capacityUsed}/{team.capacity} members
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {!canManage && (
            <div className={styles.banner} data-tone="info">
              You're viewing as a member. Only the owner or an admin can invite, approve, or remove
              players.
            </div>
          )}

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Add players</h2>
            <p className={styles.cardHint}>
              This team is <strong>{team.visibility === "public" ? "Public" : "Private"}</strong> —{" "}
              {team.visibility === "public"
                ? "it's listed in search, so players can also send a join request below."
                : "it's hidden from search, so link, code, or direct invite are the only ways in."}{" "}
              Any invite adds someone immediately — no separate approval step.
            </p>

            <div className={styles.inviteGrid}>
              <div className={styles.inviteMethod}>
                <span className={styles.inviteMethodIcon}>
                  <LinkIcon width={16} height={16} />
                </span>
                <div className={styles.inviteMethodBody}>
                  <span className={styles.inviteMethodLabel}>Invite link</span>
                  <code className={styles.inviteValue}>meda.plus/join/{team.id}</code>
                </div>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => copyToClipboard(`https://meda.plus/join/${team.id}`, "link")}
                  disabled={!canManage}
                >
                  {copiedField === "link" ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
                  {copiedField === "link" ? "Copied" : "Copy"}
                </button>
              </div>

              <div className={styles.inviteMethod}>
                <span className={styles.inviteMethodIcon}>
                  <HashIcon width={16} height={16} />
                </span>
                <div className={styles.inviteMethodBody}>
                  <span className={styles.inviteMethodLabel}>Join code</span>
                  <code className={styles.inviteValue}>{joinCode}</code>
                </div>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => copyToClipboard(joinCode, "code")}
                  disabled={!canManage}
                >
                  {copiedField === "code" ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
                  {copiedField === "code" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <form className={styles.inviteForm} onSubmit={handleSendInvite} noValidate>
              <span className={styles.inviteMethodIcon}>
                <MailIcon width={16} height={16} />
              </span>
              <input
                className={styles.inviteInput}
                data-invalid={!!inviteError}
                placeholder="Direct invite — email or username"
                value={inviteInput}
                onChange={(e) => {
                  setInviteInput(e.target.value);
                  if (inviteError) setInviteError(null);
                }}
                disabled={!canManage}
              />
              <button type="submit" className={styles.btnPrimary} disabled={!canManage || sendingInvite}>
                {sendingInvite ? <SpinnerIcon className={styles.spin} width={15} height={15} /> : "Send invite"}
              </button>
            </form>
            {inviteError && <span className={styles.errorText}>{inviteError}</span>}

            {invites.length > 0 && (
              <ul className={styles.inviteList}>
                {invites.map((inv) => (
                  <li key={inv.id} className={styles.inviteListItem}>
                    <span>
                      Invited <strong>{inv.target}</strong>
                      <span className={styles.mutedInline}> · {inv.sentAgo}</span>
                    </span>
                    <button
                      type="button"
                      className={styles.smallGhostBtn}
                      onClick={() => cancelInvite(inv.id)}
                      disabled={busyId === inv.id || !canManage}
                    >
                      {busyId === inv.id ? <SpinnerIcon className={styles.spin} width={12} height={12} /> : "Cancel"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {team.visibility === "public" && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>
                Join requests
                {requests.length > 0 && <span className={styles.countPill}>{requests.length}</span>}
              </h2>
              {requests.length === 0 ? (
                <p className={styles.emptyState}>No pending requests right now.</p>
              ) : (
                <ul className={styles.requestList}>
                  {requests.map((req) => (
                    <li key={req.id} className={styles.requestItem}>
                      <div className={styles.memberIdentity}>
                        <Avatar name={req.name} photoUrl={req.photoUrl} />
                        <div>
                          <span className={styles.memberName}>{req.name}</span>
                          <span className={styles.mutedInline}> · requested {req.requestedAgo}</span>
                        </div>
                      </div>
                      <div className={styles.requestActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          data-tone="positive"
                          onClick={() => approveRequest(req)}
                          disabled={busyId === req.id || !canManage}
                          aria-label="Approve"
                        >
                          {busyId === req.id ? (
                            <SpinnerIcon className={styles.spin} width={14} height={14} />
                          ) : (
                            <CheckIcon width={14} height={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          data-tone="negative"
                          onClick={() => rejectRequest(req)}
                          disabled={busyId === req.id || !canManage}
                          aria-label="Reject"
                        >
                          <XIcon width={14} height={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              Roster
              <span className={styles.countPill}>{members.length}</span>
            </h2>

            <ul className={styles.memberList}>
              {members.map((member) => {
                const isConfirmingRemove = confirmRemoveId === member.id;
                const isConfirmingTransfer = confirmTransferId === member.id;
                const isBusy = busyId === member.id;
                const canRemove = canManage && member.role !== "owner" && !member.inActiveSession;

                return (
                  <li key={member.id} className={styles.memberItem}>
                    <div className={styles.memberIdentity}>
                      <Avatar name={member.name} photoUrl={member.photoUrl} role={member.role} />
                      <div>
                        <span className={styles.memberName}>
                          {member.name}
                          {member.isYou && <span className={styles.youTag}>you</span>}
                        </span>
                        <div className={styles.memberMetaRow}>
                          <span className={styles.roleBadge} data-role={member.role}>
                            {member.role === "owner" && <CrownIcon width={11} height={11} />}
                            {ROLE_INFO[member.role].label}
                          </span>
                          {member.inActiveSession && (
                            <span className={styles.lockBadge}>
                              <LockIcon width={11} height={11} />
                              In active payment session
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {canManage && !member.isYou && (
                      <div className={styles.memberActions}>
                        {isConfirmingTransfer ? (
                          <>
                            <span className={styles.confirmText}>Make {member.name} owner?</span>
                            <button
                              type="button"
                              className={styles.smallGhostBtn}
                              onClick={() => setConfirmTransferId(null)}
                              disabled={isBusy}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.smallDangerBtn}
                              onClick={() => transferOwnership(member)}
                              disabled={isBusy}
                            >
                              {isBusy ? <SpinnerIcon className={styles.spin} width={12} height={12} /> : "Confirm"}
                            </button>
                          </>
                        ) : isConfirmingRemove ? (
                          <>
                            <span className={styles.confirmText}>Remove from team?</span>
                            <button
                              type="button"
                              className={styles.smallGhostBtn}
                              onClick={() => setConfirmRemoveId(null)}
                              disabled={isBusy}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.smallDangerBtn}
                              onClick={() => removeMember(member)}
                              disabled={isBusy}
                            >
                              {isBusy ? <SpinnerIcon className={styles.spin} width={12} height={12} /> : "Confirm"}
                            </button>
                          </>
                        ) : (
                          <>
                            {member.role === "member" && (
                              <button
                                type="button"
                                className={styles.iconBtn}
                                title="Promote to admin"
                                onClick={() => promote(member)}
                                disabled={isBusy}
                              >
                                <ArrowUpIcon width={13} height={13} />
                              </button>
                            )}
                            {member.role === "admin" && (
                              <button
                                type="button"
                                className={styles.iconBtn}
                                title="Move back to member"
                                onClick={() => demote(member)}
                                disabled={isBusy}
                              >
                                <ArrowDownIcon width={13} height={13} />
                              </button>
                            )}
                            {isOwner && member.role !== "owner" && (
                              <button
                                type="button"
                                className={styles.iconBtn}
                                title="Transfer ownership"
                                onClick={() => setConfirmTransferId(member.id)}
                                disabled={isBusy}
                              >
                                <CrownIcon width={13} height={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.iconBtn}
                              data-tone="negative"
                              title={
                                member.inActiveSession
                                  ? "Can't remove — in an active payment session"
                                  : "Remove from team"
                              }
                              onClick={() => setConfirmRemoveId(member.id)}
                              disabled={!canRemove || isBusy}
                            >
                              <TrashIcon width={13} height={13} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {isOwner && (
            <section className={styles.card} data-danger="true">
              <h2 className={styles.cardTitle}>Danger zone</h2>
              <div className={styles.dangerRow}>
                <div>
                  <span className={styles.dangerLabel}>Leave this team</span>
                  <p className={styles.cardHint}>
                    You're the owner — transfer ownership to someone else first before you can
                    leave.
                  </p>
                </div>
                <button type="button" className={styles.btnGhost} disabled title="Transfer ownership first">
                  Leave team
                </button>
              </div>

              <div className={styles.dangerRow}>
                <div>
                  <span className={styles.dangerLabel}>Deactivate team</span>
                  <p className={styles.cardHint}>
                    Hides the team going forward. Financial and booking history stays available to
                    authorized users and admins.
                  </p>
                </div>
                {deactivateOpen ? (
                  <div className={styles.deactivateConfirm}>
                    <input
                      className={styles.inviteInput}
                      placeholder={`Type "${team.name}" to confirm`}
                      value={deactivateInput}
                      onChange={(e) => setDeactivateInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.smallGhostBtn}
                      onClick={() => {
                        setDeactivateOpen(false);
                        setDeactivateInput("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.smallDangerBtn}
                      disabled={deactivateInput.trim() !== team.name || deactivating}
                      onClick={handleDeactivate}
                    >
                      {deactivating ? <SpinnerIcon className={styles.spin} width={12} height={12} /> : "Deactivate"}
                    </button>
                  </div>
                ) : (
                  <button type="button" className={styles.smallDangerBtn} onClick={() => setDeactivateOpen(true)}>
                    Deactivate team
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className={styles.sideCol}>
          <div className={styles.snapshotCard}>
            <span className={styles.snapshotLabel}>Roster capacity</span>
            <div className={styles.capacityTrack}>
              <div className={styles.capacityFill} style={{ width: `${capacityPct}%` }} />
            </div>
            <span className={styles.capacityText}>
              {capacityUsed} / {team.capacity} members
            </span>

            <div className={styles.roleLegend}>
              {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
                <div key={r} className={styles.roleLegendRow}>
                  <span className={styles.roleBadge} data-role={r}>
                    {r === "owner" && <CrownIcon width={10} height={10} />}
                    {ROLE_INFO[r].label}
                  </span>
                  <span className={styles.roleLegendText}>{ROLE_INFO[r].permissions}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.tipCard}>
            <h4 className={styles.tipTitle}>
              <DocIcon width={14} height={14} />
              From the proposal
            </h4>
            <ul className={styles.tipList}>
              <li>A team always has exactly one owner — transfer before you can leave.</li>
              <li>Removing someone never deletes their past messages, payments, or bookings.</li>
              <li>Members mid payment session can't be removed until it finishes.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
