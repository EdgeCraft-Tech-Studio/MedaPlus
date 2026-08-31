import { api } from "./api";
import { getCurrentUser } from "./session";

export type ChatMessageType = "TEXT" | "AUDIO" | "IMAGE" | "SYSTEM";// verify against core.utils.choices.ChatMessageType

export interface ChatSenderSummary {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  profile_photo_url: string | null;
}


export interface ChatMessage {
  id: string;
  team_id: string;
  sender: ChatSenderSummary | null; // null = deleted user account
  message_type: ChatMessageType;
  image_url: string | null;          // NEW
  image_file_size_bytes: number | null; // NEW
  is_image_message: boolean;  
  content: string | null; // null when is_deleted, per backend serializer
  audio_url: string | null;
  audio_duration_seconds: number | null;
  audio_mime_type: string;
  audio_file_size_bytes: number | null;
  is_deleted: boolean;
  is_system_message: boolean;
  is_audio_message: boolean;
  edited_at: string | null;
  created_at: string; // ISO
}

export interface ChatMessagePage {
  results: ChatMessage[]; // newest-first (matches model's default ordering)
  has_more: boolean;
  next_cursor: string | null;
}

export interface ChatTeamUnread {
  team_id: string;
  team_slug: string;
  team_name: string;
  team_logo: string | null;
  unread_count: number;
}

export interface ChatUnreadSummary {
  total_unread: number;
  teams: ChatTeamUnread[];
}

function messagesBase(teamSlug: string) {
  return `/teams/${teamSlug}/chat/messages`;
}

/** First page (most recent) or older/newer pages via cursor. */
export async function fetchMessages(
  teamSlug: string,
  opts: { limit?: number; before?: string; after?: string } = {}
): Promise<ChatMessagePage> {
  const params: Record<string, string | number> = {};
  if (opts.limit) params.limit = opts.limit;
  if (opts.before) params.before = opts.before;
  if (opts.after) params.after = opts.after;
  const res = await api.get<ChatMessagePage>(`${messagesBase(teamSlug)}/`, { params });
  return res.data;
}

export async function sendTextMessage(teamSlug: string, content: string): Promise<ChatMessage> {
  const res = await api.post<ChatMessage>(`${messagesBase(teamSlug)}/text/`, { content });
  return res.data;
}

export async function sendImageMessage(teamSlug: string, imageFile: File): Promise<ChatMessage> {
  const form = new FormData();
  form.append("image_file", imageFile);
  const res = await api.post<ChatMessage>(`${messagesBase(teamSlug)}/image/`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}


export async function fetchImageBlobUrl(teamSlug: string, messageId: string): Promise<string> {
  const res = await api.get(`${messagesBase(teamSlug)}/${messageId}/image/`, { responseType: "blob" });
  return URL.createObjectURL(res.data as Blob);
}


export async function sendAudioMessage(
  teamSlug: string,
  audioFile: File | Blob,
  audioDurationSeconds: number
): Promise<ChatMessage> {
  const form = new FormData();
  form.append("audio_file", audioFile);
  form.append("audio_duration_seconds", String(Math.round(audioDurationSeconds)));
  const res = await api.post<ChatMessage>(`${messagesBase(teamSlug)}/audio/`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/** Sender-only, text messages only, matches edit_message() service rules. */
export async function editTextMessage(teamSlug: string, messageId: string, content: string): Promise<ChatMessage> {
  const res = await api.post<ChatMessage>(`${messagesBase(teamSlug)}/${messageId}/edit/`, { content });
  return res.data;
}

/** Soft delete — server returns the message with is_deleted:true, content:null. */
export async function deleteMessage(teamSlug: string, messageId: string): Promise<ChatMessage> {
  const res = await api.post<ChatMessage>(`${messagesBase(teamSlug)}/${messageId}/delete/`);
  return res.data;
}

export async function markTeamChatRead(teamSlug: string): Promise<void> {
  await api.post(`/teams/${teamSlug}/chat/mark-read/`);
}

/**
 * Audio is behind an authenticated endpoint, so it cannot be used as a
 * plain <audio src="..."> URL (the browser wouldn't attach the auth
 * header). Fetch it as a blob through the authenticated client instead,
 * then play from the resulting object URL. Caller is responsible for
 * calling URL.revokeObjectURL() on the returned URL when done with it.
 */
export async function fetchAudioBlobUrl(teamSlug: string, messageId: string): Promise<string> {
  const res = await api.get(`${messagesBase(teamSlug)}/${messageId}/audio/`, {
    responseType: "blob",
  });
  return URL.createObjectURL(res.data as Blob);
} 

/** Powers the navbar chat icon badge + its dropdown, one request. */
export async function getUnreadSummary(): Promise<ChatUnreadSummary> {
  const res = await api.get<ChatUnreadSummary>("/chat/unread-summary/");
  return res.data;
} 

// ---------- shared display helpers (used by AppShell + ChatPage) ----------

const AVATAR_PALETTE = ["#2f5d8a", "#b3352f", "#2f8a5e", "#c9942a", "#7a4fae", "#2f8aa0"];

/** Deterministic color per id, so the same team/user always renders the same color. */
export function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initialFromName(name: string): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export function senderDisplayName(sender: ChatSenderSummary | null): string {
  if (!sender) return "Deleted user";
  return sender.full_name?.trim() || `${sender.first_name} ${sender.last_name}`.trim() || sender.username;
}

export function isMine(sender: ChatSenderSummary | null): boolean {
  const me = getCurrentUser();
  return !!me && !!sender && sender.id === me.id;
}

export interface ChatTeamUnread {
  team_id: string;
  team_slug: string;
  team_name: string;
  team_logo: string | null;
  unread_count: number;
  last_message_time: string | null;
  last_message_sender_name: string | null;
  last_message_preview: string | null;
  is_last_message_mine: boolean;
}