import { useState } from "react";
import styles from "./css/ManageRoster.module.css";
import {
  UserPlusIcon, SearchIcon, LinkIcon, HashIcon, CopyIcon, XIcon, MoreIcon,
} from "./Icons";
import {
  type RosterMember, type TeamInvitationItem, type JoinRequestItem, type TeamDashboardData,
  promoteMember, demoteMember, removeMember, transferOwnership,
  cancelInvitation, approveJoinRequest, rejectJoinRequest,
  createLinkInvitation, createCodeInvitation,
} from "../lib/team";

type SubTab = "members" | "invitations" | "requests";
type AddMethod = "search" | "link" | "code";

export default function ManageRoster({
  team, roster, invitations, joinRequests, canManage, slug, onRosterChange,
}: {
  team: TeamDashboardData;
  roster: RosterMember[];
  invitations: TeamInvitationItem[];
  joinRequests: JoinRequestItem[];
  canManage: boolean;
  slug: string;
  onRosterChange: () => void; // parent re-fetches roster/invitations/requests after any action
}) {
  const [subTab, setSubTab] = useState<SubTab>("members");
  const [modalOpen, setModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const pendingInvites = invitations.filter((i) => i.status === "pending");
  const pendingRequests = joinRequests.filter((r) => r.status === "pending");

  async function handleRoleChange(memberId: string, newRole: "admin" | "member") {
    setOpenMenuId(null);
    setActionError("");
    try {
      if (newRole === "admin") await promoteMember(slug, memberId);
      else await demoteMember(slug, memberId);
      onRosterChange();
    } catch {
      setActionError("Couldn't update this member's role. Try again.");
    }
  }

  async function handleRemoveMember(memberId: string) {
    setOpenMenuId(null);
    setActionError("");
    try {
      await removeMember(slug, memberId);
      onRosterChange();
    } catch {
      setActionError("Couldn't remove this member. Try again.");
    }
  }

  async function handleTransferOwnership(memberId: string) {
    setOpenMenuId(null);
    setActionError("");
    try {
      await transferOwnership(slug, memberId);
      onRosterChange();
    } catch {
      setActionError("Couldn't transfer ownership. Try again.");
    }
  }

  async function handleCancelInvite(inviteId: string) {
    setActionError("");
    try {
      await cancelInvitation(slug, inviteId);
      onRosterChange();
    } catch {
      setActionError("Couldn't cancel this invitation. Try again.");
    }
  }

  async function handleApproveRequest(requestId: string) {
    setActionError("");
    try {
      await approveJoinRequest(slug, requestId);
      onRosterChange();
    } catch {
      setActionError("Couldn't approve this request. Try again.");
    }
  }

  async function handleRejectRequest(requestId: string) {
    setActionError("");
    try {
      await rejectJoinRequest(slug, requestId);
      onRosterChange();
    } catch {
      setActionError("Couldn't reject this request. Try again.");
    }
  }

  function displayName(user: RosterMember["user"]) {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  return name || user.username || "Unknown player";
}

  function initialsOf(name?: string | null) {
  if (!name?.trim()) return "?";

  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

  return (
    <div className={styles.wrap}>
      {actionError && <div className={styles.emptyMini} style={{ color: "var(--danger)" }}>{actionError}</div>}

      <div className={styles.topRow}>
        <div className={styles.capacitySummary}>
          <div className={styles.capacityHeadline}>
            <span>{roster.length}</span> / {team.maxRosterSize} active players
          </div>
          <div className={styles.capBar}>
            <div className={styles.capFill} style={{ width: `${Math.min((roster.length / team.maxRosterSize) * 100, 100)}%` }} />
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
        <button className={`${styles.subTab} ${subTab === "invitations" ? styles.subTabActive : ""}`} onClick={() => setSubTab("invitations")}>
          Invitations
          {pendingInvites.length > 0 && <span className={styles.subTabCount}>{pendingInvites.length}</span>}
        </button>
        {(team.visibility === "public" || team.visibility === "request") && (
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
              return (
                <div key={m.id} className={styles.memberRow}>
                  <span className={styles.avatar}>
                    {m.user.avatar ? <img src={m.user.avatar} alt="" /> : initialsOf(name)}
                  </span>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowName}>
                      {name}
                      <span className={styles.roleTag} data-role={m.role.toUpperCase()}>
                        {m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Member"}
                      </span>
                    </div>
                    <div className={styles.rowMeta}>
                      Joined {new Date(m.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
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
                          {team.myRole === "owner" && (
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
            {invitations.map((inv) => (
              <div key={inv.id} className={styles.inviteRow}>
                <span className={styles.avatar}>{initialsOf(inv.recipientName)}</span>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>{inv.recipientName}</div>
                  <div className={styles.rowMeta}>{inv.recipientHandle} · sent {new Date(inv.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                </div>
                <span className={styles.statusTag} data-status={inv.status}>{inv.status}</span>
                {canManage && inv.status === "pending" && (
                  <button className={styles.cancelBtn} onClick={() => handleCancelInvite(inv.id)}>Cancel</button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "requests" && (team.visibility === "public" || team.visibility === "request") && (
        joinRequests.length === 0 ? (
          <div className={styles.emptyMini}>No join requests right now.</div>
        ) : (
          <div className={styles.list}>
            {joinRequests.map((req) => (
              <div key={req.id} className={styles.requestRow}>
                <span className={styles.avatar}>
                  {req.requesterAvatar ? <img src={req.requesterAvatar} alt="" /> : initialsOf(req.requesterName)}
                </span>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>{req.requesterName}</div>
                  <div className={styles.rowMeta}>{req.message}</div>
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
    onClose={(didChange) => {
      setModalOpen(false);
      if (didChange) {
        onRosterChange(); // only refetches if something real happened
      }
    }}
  />
)}
    </div>
  );
}

function AddPlayersModal({ slug, onClose }: { slug: string; onClose: (didChange: boolean) => void }) {
  const [method, setMethod] = useState<AddMethod>("search");
  const [linkCopied, setLinkCopied] = useState(false);

  // link state
  const [linkInvite, setLinkInvite] = useState<{ id: string; inviteLink: string } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [confirmingLink, setConfirmingLink] = useState(false);

  // code state
  const [codeInvite, setCodeInvite] = useState<{ id: string; code: string } | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);


  const [hasChanges, setHasChanges] = useState(false);

  async function generateLink() {
    setLinkLoading(true);
    setConfirmingLink(false);
    try {
      const result = await createLinkInvitation(slug);
      setLinkInvite(result);
      setHasChanges(true); 
    } catch {
      // leave linkInvite null — UI shows a retry state
    } finally {
      setLinkLoading(false);
    }
  }

  async function cancelLink() {
    if (!linkInvite) return;
    try {
      await cancelInvitation(slug, linkInvite.id);
    } finally {
      setLinkInvite(null);
    }
  }

  async function generateCode() {
    setCodeLoading(true);
    setConfirmingCode(false);
    try {
      const result = await createCodeInvitation(slug);
      setCodeInvite(result);
      setHasChanges(true);
    } catch {
      // leave codeInvite null — UI shows a retry state
    } finally {
      setCodeLoading(false);
    }
  }

  async function cancelCode() {
    if (!codeInvite) return;
    try {
      await cancelInvitation(slug, codeInvite.id);
    } finally {
      setCodeInvite(null);
    }
  }

  async function copyLink() {
    if (!linkInvite) return;
    try {
      await navigator.clipboard.writeText(linkInvite.inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard unavailable — link is still shown for manual copy
    }
  }

  function handleClose() {
    onClose(hasChanges);
  }

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Add players</span>
          <button className={styles.modalClose} onClick={handleClose} aria-label="Close">
            <XIcon width={15} height={15} />
          </button>
        </div>

        <div className={styles.methodTabs}>
          <button className={`${styles.methodTab} ${method === "search" ? styles.methodTabActive : ""}`} onClick={() => setMethod("search")}>
            <SearchIcon width={17} height={17} />
            Search
          </button>
          {/* ✅ tab click ONLY switches the view — no API call */}
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
            <div className={styles.emptyMini}>Player search is coming soon.</div>
          )}

          {method === "link" && (
            <>
              {!linkInvite && !linkLoading && !confirmingLink && (
                <div className={styles.emptyMini}>
                  <p>Generate a shareable link players can use to join this team.</p>
                  <button className={styles.addBtn} onClick={() => setConfirmingLink(true)}>
                    Generate link
                  </button>
                </div>
              )}

              {confirmingLink && (
                <div className={styles.emptyMini}>
                  <p>This will create a new join link for this team. Continue?</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className={styles.addBtn} onClick={generateLink}>Yes, generate</button>
                    <button className={styles.cancelBtn} onClick={() => setConfirmingLink(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {linkLoading && <div className={styles.emptyMini}>Generating link…</div>}

              {linkInvite && !linkLoading && (
                <>
                  <div className={styles.linkBox}>
                    <span className={styles.linkText}>{linkInvite.inviteLink}</span>
                    <button className={styles.copyBtn} onClick={copyLink} aria-label="Copy link">
                      <CopyIcon width={15} height={15} />
                    </button>
                  </div>
                  {linkCopied && <div className={styles.copiedNote}>Link copied</div>}
                  <button className={styles.cancelBtn} onClick={cancelLink} style={{ marginTop: 8 }}>
                    Cancel this link
                  </button>
                </>
              )}
            </>
          )}

          {method === "code" && (
            <>
              {!codeInvite && !codeLoading && !confirmingCode && (
                <div className={styles.emptyMini}>
                  <p>Generate a code players can enter to request to join.</p>
                  <button className={styles.addBtn} onClick={() => setConfirmingCode(true)}>
                    Generate code
                  </button>
                </div>
              )}

              {confirmingCode && (
                <div className={styles.emptyMini}>
                  <p>This will create a new join code for this team. Continue?</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className={styles.addBtn} onClick={generateCode}>Yes, generate</button>
                    <button className={styles.cancelBtn} onClick={() => setConfirmingCode(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {codeLoading && <div className={styles.emptyMini}>Generating code…</div>}

              {codeInvite && !codeLoading && (
                <div className={styles.codeBox}>
                  <div className={styles.codeValue}>{codeInvite.code}</div>
                  <p className={styles.codeHint}>Share this code — players enter it manually to send a join invitation.</p>
                  <button className={styles.cancelBtn} onClick={cancelCode} style={{ marginTop: 8 }}>
                    Cancel this code
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}