import { useState } from "react";
import styles from "./css/ManageRoster.module.css";
import {
  UserPlusIcon, SearchIcon, LinkIcon, HashIcon, CopyIcon, XIcon, MoreIcon, EditIcon, TrashIcon, CheckIcon,
} from "./Icons";
import {
  type RosterMember, type TeamInvitationItem, type JoinRequestItem, type TeamDashboardData,
  promoteMember, demoteMember, removeMember, transferOwnership,
  cancelInvitation, approveJoinRequest, rejectJoinRequest,
  createLinkInvitation, createCodeInvitation, updateInvitation,
} from "../lib/team";

type SubTab = "members" | "invitations" | "requests";
type AddMethod = "search" | "link" | "code";

const SOURCE_LABEL: Record<string, string> = {
  team_creation: "Created the team",
  direct_invitation: "Direct invite",
  link_invitation: "Invite link",
  code_invitation: "Join code",
  join_request: "Approved join request",
  ownership_transfer: "Ownership transfer",
};

const POSITION_LABEL: Record<string, string> = {
  gk: "Goalkeeper", def: "Defender", mid: "Midfielder", fwd: "Forward",
};

const STATUS_STYLE: Record<string, { label: string; tone: "green" | "gray" | "red" }> = {
  pending: { label: "Pending", tone: "green" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "red" },
  expired: { label: "Expired", tone: "red" },
};

function buildInviteLink(slug: string, token: string) {
  // TODO: confirm this matches your real frontend join route.
  return `https://medaplus.app/join/${slug}?token=${token}`;
}

