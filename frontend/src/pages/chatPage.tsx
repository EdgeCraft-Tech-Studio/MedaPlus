// ChatPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import styles from "./css/ChatPage.module.css";
import {
  fetchMessages,
  sendTextMessage,
  editTextMessage,
  deleteMessage,
  markTeamChatRead,
  fetchAudioBlobUrl,
  colorFromId,
  initialFromName,
  senderDisplayName,
  isMine,
  type ChatMessage,
} from "../lib/chat";
import { getTeamDashboard } from "../lib/team";

/** message_type comparisons are case-insensitive on purpose — verify
 * the real casing in core.utils.choices.ChatMessageType and this still
 * works either way ("TEXT" or "text"). */
function normalizedType(type: string) {
  return type?.toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function waveformBars(seed: string) {
  const bars: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  for (let i = 0; i < 26; i++) {
    h = (h * 1103515245 + 12345) % 2147483648;
    bars.push(6 + (h % 18));
  }
  return bars;
}

function AudioBubble({ teamSlug, msg }: { teamSlug: string; msg: ChatMessage }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const bars = useMemo(() => waveformBars(msg.id), [msg.id]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  async function togglePlay() {
    if (status === "loading") return;

    if (status === "ready" && audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      return;
    }

    setStatus("loading");
    try {
      const url = await fetchAudioBlobUrl(teamSlug, msg.id);
      blobUrlRef.current = url;
      setStatus("ready");
      requestAnimationFrame(() => {
        audioRef.current?.play();
      });
    } catch (err) {
      console.error("Failed to load voice message:", err);
      setStatus("error");
    }
  }

  return (
    <div className={styles.audioRow}>
      <button
        className={`${styles.audioPlayBtn} ${status === "loading" ? styles.audioPlayBtnLoading : ""}`}
        onClick={togglePlay}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <span className={styles.audioSpinner} aria-hidden="true" />
        ) : playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5.5v13c0 .8.87 1.3 1.55.87l10.4-6.5a1 1 0 0 0 0-1.74l-10.4-6.5C7.87 4.2 7 4.7 7 5.5Z" />
          </svg>
        )}
      </button>
      <div className={styles.waveform} aria-hidden="true">
        {bars.map((h, i) => (
          <span key={i} className={styles.waveformBar} style={{ height: `${h}px` }} />
        ))}
      </div>
      <span className={styles.audioDuration}>{formatDuration(msg.audio_duration_seconds)}</span>

      {status === "ready" && blobUrlRef.current && (
        <audio
          ref={audioRef}
          src={blobUrlRef.current}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          style={{ display: "none" }}
        />
      )}
      {status === "error" && <span className={styles.audioError}>Couldn't load</span>}
    </div>
  );
}

