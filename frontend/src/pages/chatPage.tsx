// ChatPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./css/chatPage.module.css";
import {
  fetchMessages,
  sendTextMessage,
  editTextMessage,
  deleteMessage,
  markTeamChatRead,
  fetchAudioBlobUrl,
  getUnreadSummary,
  colorFromId,
  initialFromName,
  senderDisplayName,
  isMine,
  type ChatMessage,
  type ChatTeamUnread,
  fetchImageBlobUrl,
  sendImageMessage,
  sendAudioMessage,
} from "../lib/chat";
import { getTeamDashboard } from "../lib/team";

function normalizedType(type: string) {
  return type?.toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSidebarTime(iso: string | null) {
  if (!iso) return "";
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

/** Keeps only the first occurrence of each message id, preserving order.
 * Applied everywhere messages arrays are combined (initial load, poll,
 * older-page load, send responses) so an overlapping/duplicate fetch
 * can never render the same message twice. */
function dedupeMessages(list: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const result: ChatMessage[] = [];
  for (const m of list) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    result.push(m);
  }
  return result;
}

// ---------------- Shimmer skeletons ----------------

function SidebarShimmer() {
  return (
    <div className={styles.sidebarList}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className={styles.sidebarItem}>
          <span className={`${styles.avatarSkeleton} ${styles.shimmer}`} />
          <span className={`${styles.textSkeleton} ${styles.shimmer}`} />
        </div>
      ))}
    </div>
  );
}

function MessagesShimmer() {
  const widths = [140, 210, 170, 240, 130, 190];
  return (
    <div className={styles.messagesShimmerWrap}>
      {widths.map((w, i) => (
        <div key={i} className={`${styles.shimmerBubbleRow} ${i % 2 === 0 ? styles.shimmerRowLeft : styles.shimmerRowRight}`}>
          <span className={`${styles.shimmerBubble} ${styles.shimmer}`} style={{ width: w }} />
        </div>
      ))}
    </div>
  );
}

// ---------------- Audio bubble ----------------

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
      playing ? audioRef.current.pause() : audioRef.current.play();
      return;
    }
    setStatus("loading");
    try {
      const url = await fetchAudioBlobUrl(teamSlug, msg.id);
      blobUrlRef.current = url;
      setStatus("ready");
      requestAnimationFrame(() => audioRef.current?.play());
    } catch (err) {
      console.error("Failed to load voice message:", err);
      setStatus("error");
    }
  }

  return (
    <div className={styles.audioRow}>
      <button
        className={styles.audioPlayBtn}
        onClick={togglePlay}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <span className={styles.audioSpinner} aria-hidden="true" />
        ) : playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5.5v13c0 .8.87 1.3 1.55.87l10.4-6.5a1 1 0 0 0 0-1.74l-10.4-6.5C7.87 4.2 7 4.7 7 5.5Z" />
          </svg>
        )}
      </button>
      <div className={styles.waveform} aria-hidden="true">
        {bars.map((h, i) => <span key={i} className={styles.waveformBar} style={{ height: `${h}px` }} />)}
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

function ImageBubble({ teamSlug, msg }: { teamSlug: string; msg: ChatMessage }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let localUrl: string | null = null;
    fetchImageBlobUrl(teamSlug, msg.id)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        localUrl = url;
        setBlobUrl(url);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("Failed to load image:", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [teamSlug, msg.id]);

  if (status === "error") return <div className={styles.imageError}>Couldn't load image</div>;
  if (status === "loading" || !blobUrl) return <div className={`${styles.imageSkeleton} ${styles.shimmer}`} />;
  return <img src={blobUrl} alt="" className={styles.chatImage} />;
}

// ---------------- Message menu (edit / delete) ----------------

