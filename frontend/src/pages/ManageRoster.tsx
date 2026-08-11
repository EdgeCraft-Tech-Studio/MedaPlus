import { useState } from "react";
import styles from "./css/ManageRoster.module.css";
import {
  UserPlusIcon, SearchIcon, QrIcon, LinkIcon, HashIcon, CopyIcon, CheckIcon, XIcon, MoreIcon,
} from "./Icons";
import { type TeamDetail, type RosterMember, type TeamInvitationItem, type JoinRequestItem } from "./teamTypes";
import { type TeamRole } from "./types";

type SubTab = "members" | "invitations" | "requests";
type AddMethod = "search" | "qr" | "link" | "code";

// TODO: replace with a real player search endpoint
const MOCK_SEARCH_RESULTS = [
  { id: "p1", name: "Kaleab Fikru", handle: "+251 91 234 5678" },
  { id: "p2", name: "Rahel Assefa", handle: "@rahel_a" },
  { id: "p3", name: "Tsion Haile", handle: "+251 93 456 7890" },
];

export default function ManageRoster({
  team, roster, invitations, joinRequests, canManage,
}: {
  team: TeamDetail;
  roster: RosterMember[];
  invitations: TeamInvitationItem[];
  joinRequests: JoinRequestItem[];
  canManage: boolean;
}) {
  const [subTab, setSubTab] = useState<SubTab>("members");
  const [modalOpen, setModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const pendingInvites = invitations.filter((i) => i.status === "PENDING");
  const pendingRequests = joinRequests.filter((r) => r.status === "PENDING");

  async function handleRoleChange(memberId: string, newRole: TeamRole) {
    setOpenMenuId(null);
    // TODO: await changeTeamMemberRole(team.id, memberId, newRole);
    console.log("TODO: change role", memberId, newRole);
  }

  async function handleRemoveMember(memberId: string) {
    setOpenMenuId(null);
    // TODO: await removeTeamMember(team.id, memberId);
    console.log("TODO: remove member", memberId);
  }

  async function handleTransferOwnership(memberId: string) {
    setOpenMenuId(null);
    // TODO: await transferTeamOwnership(team.id, memberId);
    console.log("TODO: transfer ownership", memberId);
  }

  async function handleCancelInvite(inviteId: string) {
    // TODO: await cancelTeamInvitation(team.id, inviteId);
    console.log("TODO: cancel invitation", inviteId);
  }

  async function handleApproveRequest(requestId: string) {
    // TODO: await approveJoinRequest(team.id, requestId);
    // Backend creates an ACTIVE TeamMembership on approval — never client-side.
    console.log("TODO: approve join request", requestId);
  }

  async function handleRejectRequest(requestId: string) {
    // TODO: await rejectJoinRequest(team.id, requestId);
    console.log("TODO: reject join request", requestId);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <div className={styles.capacitySummary}>
          <div className={styles.capacityHeadline}>
            <span>{roster.length}</span> / {team.capacity} active players
          </div>
          <div className={styles.capBar}>
            <div className={styles.capFill} style={{ width: `${Math.min((roster.length / team.capacity) * 100, 100)}%` }} />
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
        {team.visibility === "public" && (
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
            {roster.map((m) => (
              <div key={m.id} className={styles.memberRow}>
                <span className={styles.avatar}>
                  {m.avatar ? <img src={m.avatar} alt="" /> : m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>
                    {m.name}
                    <span className={styles.roleTag} data-role={m.role}>
                      {m.role === "OWNER" ? "Owner" : m.role === "ADMIN" ? "Admin" : "Member"}
                    </span>
                  </div>
                  <div className={styles.rowMeta}>Joined {new Date(m.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>

                {canManage && m.role !== "OWNER" && (
                  <div className={styles.rowActions} style={{ position: "relative" }}>
                    <button className={styles.iconBtn} onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)} aria-label="Member actions">
                      <MoreIcon width={16} height={16} />
                    </button>
                    {openMenuId === m.id && (
                      <div className={styles.menuPanel}>
                        {m.role === "MEMBER" && (
                          <button className={styles.menuItem} onClick={() => handleRoleChange(m.id, "ADMIN")}>Make admin</button>
                        )}
                        {m.role === "ADMIN" && (
                          <button className={styles.menuItem} onClick={() => handleRoleChange(m.id, "MEMBER")}>Remove admin</button>
                        )}
                        {team.myRole === "OWNER" && (
                          <button className={styles.menuItem} onClick={() => handleTransferOwnership(m.id)}>Transfer ownership</button>
                        )}
                        <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => handleRemoveMember(m.id)}>Remove from team</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
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
                <span className={styles.avatar}>{inv.recipientName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>{inv.recipientName}</div>
                  <div className={styles.rowMeta}>{inv.recipientHandle} · sent {new Date(inv.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
                </div>
                <span className={styles.statusTag} data-status={inv.status}>{inv.status}</span>
                {canManage && inv.status === "PENDING" && (
                  <button className={styles.cancelBtn} onClick={() => handleCancelInvite(inv.id)}>Cancel</button>
                )}
              </div>
            ))}
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
                  {req.requesterAvatar ? <img src={req.requesterAvatar} alt="" /> : req.requesterName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>{req.requesterName}</div>
                  <div className={styles.rowMeta}>{req.message}</div>
                </div>
                {req.status === "PENDING" ? (
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
        <AddPlayersModal team={team} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function AddPlayersModal({ team, onClose }: { team: TeamDetail; onClose: () => void }) {
  const [method, setMethod] = useState<AddMethod>("search");
  const [query, setQuery] = useState("");
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  const inviteLink = `https://medaplus.app/join/${team.id}?code=${team.inviteCode}`;

  const results = query.trim()
    ? MOCK_SEARCH_RESULTS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.handle.includes(query))
    : MOCK_SEARCH_RESULTS;

  async function sendInvite(playerId: string) {
    setInvitedIds((ids) => [...ids, playerId]);
    // TODO: await sendTeamInvitation(team.id, { method: "search", playerId });
    console.log("TODO: send invite (search)", team.id, playerId);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore, link is still shown for manual copy
    }
  }

  async function regenerateLink() {
    // TODO: await regenerateTeamInviteLink(team.id);
    console.log("TODO: regenerate invite link", team.id);
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Add players</span>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            <XIcon width={15} height={15} />
          </button>
        </div>

        <div className={styles.methodTabs}>
          <button className={`${styles.methodTab} ${method === "search" ? styles.methodTabActive : ""}`} onClick={() => setMethod("search")}>
            <SearchIcon width={17} height={17} />
            Search
          </button>
          <button className={`${styles.methodTab} ${method === "qr" ? styles.methodTabActive : ""}`} onClick={() => setMethod("qr")}>
            <QrIcon width={17} height={17} />
            QR code
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
            <>
              <div className={styles.searchInputRow}>
                <SearchIcon width={16} height={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by phone or username" autoFocus />
              </div>
              {results.map((p) => {
                const invited = invitedIds.includes(p.id);
                return (
                  <div key={p.id} className={styles.searchResultRow}>
                    <span className={styles.avatar} style={{ width: 34, height: 34, fontSize: 11 }}>
                      {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className={styles.searchResultInfo}>
                      <div className={styles.searchResultName}>{p.name}</div>
                      <div className={styles.searchResultHandle}>{p.handle}</div>
                    </div>
                    <button
                      className={styles.inviteBtnSmall}
                      onClick={() => sendInvite(p.id)}
                      disabled={invited}
                      style={invited ? { background: "var(--grass-soft)", color: "var(--green-700)" } : undefined}
                    >
                      {invited ? <><CheckIcon width={11} height={11} /> Invited</> : "Invite"}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {method === "qr" && (
            <div className={styles.qrBox}>
              {/* TODO: replace with a real QR code render (e.g. qrcode.react) encoding inviteLink */}
              <div className={styles.qrPlaceholder} aria-label="QR code placeholder" />
              <p className={styles.qrHint}>Let a player scan this to open the invitation page and accept instantly.</p>
            </div>
          )}

          {method === "link" && (
            <>
              <div className={styles.linkBox}>
                <span className={styles.linkText}>{inviteLink}</span>
                <button className={styles.copyBtn} onClick={copyLink} aria-label="Copy link">
                  <CopyIcon width={15} height={15} />
                </button>
              </div>
              {linkCopied && <div className={styles.copiedNote}>Link copied</div>}
              <button className={styles.regenBtn} onClick={regenerateLink}>Regenerate link</button>
            </>
          )}

          {method === "code" && (
            <div className={styles.codeBox}>
              <div className={styles.codeValue}>{team.inviteCode}</div>
              <p className={styles.codeHint}>Share this code — players enter it manually to send a join invitation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