export default function ManageRoster({
  team, roster, invitations, joinRequests, canManage, slug, onRosterChange,
}: {
  team: TeamDashboardData;
  roster: RosterMember[];
  invitations: TeamInvitationItem[];
  joinRequests: JoinRequestItem[];
  canManage: boolean;
  slug: string;
  onRosterChange: () => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("members");
  const [modalOpen, setModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingInvite, setEditingInvite] = useState<TeamInvitationItem | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<TeamInvitationItem | null>(null);

  const pendingInvites = invitations.filter((i) => i.status === "pending" && !i.is_expired);
  const pendingRequests = joinRequests.filter((r) => r.status === "pending");

    async function handleRoleChange(memberId: string, newRole: "admin" | "member") {
    setOpenMenuId(null);
    setActionError("");
    try {
      if (newRole === "admin") await promoteMember(slug, memberId);
      else await demoteMember(slug, memberId);
      onRosterChange();
    } catch (err: any) {
      const message = err?.response?.data?.detail;
      setActionError(message || "Couldn't update this member's role. Try again.");
    }
  }


async function handleRemoveMember(memberId: string) {
    setOpenMenuId(null);
    setActionError("");
    try {
      await removeMember(slug, memberId);
      onRosterChange();
    } catch (err: any) {
      const message = err?.response?.data?.detail;
      setActionError(message || "Couldn't remove this member. Try again.");
    }
  }

  

  async function handleTransferOwnership(memberId: string) {
    setOpenMenuId(null);
    setActionError("");
    try {
      await transferOwnership(slug, memberId);
      onRosterChange();
    } catch (err: any) {
      const message = err?.response?.data?.detail;
      setActionError(message || "Couldn't transfer ownership. Try again.");
    }
  }
  


async function handleApproveRequest(requestId: string) {
    setActionError("");
    try {
      await approveJoinRequest(slug, requestId);
      onRosterChange();
    } catch (err: any) {
      const message = err?.response?.data?.detail;
      setActionError(message || "Couldn't approve this request. Try again.");
    }
  }


  async function handleRejectRequest(requestId: string) {
    setActionError("");
    try {
      await rejectJoinRequest(slug, requestId);
      onRosterChange();
    } catch (err: any) {
      const message = err?.response?.data?.detail;
      setActionError(message || "Couldn't reject this request. Try again.");
    }
  }

  async function handleCopy(inv: TeamInvitationItem) {
    const value = inv.invitation_type === "code" ? inv.code : (inv.token ? buildInviteLink(slug, inv.token) : null);
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((id) => (id === inv.id ? null : id)), 1500);
    } catch {
      // clipboard unavailable — nothing to fall back to inline here
    }
  }

  async function handleConfirmDelete() {
    if (!deletingInvite) return;
    setActionError("");
    try {
      await cancelInvitation(slug, deletingInvite.id);
      setDeletingInvite(null);
      onRosterChange();
    } catch (err: any) {
      const message = err?.response?.data?.detail;
      setActionError(message || "Couldn't delete this invitation. Try again.");
      setDeletingInvite(null);
    }
  }

  function displayName(user: RosterMember["user"]) {
    const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    return name || user.username || "Unknown player";
  }

  function firstLetter(user: RosterMember["user"] | JoinRequestItem["user"], fallbackName: string) {
    const source = user.first_name?.trim() || fallbackName?.trim();
    if (!source) return "–";
    return source[0].toUpperCase();
  }

  function formatShortDate(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
  }

  return (
    <div className={styles.wrap}>
      {actionError && <div className={styles.errorBanner}>{actionError}</div>}

      <div className={styles.topRow}>
        <div className={styles.capacitySummary}>
          <div className={styles.capacityHeadline}>
            <span>{roster.length}</span> / {team.max_roster_size} active players
          </div>
          <div className={styles.capBar}>
            <div className={styles.capFill} style={{ width: `${Math.min((roster.length / team.max_roster_size) * 100, 100)}%` }} />
          </div>
        </div>

        {canManage && (
          <button className={styles.addBtn} onClick={() => setModalOpen(true)}>
            <UserPlusIcon width={16} height={16} />
            Add players
          </button>
        )}
      </div>

      <div className={styles.subTabs}>
        <button className={`${styles.subTab} ${subTab === "members" ? styles.subTabActive : ""}`} onClick={() => setSubTab("members")}>
          Active members
        </button>
        {canManage && (
          <button className={`${styles.subTab} ${subTab === "invitations" ? styles.subTabActive : ""}`} onClick={() => setSubTab("invitations")}>
            Invitations
            {pendingInvites.length > 0 && <span className={styles.subTabCount}>{pendingInvites.length}</span>}
          </button>
        )}
        {canManage && team.visibility === "public" && (
          <button className={`${styles.subTab} ${subTab === "requests" ? styles.subTabActive : ""}`} onClick={() => setSubTab("requests")}>
            Join requests
            {pendingRequests.length > 0 && <span className={styles.subTabCount}>{pendingRequests.length}</span>}
          </button>
        )}
      </div>

      {subTab === "members" && (
        roster.length === 0 ? (
          <div className={styles.emptyMini}>No active players yet — add your first one above.</div>
        ) : (
          <div className={styles.list}>
            {roster.map((m) => {
              const name = displayName(m.user);
              const positionLabel = m.preferred_position ? POSITION_LABEL[m.preferred_position] ?? m.preferred_position : null;
              return (
                <div key={m.id} className={styles.memberRow}>
                  <span className={styles.avatar}>
                    {m.user.profile_photo_url ? <img src={m.user.profile_photo_url} alt="" /> : firstLetter(m.user, name)}
                  </span>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowName}>
                      {name}
                      {m.jersey_number != null && <span className={styles.roleTag}>#{m.jersey_number}</span>}
                      <span className={styles.roleTag} data-role={m.role.toUpperCase()}>
                        {m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Member"}
                      </span>
                    </div>
                    <div className={styles.rowMeta}>
                      {positionLabel && <>{positionLabel} · </>}
                      Joined {formatShortDate(m.joined_at)}
                      {m.source && <> · {SOURCE_LABEL[m.source] ?? m.source}</>}
                    </div>
                  </div>

                  {canManage && m.role !== "owner" && (
                    <div className={styles.rowActions} style={{ position: "relative" }}>
                      <button className={styles.iconBtn} onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)} aria-label="Member actions">
                        <MoreIcon width={16} height={16} />
                      </button>
                      {openMenuId === m.id && (
                        <div className={styles.menuPanel}>
                          {m.role === "member" && (
                            <button className={styles.menuItem} onClick={() => handleRoleChange(m.id, "admin")}>Make admin</button>
                          )}
                          {m.role === "admin" && (
                            <button className={styles.menuItem} onClick={() => handleRoleChange(m.id, "member")}>Remove admin</button>
                          )}
                          {team.my_role === "owner" && (
                            <button className={styles.menuItem} onClick={() => handleTransferOwnership(m.id)}>Transfer ownership</button>
                          )}
                          <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => handleRemoveMember(m.id)}>Remove from team</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {subTab === "invitations" && (
        invitations.length === 0 ? (
          <div className={styles.emptyMini}>No invitations sent yet.</div>
        ) : (
          <div className={styles.list}>
            {invitations.map((inv) => {
              const displayLabel = inv.invitation_type === "code" && inv.code ? inv.code : "Link";
              const statusStyle = STATUS_STYLE[inv.status] ?? { label: inv.status, tone: "gray" };
              const dateRange = inv.expires_at
                ? `${formatShortDate(inv.created_at)} - ${formatShortDate(inv.expires_at)}`
                : `${formatShortDate(inv.created_at)} - No expiry`;
              const canEdit = canManage && inv.status === "pending" && !inv.is_expired;
              const canCopy = inv.invitation_type === "code" ? !!inv.code : !!inv.token;

              return (
                <div key={inv.id} className={styles.inviteRow}>
                  <div className={styles.rowInfo}>
                    <div className={styles.inviteLabelRow}>
                      {displayLabel}
                      {canCopy && (
                        <button
                          type="button"
                          className={styles.copyIconBtn}
                          onClick={() => handleCopy(inv)}
                          aria-label="Copy"
                        >
                          {copiedId === inv.id ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
                        </button>
                      )}
                    </div>
                    <div className={styles.rowMeta}>
                      {dateRange}
                      {inv.invitation_type !== "direct" && (
                        <> · {inv.redemption_count} used{inv.remaining_uses != null ? ` / ${inv.max_uses}` : " · unlimited"}</>
                      )}
                    </div>
                  </div>
                  <span className={styles.statusTag} data-tone={statusStyle.tone}>{statusStyle.label}</span>
                  {canEdit && (
                    <div className={styles.inviteActionGroup}>
                      <button className={styles.inviteIconBtn} onClick={() => setEditingInvite(inv)} aria-label="Edit">
                        <EditIcon width={15} height={15} />
                      </button>
                      <button className={`${styles.inviteIconBtn} ${styles.inviteIconBtnDanger}`} onClick={() => setDeletingInvite(inv)} aria-label="Delete">
                        <TrashIcon width={15} height={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {subTab === "requests" && team.visibility === "public" && (
        joinRequests.length === 0 ? (
          <div className={styles.emptyMini}>No join requests right now.</div>
        ) : (
          <div className={styles.list}>
            {joinRequests.map((req) => (
              <div key={req.id} className={styles.requestRow}>
                <span className={styles.avatar}>
                  {req.user.profile_photo_url ? <img src={req.user.profile_photo_url} alt="" /> : firstLetter(req.user, displayName(req.user))}
                </span>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>{displayName(req.user)}</div>
                  <div className={styles.rowMeta}>
                    {req.message ? `"${req.message}"` : "No message"} · requested {formatShortDate(req.created_at)}
                    {req.reviewed_at && req.reviewed_by && (
                      <> · reviewed by {displayName(req.reviewed_by)} on {formatShortDate(req.reviewed_at)}</>
                    )}
                  </div>
                </div>
                {req.status === "pending" ? (
                  canManage && (
                    <div className={styles.rowActions}>
                      <button className={styles.approveBtn} onClick={() => handleApproveRequest(req.id)}>Approve</button>
                      <button className={styles.rejectBtn} onClick={() => handleRejectRequest(req.id)}>Reject</button>
                    </div>
                  )
                ) : (
                  <span className={styles.statusTag} data-status={req.status}>{req.status}</span>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {modalOpen && (
        <AddPlayersModal
          slug={slug}
          team={team}
          onClose={(didChange) => {
            setModalOpen(false);
            if (didChange) onRosterChange();
          }}
        />
      )}

      {editingInvite && (
        <EditInvitationModal
          slug={slug}
          team={team}
          invitation={editingInvite}
          onClose={(didChange) => {
            setEditingInvite(null);
            if (didChange) onRosterChange();
          }}
        />
      )}

      {deletingInvite && (
  <div
    className={styles.deleteInviteOverlay}
    onClick={() => setDeletingInvite(null)}
  >
    <div
      className={styles.deleteInviteModal}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.deleteInviteHead}>
        <span className={styles.deleteInviteTitle}>
          Delete invitation
        </span>

        <button
          className={styles.deleteInviteClose}
          onClick={() => setDeletingInvite(null)}
          aria-label="Close"
        >
          <XIcon width={15} height={15} />
        </button>
      </div>

      <div className={styles.deleteInviteBody}>
        <p className={styles.deleteInviteText}>
          This will permanently disable this{" "}
          {deletingInvite.invitation_type === "code"
            ? "join code"
            : "invite link"}.
          Anyone who still has it will no longer be able to use it.
        </p>

        <div className={styles.deleteInviteActions}>
          <button
            className={styles.deleteInviteDanger}
            onClick={handleConfirmDelete}
          >
            Delete
          </button>

          <button
            className={styles.deleteInviteCancel}
            onClick={() => setDeletingInvite(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}

function EditInvitationModal({
  slug, team, invitation, onClose,
}: {
  slug: string;
  team: TeamDashboardData;
  invitation: TeamInvitationItem;
  onClose: (didChange: boolean) => void;
}) {
  const [expiresInDays, setExpiresInDays] = useState(1);
  const [maxUses, setMaxUses] = useState<string>(invitation.max_uses?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const maxAllowed = team.available_slots;

  async function handleSave(regenerate: boolean) {
    setSaving(true);
    setError("");
    try {
      const parsedMaxUses = maxUses.trim() ? Number(maxUses) : null;
      if (parsedMaxUses != null && parsedMaxUses > maxAllowed) {
        setError(`Max uses can't exceed available roster slots (${maxAllowed}).`);
        setSaving(false);
        return;
      }
      await updateInvitation(slug, invitation.id, {
        expires_in_days: expiresInDays,
        max_uses: parsedMaxUses,
        regenerate,
      });
      onClose(true);
    } catch {
      setError("Couldn't save changes. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={() => onClose(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>
            Edit {invitation.invitation_type === "code" ? "join code" : "invite link"}
          </span>
          <button className={styles.modalClose} onClick={() => onClose(false)} aria-label="Close">
            <XIcon width={15} height={15} />
          </button>
        </div>

        <div className={styles.methodBody}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Expiration</label>
            <select
              className={styles.formSelect}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
            >
              <option value={1}>Expires after 1 day</option>
              <option value={2}>Expires after 2 days</option>
              <option value={3}>Expires after 3 days</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Maximum uses</label>
            <input
              type="number"
              min={1}
              max={maxAllowed}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className={styles.formInput}
            />
            <div className={styles.formHint}>Leave blank for unlimited, up to {maxAllowed} open slots.</div>
          </div>

          <div className={styles.modalBtnRow}>
            <button className={styles.modalBtnPrimary} onClick={() => handleSave(false)} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button className={styles.modalBtnSecondary} onClick={() => handleSave(true)} disabled={saving}>
              Generate new {invitation.invitation_type === "code" ? "code" : "link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddPlayersModal({
  slug, team, onClose,
}: { slug: string; team: TeamDashboardData; onClose: (didChange: boolean) => void }) {
  const [method, setMethod] = useState<AddMethod>("search");
  const [linkCopied, setLinkCopied] = useState(false);

  const [linkInvite, setLinkInvite] = useState<TeamInvitationItem | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkExpiresIn, setLinkExpiresIn] = useState(1);
  const [linkMaxUses, setLinkMaxUses] = useState("");
  const [confirmingLink, setConfirmingLink] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [codeInvite, setCodeInvite] = useState<TeamInvitationItem | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeExpiresIn, setCodeExpiresIn] = useState(1);
  const [codeMaxUses, setCodeMaxUses] = useState("");
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [codeError, setCodeError] = useState("");

  const [hasChanges, setHasChanges] = useState(false);
  const maxAllowed = team.available_slots;

  async function generateLink() {
    const parsed = linkMaxUses.trim() ? Number(linkMaxUses) : null;
    if (parsed != null && parsed > maxAllowed) {
      setLinkError(`Max uses can't exceed available roster slots (${maxAllowed}).`);
      return;
    }
    setLinkLoading(true);
    setConfirmingLink(false);
    setLinkError("");
    try {
      const result = await createLinkInvitation(slug, { expires_in_days: linkExpiresIn, max_uses: parsed });
      setLinkInvite(result);
      setHasChanges(true);
    } catch {
      setLinkError("Couldn't generate a link. Try again.");
    } finally {
      setLinkLoading(false);
    }
  }

  async function cancelLink() {
    if (!linkInvite) return;
    try {
      await cancelInvitation(slug, linkInvite.id);
      setHasChanges(true);
    } finally {
      setLinkInvite(null);
    }
  }

  async function generateCode() {
    const parsed = codeMaxUses.trim() ? Number(codeMaxUses) : null;
    if (parsed != null && parsed > maxAllowed) {
      setCodeError(`Max uses can't exceed available roster slots (${maxAllowed}).`);
      return;
    }
    setCodeLoading(true);
    setConfirmingCode(false);
    setCodeError("");
    try {
      const result = await createCodeInvitation(slug, { expires_in_days: codeExpiresIn, max_uses: parsed });
      setCodeInvite(result);
      setHasChanges(true);
    } catch {
      setCodeError("Couldn't generate a code. Try again.");
    } finally {
      setCodeLoading(false);
    }
  }

  async function cancelCode() {
    if (!codeInvite) return;
    try {
      await cancelInvitation(slug, codeInvite.id);
      setHasChanges(true);
    } finally {
      setCodeInvite(null);
    }
  }

  async function copyLink() {
    const link = linkInvite?.token ? buildInviteLink(slug, linkInvite.token) : null;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  function handleClose() {
    onClose(hasChanges);
  }

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitleWrap}>
            <span className={styles.modalTitle}>Add players</span>
            <span className={styles.modalTitleAccent} />
          </div>

          <button
            className={styles.modalClose}
            onClick={handleClose}
            aria-label="Close"
          >
            <XIcon width={15} height={15} />
          </button>
        </div>
        <div className={styles.methodTabs}>
          <button className={`${styles.methodTab} ${method === "search" ? styles.methodTabActive : ""}`} onClick={() => setMethod("search")}>
            <SearchIcon width={17} height={17} />
            Search
          </button>
          <button className={`${styles.methodTab} ${method === "link" ? styles.methodTabActive : ""}`} onClick={() => setMethod("link")}>
            <LinkIcon width={17} height={17} />
            Link
          </button>
          <button className={`${styles.methodTab} ${method === "code" ? styles.methodTabActive : ""}`} onClick={() => setMethod("code")}>
            <HashIcon width={17} height={17} />
            Code
          </button>
        </div>

        <div className={styles.methodBody}>
          {method === "search" && (
            <div className={styles.emptyMini}>search field</div>
          )}

          {method === "link" && (
  <>
    {linkError && <div className={styles.errorBanner}>{linkError}</div>}

    {!linkInvite && !linkLoading && !confirmingLink && (
      <div className={styles.invitePanel}>
      

        <div className={styles.inviteHeading}>
          <h3>Create an invite link</h3>
          <p>
            Share a secure link with players so they can request to join
            your team.
          </p>
        </div>

        <div className={styles.inviteForm}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Link expiration</label>

            <div className={styles.selectWrap}>
              <span className={styles.fieldIcon}>◷</span>
              <select
                className={styles.formSelect}
                value={linkExpiresIn}
                onChange={(e) =>
                  setLinkExpiresIn(Number(e.target.value))
                }
              >
                <option value={1}>Expires after 1 day</option>
                <option value={2}>Expires after 2 days</option>
                <option value={3}>Expires after 3 days</option>
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Maximum uses</label>

            <div className={styles.inputWrap}>
              <span className={styles.fieldIcon}>#</span>
              <input
                type="number"
                min={1}
                max={maxAllowed}
                value={linkMaxUses}
                onChange={(e) => setLinkMaxUses(e.target.value)}
                placeholder="Unlimited"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formHint}>
              Leave blank for unlimited · Up to {maxAllowed} open slots
            </div>
          </div>
        </div>

        <button
          className={styles.generateBtn}
          onClick={() => setConfirmingLink(true)}
        >
          <LinkIcon width={16} height={16} />
          Generate invite link
        </button>
      </div>
    )}

    {confirmingLink && (
      <div className={styles.confirmPanel}>
        <div className={styles.confirmIcon}>
          <LinkIcon width={21} height={21} />
        </div>

        <h3>Ready to create your link?</h3>

        <p>
          A new invite link will be created using the settings you selected.
        </p>

        <div className={styles.confirmSummary}>
          <div>
            <span>Expires</span>
            <strong>
              {linkExpiresIn} {linkExpiresIn === 1 ? "day" : "days"}
            </strong>
          </div>

          <div>
            <span>Maximum uses</span>
            <strong>
              {linkMaxUses || "Unlimited"}
            </strong>
          </div>
        </div>

        <div className={styles.modalBtnRow}>
          <button
            className={styles.modalBtnPrimary}
            onClick={generateLink}
          >
            Create link
          </button>

          <button
            className={styles.modalBtnSecondary}
            onClick={() => setConfirmingLink(false)}
          >
            Go back
          </button>
        </div>
      </div>
    )}

    {linkLoading && (
      <div className={styles.loadingPanel}>
        <div className={styles.loadingSpinner} />
        <strong>Creating your invite link</strong>
        <span>This will only take a moment...</span>
      </div>
    )}

    {linkInvite && !linkLoading && (
      <div className={styles.generatedPanel}>
        <div className={styles.successIcon}>✓</div>

        <div className={styles.generatedHeading}>
          <h3>Invite link ready</h3>
          <p>Share this link with the players you want to invite.</p>
        </div>

        <div className={styles.linkBox}>
          <span className={styles.linkText}>
            {linkInvite.token
              ? buildInviteLink(slug, linkInvite.token)
              : "No link available"}
          </span>

          <button
            className={styles.copyBtn}
            onClick={copyLink}
            aria-label="Copy link"
          >
            <CopyIcon width={15} height={15} />
          </button>
        </div>

        {linkCopied && (
          <div className={styles.copiedNote}>
            ✓ Link copied to clipboard
          </div>
        )}

        <button
          className={styles.cancelBtn}
          onClick={cancelLink}
        >
          Cancel this link
        </button>
      </div>
    )}
  </>
)}

          {method === "code" && (
            <>
              {codeError && <div className={styles.errorBanner}>{codeError}</div>}

              {!codeInvite && !codeLoading && !confirmingCode && (
                <div className={styles.invitePanel}>
                  <div className={styles.inviteIcon}>
                    <span className={styles.codeIcon}>#</span>
                  </div>

                  <div className={styles.inviteHeading}>
                    <h3>Create an invite code</h3>
                    <p>
                      Give players a short code they can enter manually to request
                      to join your team.
                    </p>
                  </div>

                  <div className={styles.inviteForm}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Code expiration</label>

                      <div className={styles.selectWrap}>
                        <span className={styles.fieldIcon}>◷</span>
                        <select
                          className={styles.formSelect}
                          value={codeExpiresIn}
                          onChange={(e) =>
                            setCodeExpiresIn(Number(e.target.value))
                          }
                        >
                          <option value={1}>Expires after 1 day</option>
                          <option value={2}>Expires after 2 days</option>
                          <option value={3}>Expires after 3 days</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Maximum uses</label>

                      <div className={styles.inputWrap}>
                        <span className={styles.fieldIcon}>#</span>
                        <input
                          type="number"
                          min={1}
                          max={maxAllowed}
                          value={codeMaxUses}
                          onChange={(e) => setCodeMaxUses(e.target.value)}
                          placeholder="Unlimited"
                          className={styles.formInput}
                        />
                      </div>

                      <div className={styles.formHint}>
                        Leave blank for unlimited · Up to {maxAllowed} open slots
                      </div>
                    </div>
                  </div>

                  <button
                    className={styles.generateBtn}
                    onClick={() => setConfirmingCode(true)}
                  >
                    <span className={styles.generateCodeIcon}>#</span>
                    Generate invite code
                  </button>
                </div>
              )}

              {confirmingCode && (
                <div className={styles.confirmPanel}>
                  <div className={styles.confirmIcon}>
                    <span className={styles.codeIcon}>#</span>
                  </div>

                  <h3>Ready to create your code?</h3>

                  <p>
                    A new invite code will be created using the settings you selected.
                  </p>

                  <div className={styles.confirmSummary}>
                    <div>
                      <span>Expires</span>
                      <strong>
                        {codeExpiresIn} {codeExpiresIn === 1 ? "day" : "days"}
                      </strong>
                    </div>

                    <div>
                      <span>Maximum uses</span>
                      <strong>
                        {codeMaxUses || "Unlimited"}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.modalBtnRow}>
                    <button
                      className={styles.modalBtnPrimary}
                      onClick={generateCode}
                    >
                      Create code
                    </button>

                    <button
                      className={styles.modalBtnSecondary}
                      onClick={() => setConfirmingCode(false)}
                    >
                      Go back
                    </button>
                  </div>
                </div>
              )}

              {codeLoading && (
                <div className={styles.loadingPanel}>
                  <div className={styles.loadingSpinner} />
                  <strong>Creating your invite code</strong>
                  <span>This will only take a moment...</span>
                </div>
              )}

             {codeInvite && !codeLoading && (
  <div className={styles.generatedPanel}>
    <div className={styles.successIcon}>✓</div>

    <div className={styles.generatedHeading}>
      <h3>Invite code ready</h3>
      <p>
        Share this code with players so they can join your team.
      </p>
    </div>

    <div className={styles.codeBox}>
      <div className={styles.codeValue}>{codeInvite.code}</div>

      <p className={styles.codeHint}>
        Players can enter this code manually to send a join
        invitation.
      </p>
    </div>

    <div className={styles.generatedActions}>
      <button
        className={styles.generatedCloseBtn}
        onClick={handleClose}
      >
        Close
      </button>

      <button
        className={styles.generatedCancelBtn}
        onClick={cancelCode}
      >
        Cancel this code
      </button>
    </div>
  </div>
)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}