function MessageMenu({
  open,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
}: {
  open: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.msgMenuWrap}>
      <button className={styles.msgMenuBtn} onClick={onToggle} aria-label="Message options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className={styles.msgMenuPopup}>
          {canEdit && (
            <button className={styles.msgMenuItem} onClick={onEdit}>Edit</button>
          )}
          <button className={`${styles.msgMenuItem} ${styles.msgMenuItemDanger}`} onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const stateTeamName = (location.state as { teamName?: string } | null)?.teamName;

  const [teamName, setTeamName] = useState<string>(stateTeamName ?? slug ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [teamLogo, setTeamLogo] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldStickToBottom = useRef(true);

  // Reset + load whenever the team changes (slug is the source of truth).
useEffect(() => {
  if (!slug) return;
  setTeamName(stateTeamName ?? slug);
  setMemberCount(null);
  setTeamLogo(null);                    // ← NEW: reset when switching teams
  setMessages([]);
  setDraft("");
  setEditingId(null);
  setOpenMenuId(null);
  setLoadError(null);
  setLoadingInitial(true);

  getTeamDashboard(slug)                   // ← NEW: fetch this team's member count
    .then((team) => setMemberCount(team.active_member_count))
    .catch((err) => console.error("Failed to load team info:", err));

  getTeamDashboard(slug)
  .then((team) => {
    setMemberCount(team.active_member_count);
    setTeamLogo(team.logo);
  })
  .catch((err) => console.error("Failed to load team info:", err));

  let cancelled = false;
  (async () => {
    try {
      const page = await fetchMessages(slug, { limit: 50 });
      if (cancelled) return;
      setMessages([...page.results].reverse());
      setHasMoreOlder(page.has_more);
      markTeamChatRead(slug).catch((err) => console.error("mark-read failed:", err));
    } catch (err) {
      console.error("Failed to load chat messages:", err);
      if (!cancelled) setLoadError("Couldn't load messages. Pull to refresh or try again shortly.");
    } finally {
      if (!cancelled) setLoadingInitial(false);
    }
  })();

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [slug]);

  // Poll for new messages while the thread is open.
  useEffect(() => {
    if (!slug) return;
    const interval = setInterval(async () => {
      setMessages((current) => {
        const lastId = current[current.length - 1]?.id;
        if (!lastId) return current;
        fetchMessages(slug, { after: lastId })
          .then((page) => {
            if (page.results.length === 0) return;
            setMessages((list) => [...list, ...page.results]);
            markTeamChatRead(slug).catch(() => {});
          })
          .catch((err) => console.error("Chat poll failed:", err));
        return current;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [slug]);

  useEffect(() => {
    if (shouldStickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  const handleScroll = useCallback(async () => {
    const el = scrollRef.current;
    if (!el || !slug) return;

    shouldStickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (el.scrollTop < 60 && hasMoreOlder && !loadingOlder) {
      const earliestId = messages[0]?.id;
      if (!earliestId) return;
      setLoadingOlder(true);
      const prevHeight = el.scrollHeight;
      try {
        const page = await fetchMessages(slug, { before: earliestId, limit: 50 });
        setMessages((list) => [...[...page.results].reverse(), ...list]);
        setHasMoreOlder(page.has_more);
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
          }
        });
      } catch (err) {
        console.error("Failed to load older messages:", err);
      } finally {
        setLoadingOlder(false);
      }
    }
  }, [slug, messages, hasMoreOlder, loadingOlder]);

  const dateSections = useMemo(() => {
    const sections: { dateLabel: string; groups: ChatMessage[][] }[] = [];
    for (const msg of messages) {
      const dateLabel = formatDateLabel(msg.created_at);
      let section = sections[sections.length - 1];
      if (!section || section.dateLabel !== dateLabel) {
        section = { dateLabel, groups: [] };
        sections.push(section);
      }
      const lastGroup = section.groups[section.groups.length - 1];
      const sameSenderAsLast =
        lastGroup &&
        normalizedType(lastGroup[0].message_type) !== "SYSTEM" &&
        normalizedType(msg.message_type) !== "SYSTEM" &&
        lastGroup[0].sender?.id === msg.sender?.id;
      if (sameSenderAsLast) {
        lastGroup.push(msg);
      } else {
        section.groups.push([msg]);
      }
    }
    return sections;
  }, [messages]);

  function startEdit(msg: ChatMessage) {
    setOpenMenuId(null);
    setEditingId(msg.id);
    setDraft(msg.content ?? "");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function handleDelete(id: string) {
    if (!slug) return;
    setOpenMenuId(null);
    try {
      const updated = await deleteMessage(slug, id);
      setMessages((list) => list.map((m) => (m.id === id ? updated : m)));
      if (editingId === id) cancelEdit();
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || !slug || sending) return;
    setSending(true);
    try {
      if (editingId) {
        const updated = await editTextMessage(slug, editingId, text);
        setMessages((list) => list.map((m) => (m.id === editingId ? updated : m)));
        setEditingId(null);
      } else {
        const created = await sendTextMessage(slug, text);
        setMessages((list) => [...list, created]);
      }
      setDraft("");
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  if (!slug) {
    return (
      <div className={styles.notFound}>
        <p>This chat couldn't be found.</p>
        <Link to="/teams" className={styles.notFoundLink}>Back to my teams</Link>
      </div>
    );
  }

  return (
    <div className={styles.chatPage}>
      <div className={styles.chatHeader}>
        <Link to="/teams" className={styles.backBtn} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <span className={styles.headerAvatar} style={{ background: colorFromId(slug) }}>
          {teamLogo ? (
            <img
              src={teamLogo}
              alt=""
              style={{ width: "100%", height: "100%", borderRadius: "inherit", objectFit: "cover" }}
            />
          ) : (
            initialFromName(teamName)
          )}
        </span>
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{teamName}</span>
          <span className={styles.headerMemberCount}>
            {memberCount === null ? "…" : `${memberCount} members`}
          </span>
        </div>
      </div>

      <div className={styles.messagesScroll} ref={scrollRef} onScroll={handleScroll}>
        {loadingInitial && <div className={styles.centerNote}>Loading messages…</div>}
        {loadError && <div className={styles.centerNoteError}>{loadError}</div>}
        {loadingOlder && <div className={styles.centerNote}>Loading older messages…</div>}
        {!loadingInitial && !loadError && messages.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyStateIcon}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5H9.4l-3.9 3.4c-.5.44-1.3.09-1.3-.58V17H5.5C4.67 17 4 16.33 4 15.5v-10Z"
                stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className={styles.emptyStateTitle}>No messages yet</span>
          <span className={styles.emptyStateSubtitle}>Say hello to get the conversation started 👋</span>
        </div>
      )}

        {dateSections.map((section) => (
          <div key={section.dateLabel}>
            <div className={styles.dateDivider}>
              <span>{section.dateLabel}</span>
            </div>

            {section.groups.map((group) => {
              const first = group[0];

              if (normalizedType(first.message_type) === "SYSTEM") {
                return (
                  <div key={first.id} className={styles.systemRow}>
                    <span className={styles.systemPill}>{first.content}</span>
                  </div>
                );
              }

              const mine = isMine(first.sender);
              const senderLabel = senderDisplayName(first.sender);
              const senderInitial = initialFromName(senderLabel);
              const senderColor = first.sender ? colorFromId(first.sender.id) : "#8a8a86";

              return (
                <div key={group.map((m) => m.id).join("-")} className={`${styles.msgGroup} ${mine ? styles.msgGroupMine : ""}`}>
                  {!mine && (
                    <span className={styles.msgAvatar} style={{ background: senderColor }}>
                      {senderInitial}
                    </span>
                  )}

                  <div className={styles.bubbleStack}>
                    {!mine && <span className={styles.senderName} style={{ color: senderColor }}>{senderLabel}</span>}

                    {group.map((msg, i) => {

                      if (msg.is_deleted) {
                        return (
                          <div key={msg.id} className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs} ${styles.bubbleDeleted}`}>
                            <span className={styles.deletedText}>This message was deleted</span>
                          </div>
                        );
                      }

                      const canManage = mine;
                      const canEditThis = normalizedType(msg.message_type) === "TEXT";
                      const menu = canManage && (
                        <MessageMenu
                          open={openMenuId === msg.id}
                          canEdit={canEditThis}
                          onToggle={() => setOpenMenuId((id) => (id === msg.id ? null : msg.id))}
                          onEdit={() => startEdit(msg)}
                          onDelete={() => handleDelete(msg.id)}
                        />
                      );

                      if (normalizedType(msg.message_type) === "AUDIO") {
                        return (
                          <div key={msg.id} className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs} ${styles.bubbleAudio}`}>
                            {mine && (
                              <MessageMenu
                                open={openMenuId === msg.id}
                                canEdit={false}
                                onToggle={() => setOpenMenuId((id) => (id === msg.id ? null : msg.id))}
                                onEdit={() => {}}
                                onDelete={() => handleDelete(msg.id)}
                              />
                            )}
                            <AudioBubble teamSlug={slug} msg={msg} />
                            <span className={styles.bubbleTime}>{formatTime(msg.created_at)}</span>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                          {menu}
                          <span className={styles.bubbleText}>{msg.content}</span>
                          <span className={styles.bubbleTime}>
                            {msg.edited_at && <span className={styles.editedTag}>edited</span>}
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={styles.composerArea}>
        {editingId && (
          <div className={styles.editingBanner}>
            <span>Editing message</span>
            <button className={styles.editingBannerCancel} onClick={cancelEdit} aria-label="Cancel edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <div className={styles.composer}>
          <button className={styles.composerIconBtn} aria-label="Attach" disabled>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 12.5l6.5-6.5a3.5 3.5 0 0 1 5 5L11 19.5a5.5 5.5 0 1 1-7.8-7.8L11.5 3.4"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>

          <input
            ref={inputRef}
            className={styles.composerInput}
            placeholder="Message"
            value={draft}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
              if (e.key === "Escape" && editingId) cancelEdit();
            }}
          />

          {draft.trim() ? (
            <button className={styles.composerSendBtn} onClick={handleSend} disabled={sending} aria-label={editingId ? "Save edit" : "Send"}>
              {editingId ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4 20.6 21 12 3.4 3.4l.02 6.7L15 12l-11.58 1.9-.02 6.7Z" />
                </svg>
              )}
            </button>
          ) : (
            <button className={styles.composerIconBtn} aria-label="Record voice message" disabled>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}