function MessageMenu({
  open, canEdit, onToggle, onEdit, onDelete,
}: { open: boolean; canEdit: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className={styles.msgMenuWrap}>
      <button className={styles.msgMenuBtn} onClick={onToggle} aria-label="Message options">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className={styles.msgMenuPopup}>
          {canEdit && <button className={styles.msgMenuItem} onClick={onEdit}>Edit</button>}
          <button className={`${styles.msgMenuItem} ${styles.msgMenuItemDanger}`} onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
}

// ---------------- Sidebar (team list + in-chat search) ----------------

interface ChatSidebarProps {
  teams: ChatTeamUnread[];
  loadingTeams: boolean;
  selectedSlug: string | null;
  onSelectTeam: (team: ChatTeamUnread) => void;
  mode: "list" | "search";
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  searchResults: ChatMessage[];
  onSelectResult: (msg: ChatMessage) => void;
  selectedTeamInfo: ChatTeamUnread | undefined;
  teamFilterQuery: string;
  onTeamFilterQueryChange: (v: string) => void;
}

function ChatSidebar({
  teams, loadingTeams, selectedSlug, onSelectTeam,
  mode, onCloseSearch, searchQuery, onSearchQueryChange,
  searchResults, onSelectResult, selectedTeamInfo,
  teamFilterQuery, onTeamFilterQueryChange,
}: ChatSidebarProps) {
  if (mode === "search") {
    return (
      <div className={styles.sidebarInner}>
        <div className={styles.searchHead}>
          <input
            autoFocus
            className={styles.searchInput}
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
          <button className={styles.searchCloseBtn} onClick={onCloseSearch} aria-label="Close search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {selectedTeamInfo && (
          <div className={styles.searchTeamRow}>
            <span className={styles.sidebarAvatar} style={{ background: colorFromId(selectedTeamInfo.team_id) }}>
              {selectedTeamInfo.team_logo ? (
                <img src={selectedTeamInfo.team_logo} alt="" className={styles.avatarImg} />
              ) : (
                initialFromName(selectedTeamInfo.team_name)
              )}
            </span>
            <span className={styles.sidebarItemName}>{selectedTeamInfo.team_name}</span>
          </div>
        )}

        <div className={styles.searchResultsList}>
          {searchQuery.trim() === "" && (
            <div className={styles.sidebarEmptyNote}>Type to search this chat</div>
          )}
          {searchQuery.trim() !== "" && searchResults.length === 0 && (
            <div className={styles.sidebarEmptyNote}>No messages found</div>
          )}
          {searchResults.map((msg) => {
            const name = senderDisplayName(msg.sender);
            const firstName = msg.sender?.first_name?.trim() || name;
            return (
              <button key={msg.id} className={styles.searchResultItem} onClick={() => onSelectResult(msg)}>
                <span className={styles.sidebarAvatar} style={{ background: msg.sender ? colorFromId(msg.sender.id) : "#8a8a86" }}>
                  {msg.sender?.profile_photo_url ? (
                    <img src={msg.sender.profile_photo_url} alt="" className={styles.avatarImg} />
                  ) : (
                    initialFromName(firstName)
                  )}
                </span>
                <span className={styles.searchResultBody}>
                  <span className={styles.searchResultName}>{firstName}</span>
                  <span className={styles.searchResultSnippet}>{msg.content}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (loadingTeams) return <SidebarShimmer />;

  return (
    <div className={styles.sidebarInner}>
      <div className={styles.teamFilterHead}>
        <input
          className={styles.searchInput}
          placeholder="Search groups"
          value={teamFilterQuery}
          onChange={(e) => onTeamFilterQueryChange(e.target.value)}
        />
      </div>

      <div className={styles.sidebarList}>
        {teams.length === 0 && (
          <div className={styles.sidebarEmptyNote}>
            {teamFilterQuery.trim() ? "No matching groups" : "No team chats yet"}
          </div>
        )}
        {teams.map((team) => (
          <button
            key={team.team_id}
            className={`${styles.sidebarItem} ${team.team_slug === selectedSlug ? styles.sidebarItemActive : ""}`}
            onClick={() => onSelectTeam(team)}
          >
            <span className={styles.sidebarAvatar} style={{ background: colorFromId(team.team_id) }}>
              {team.team_logo ? <img src={team.team_logo} alt="" className={styles.avatarImg} /> : initialFromName(team.team_name)}
            </span>
            <span className={styles.sidebarItemBody}>
              <span className={styles.sidebarItemTopRow}>
                <span className={styles.sidebarItemName}>{team.team_name}</span>
                {team.last_message_time && (
                  <span className={styles.sidebarItemTime}>{formatSidebarTime(team.last_message_time)}</span>
                )}
              </span>
              {team.last_message_preview && (
                <span className={styles.sidebarItemPreview}>
                  {team.is_last_message_mine ? "You" : team.last_message_sender_name}: {team.last_message_preview}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Thread (message pane) ----------------

interface ChatThreadProps {
  teamSlug: string;
  onBack: () => void;
  onOpenSearch: () => void;
  onMessagesChange: (messages: ChatMessage[]) => void;
  scrollToMessageId: string | null;
  onScrollHandled: () => void;
}

type RecorderState = "idle" | "requesting" | "recording" | "paused";

function useVoiceRecorder(onSend: (blob: Blob, durationSeconds: number) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  function tickStart() {
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  function tickStop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function start() {
    setError(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      tickStart();
      setState("recording");
    } catch (err) {
      console.error("Microphone permission denied or unavailable:", err);
      setError("Microphone access denied.");
      setState("idle");
    }
  }

  function pause() {
    mediaRecorderRef.current?.pause();
    tickStop();
    setState("paused");
  }

  function resume() {
    mediaRecorderRef.current?.resume();
    tickStart();
    setState("recording");
  }

  function cleanup() {
    tickStop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setSeconds(0);
    setState("idle");
  }

  function discard() {
    mediaRecorderRef.current?.stop();
    cleanup();
  }

  function send() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    const finalSeconds = seconds;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      cleanup();
      if (finalSeconds > 0) onSend(blob, finalSeconds);
    };
    recorder.stop();
    tickStop();
  }

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, seconds, error, start, pause, resume, discard, send };
}

function ChatThread({ teamSlug, onBack, onOpenSearch, onMessagesChange, scrollToMessageId, onScrollHandled }: ChatThreadProps) {
  const [teamName, setTeamName] = useState(teamSlug);
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldStickToBottom = useRef(true);
  const pollInFlightRef = useRef(false);

  const recorder = useVoiceRecorder(async (blob, durationSeconds) => {
    try {
      const created = await sendAudioMessage(teamSlug, blob, durationSeconds);
      setMessages((list) => dedupeMessages([...list, created]));
    } catch (err) {
      console.error("Failed to send voice message:", err);
    }
  });

  function formatRecTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  useEffect(() => {
    setTeamName(teamSlug);
    setTeamLogo(null);
    setMemberCount(null);
    setMessages([]);
    setDraft("");
    setEditingId(null);
    setOpenMenuId(null);
    setLoadError(null);
    setLoadingInitial(true);

    getTeamDashboard(teamSlug)
      .then((team) => {
        setTeamName(team.name);
        setTeamLogo(team.logo);
        setMemberCount(team.active_member_count);
      })
      .catch((err) => console.error("Failed to load team info:", err));

    let cancelled = false;
    (async () => {
      try {
        const page = await fetchMessages(teamSlug, { limit: 50 });
        if (cancelled) return;
        setMessages(dedupeMessages([...page.results].reverse()));
        setHasMoreOlder(page.has_more);
        markTeamChatRead(teamSlug).catch((err) => console.error("mark-read failed:", err));
      } catch (err) {
        console.error("Failed to load chat messages:", err);
        if (!cancelled) setLoadError("Couldn't load messages. Pull to refresh or try again shortly.");
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();

    return () => { cancelled = true; };
  }, [teamSlug]);

  useEffect(() => {
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  // Poll for new messages — guarded against overlapping in-flight requests,
  // which was the actual cause of duplicate audio/image bubbles: a slow or
  // backgrounded-tab request could still be pending when the next 8s tick
  // fired, causing two responses to append the same message twice.
  useEffect(() => {
    if (!teamSlug) return;
    const interval = setInterval(() => {
      if (pollInFlightRef.current) return;
      setMessages((current) => {
        const lastId = current[current.length - 1]?.id;
        if (!lastId) return current;
        pollInFlightRef.current = true;
        fetchMessages(teamSlug, { after: lastId })
          .then((page) => {
            if (page.results.length === 0) return;
            setMessages((list) => dedupeMessages([...list, ...page.results]));
            markTeamChatRead(teamSlug).catch(() => {});
          })
          .catch((err) => console.error("Chat poll failed:", err))
          .finally(() => { pollInFlightRef.current = false; });
        return current;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [teamSlug]);

  useEffect(() => {
    if (shouldStickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = document.getElementById(`msg-${scrollToMessageId}`);
    if (el) {
      shouldStickToBottom.current = false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(scrollToMessageId);
      const timer = setTimeout(() => setHighlightedId(null), 2200);
      onScrollHandled();
      return () => clearTimeout(timer);
    }
    onScrollHandled();
  }, [scrollToMessageId, onScrollHandled]);

  const handleScroll = useCallback(async () => {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (el.scrollTop < 60 && hasMoreOlder && !loadingOlder) {
      const earliestId = messages[0]?.id;
      if (!earliestId) return;
      setLoadingOlder(true);
      const prevHeight = el.scrollHeight;
      try {
        const page = await fetchMessages(teamSlug, { before: earliestId, limit: 50 });
        setMessages((list) => dedupeMessages([...[...page.results].reverse(), ...list]));
        setHasMoreOlder(page.has_more);
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
        });
      } catch (err) {
        console.error("Failed to load older messages:", err);
      } finally {
        setLoadingOlder(false);
      }
    }
  }, [teamSlug, messages, hasMoreOlder, loadingOlder]);

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
      if (sameSenderAsLast) lastGroup.push(msg);
      else section.groups.push([msg]);
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
    setOpenMenuId(null);
    try {
      const updated = await deleteMessage(teamSlug, id);
      setMessages((list) => list.map((m) => (m.id === id ? updated : m)));
      if (editingId === id) cancelEdit();
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (editingId) {
        const updated = await editTextMessage(teamSlug, editingId, text);
        setMessages((list) => list.map((m) => (m.id === editingId ? updated : m)));
        setEditingId(null);
      } else {
        const created = await sendTextMessage(teamSlug, text);
        setMessages((list) => dedupeMessages([...list, created]));
      }
      setDraft("");
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [pendingCaption, setPendingCaption] = useState("");
  const [sendingPending, setSendingPending] = useState(false);

  function openFilePicker() {
    if (pendingImage) return;
    fileInputRef.current?.click();
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setAttachError("Only JPG or PNG images are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachError("Image must be under 10MB.");
      return;
    }
    setAttachError(null);
    setPendingCaption("");
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function closePendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setPendingCaption("");
  }

  async function confirmSendPendingImage() {
    if (!pendingImage || sendingPending) return;
    setSendingPending(true);
    try {
      const createdImage = await sendImageMessage(teamSlug, pendingImage.file);
      setMessages((list) => dedupeMessages([...list, createdImage]));

      const caption = pendingCaption.trim();
      if (caption) {
        const createdText = await sendTextMessage(teamSlug, caption);
        setMessages((list) => dedupeMessages([...list, createdText]));
      }
      closePendingImage();
    } catch (err) {
      console.error("Failed to send image:", err);
      setAttachError("Failed to send image. Try again.");
    } finally {
      setSendingPending(false);
    }
  }

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  return (
    <div className={styles.chatThread}>
      <div className={styles.chatHeader}>
        <button className={styles.backBtn} onClick={onBack} aria-label="Back to chats">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className={styles.headerAvatar} style={{ background: colorFromId(teamSlug) }}>
          {teamLogo ? <img src={teamLogo} alt="" className={styles.avatarImg} /> : initialFromName(teamName)}
        </span>
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{teamName}</span>
          <span className={styles.headerMemberCount}>
            {memberCount === null ? "…" : `${memberCount} member${memberCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <button className={styles.headerSearchBtn} onClick={onOpenSearch} aria-label="Search this chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={styles.messagesScroll} ref={scrollRef} onScroll={handleScroll}>
        {loadingInitial && <MessagesShimmer />}
        {loadError && <div className={styles.centerNoteError}>{loadError}</div>}
        {loadingOlder && <div className={styles.centerNote}><span className={styles.audioSpinner} /> Loading older messages…</div>}
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
            <div className={styles.dateDivider}><span>{section.dateLabel}</span></div>

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
                  {!mine && <span className={styles.msgAvatar} style={{ background: senderColor }}>{senderInitial}</span>}

                  <div className={styles.bubbleStack}>
                    {!mine && <span className={styles.senderName} style={{ color: senderColor }}>{senderLabel}</span>}

                    {group.map((msg) => {
                      const isHighlighted = highlightedId === msg.id;

                      if (msg.is_deleted) {
                        return (
                          <div key={msg.id} id={`msg-${msg.id}`} className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs} ${styles.bubbleDeleted}`}>
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

                      if (normalizedType(msg.message_type) === "IMAGE") {
                        return (
                          <div key={msg.id} id={`msg-${msg.id}`} className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs} ${styles.bubbleImage} ${isHighlighted ? styles.bubbleHighlighted : ""}`}>
                            {mine && (
                              <MessageMenu
                                open={openMenuId === msg.id}
                                canEdit={false}
                                onToggle={() => setOpenMenuId((id) => (id === msg.id ? null : msg.id))}
                                onEdit={() => {}}
                                onDelete={() => handleDelete(msg.id)}
                              />
                            )}
                            <ImageBubble teamSlug={teamSlug} msg={msg} />
                            <span className={styles.bubbleTime}>{formatTime(msg.created_at)}</span>
                          </div>
                        );
                      }

                      if (normalizedType(msg.message_type) === "AUDIO") {
                        return (
                          <div
                            key={msg.id}
                            id={`msg-${msg.id}`}
                            className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs} ${styles.bubbleAudio} ${isHighlighted ? styles.bubbleHighlighted : ""}`}
                          >
                            {mine && (
                              <MessageMenu
                                open={openMenuId === msg.id}
                                canEdit={false}
                                onToggle={() => setOpenMenuId((id) => (id === msg.id ? null : msg.id))}
                                onEdit={() => {}}
                                onDelete={() => handleDelete(msg.id)}
                              />
                            )}
                            <AudioBubble teamSlug={teamSlug} msg={msg} />
                            <span className={styles.bubbleTime}>{formatTime(msg.created_at)}</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          id={`msg-${msg.id}`}
                          className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleTheirs} ${isHighlighted ? styles.bubbleHighlighted : ""}`}
                        >
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileChosen}
            style={{ display: "none" }}
          />

          {recorder.state === "idle" ? (
            <>
              {!editingId && (
                <button className={styles.composerIconBtn} aria-label="Attach photo" onClick={openFilePicker}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 12.5l6.5-6.5a3.5 3.5 0 0 1 5 5L11 19.5a5.5 5.5 0 1 1-7.8-7.8L11.5 3.4"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}

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
                <button
                  className={styles.composerSendBtn}
                  onClick={handleSend}
                  disabled={sending}
                  aria-label={editingId ? "Save edit" : "Send"}
                >
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
                !editingId && (
                  <button className={styles.composerIconBtn} aria-label="Record voice message" onClick={recorder.start}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                )
              )}
            </>
          ) : recorder.state === "requesting" ? (
            <div className={styles.recordingBar}>
              <span className={styles.audioSpinner} /> Waiting for microphone permission…
            </div>
          ) : (
            <div className={styles.recordingBar}>
              <button className={styles.recordDeleteBtn} onClick={recorder.discard} aria-label="Delete recording">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className={`${styles.recDot} ${recorder.state === "recording" ? styles.recDotActive : ""}`} />
              <span className={styles.recTime}>{formatRecTime(recorder.seconds)}</span>
              <div className={styles.recSpacer} />
              {recorder.state === "recording" ? (
                <button className={styles.composerIconBtn} onClick={recorder.pause} aria-label="Pause recording">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                </button>
              ) : (
                <button className={styles.composerIconBtn} onClick={recorder.resume} aria-label="Resume recording">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5.5v13c0 .8.87 1.3 1.55.87l10.4-6.5a1 1 0 0 0 0-1.74l-10.4-6.5C7.87 4.2 7 4.7 7 5.5Z" />
                  </svg>
                </button>
              )}
              <button className={styles.composerSendBtn} onClick={recorder.send} aria-label="Send voice message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4 20.6 21 12 3.4 3.4l.02 6.7L15 12l-11.58 1.9-.02 6.7Z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {recorder.error && <div className={styles.centerNoteError}>{recorder.error}</div>}
        {attachError && <div className={styles.centerNoteError}>{attachError}</div>}
      </div>

      {pendingImage && (
        <div className={styles.imagePreviewOverlay}>
          <div className={styles.imagePreviewModal}>
            <button className={styles.imagePreviewCloseBtn} onClick={closePendingImage} aria-label="Cancel" disabled={sendingPending}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className={styles.imagePreviewImageWrap}>
              <img src={pendingImage.previewUrl} alt="" className={styles.imagePreviewImg} />
            </div>

            <div className={styles.imagePreviewFooter}>
              <input
                className={styles.composerInput}
                placeholder="Message"
                value={pendingCaption}
                disabled={sendingPending}
                onChange={(e) => setPendingCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmSendPendingImage();
                }}
              />
              <div className={styles.imagePreviewActions}>
                <button className={styles.imagePreviewCancelBtn} onClick={closePendingImage} disabled={sendingPending}>
                  Cancel
                </button>
                <button className={styles.imagePreviewSendBtn} onClick={confirmSendPendingImage} disabled={sendingPending}>
                  {sendingPending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Shell (top-level page) ----------------

export default function ChatPage() {
  const { slug: paramSlug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [teams, setTeams] = useState<ChatTeamUnread[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [mobileActivePane, setMobileActivePane] = useState<"sidebar" | "thread">(paramSlug ? "thread" : "sidebar");
  const [sidebarMode, setSidebarMode] = useState<"list" | "search">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [teamFilterQuery, setTeamFilterQuery] = useState("");
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);

  useEffect(() => {
    getUnreadSummary()
      .then((summary) => setTeams(summary.teams))
      .catch((err) => console.error("Failed to load chat team list:", err))
      .finally(() => setLoadingTeams(false));
  }, []);

  useEffect(() => {
    if (paramSlug) setMobileActivePane("thread");
    setSidebarMode("list");
    setSearchQuery("");
  }, [paramSlug]);

  const selectedTeamInfo = useMemo(
    () => teams.find((t) => t.team_slug === paramSlug),
    [teams, paramSlug]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return threadMessages.filter(
      (m) =>
        !m.is_deleted &&
        normalizedType(m.message_type) === "TEXT" &&
        m.content?.toLowerCase().includes(q)
    );
  }, [threadMessages, searchQuery]);

  const filteredTeams = useMemo(() => {
    const q = teamFilterQuery.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.team_name.toLowerCase().includes(q));
  }, [teams, teamFilterQuery]);

  function handleSelectTeam(team: ChatTeamUnread) {
    navigate(`/chat/${team.team_slug}`);
    setMobileActivePane("thread");
    setSidebarMode("list");
    setSearchQuery("");
  }

  function handleOpenSearch() {
    setSidebarMode("search");
    setMobileActivePane("sidebar");
  }

  function handleCloseSearch() {
    setSidebarMode("list");
    setSearchQuery("");
  }

  function handleSelectResult(msg: ChatMessage) {
    setScrollToMessageId(msg.id);
    setMobileActivePane("thread");
  }

  return (
    <div className={styles.chatShell} data-mobile-pane={mobileActivePane}>
      <div className={styles.sidebarPane}>
        <ChatSidebar
          teams={filteredTeams}
          loadingTeams={loadingTeams}
          selectedSlug={paramSlug ?? null}
          onSelectTeam={handleSelectTeam}
          mode={sidebarMode}
          onCloseSearch={handleCloseSearch}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchResults={searchResults}
          onSelectResult={handleSelectResult}
          selectedTeamInfo={selectedTeamInfo}
          teamFilterQuery={teamFilterQuery}
          onTeamFilterQueryChange={setTeamFilterQuery}
        />
      </div>

      {paramSlug ? (
        <div className={styles.threadPane}>
          <ChatThread
            key={paramSlug}
            teamSlug={paramSlug}
            onBack={() => setMobileActivePane("sidebar")}
            onOpenSearch={handleOpenSearch}
            onMessagesChange={setThreadMessages}
            scrollToMessageId={scrollToMessageId}
            onScrollHandled={() => setScrollToMessageId(null)}
          />
        </div>
      ) : (
        <div className={styles.emptyPane}>
          <div className={styles.emptyPaneInner}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5H9.4l-3.9 3.4c-.5.44-1.3.09-1.3-.58V17H5.5C4.67 17 4 16.33 4 15.5v-10Z"
                stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
              />
            </svg>
            <span>Select your team</span>
          </div>
        </div>
      )}
    </div>
  );
}