export interface SessionUser {
  id: string;
  username: string;     
  first_name: string;
  last_name: string;
  full_name: string;
  role: "ADMIN" | "OWNER" | "PLAYER";
  phone: string;
  email: string | null;
  profile_photo_url: string | null;
  active: boolean;
  is_blocked: boolean;
  is_deleted: boolean;
  must_change_password: boolean;
  is_staff: boolean;
  platform_admin: boolean;
  last_login_at: string;
  created_at: string;
}

export interface AuthSession {
  user: SessionUser;
  session_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
  refresh_expires_at: string; // ISO timestamp
}

const STORAGE_KEY = "medaplus.session";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Persist a full session (called after login / signup OTP verify / refresh). */
export function saveSession(session: AuthSession): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("Failed to persist session:", err);
  }
}

/** Read the full session object, or null if none / corrupted. */
export function getSession(): AuthSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch (err) {
    console.error("Failed to parse stored session, clearing it:", err);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Wipe the session entirely (logout, forced auth failure). */
export function clearSession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}

/** After a refresh call, patch in the new rotated tokens without losing `user`. */
export function updateTokens(
  patch: Pick<AuthSession, "session_token" | "refresh_token" | "expires_at" | "refresh_expires_at">
): void {
  const current = getSession();
  if (!current) return;
  saveSession({ ...current, ...patch });
}

export function getAccessToken(): string | null {
  return getSession()?.session_token ?? null;
}

export function getRefreshToken(): string | null {
  return getSession()?.refresh_token ?? null;
}

export function getCurrentUser(): SessionUser | null {
  return getSession()?.user ?? null;
}

/** True once `expires_at` has passed — the access token needs a refresh. */
export function isAccessTokenExpired(): boolean {
  const session = getSession();
  if (!session) return true;
  return Date.now() >= new Date(session.expires_at).getTime();
}

/** True once `refresh_expires_at` has passed — the user must log in again. */
export function isRefreshTokenExpired(): boolean {
  const session = getSession();
  if (!session) return true;
  return Date.now() >= new Date(session.refresh_expires_at).getTime();
}

/** Cheap, no-network check for route guards / "is anyone logged in". */
export function isAuthenticated(): boolean {
  const session = getSession();
  return !!session && !isRefreshTokenExpired();
}

/* ---------------------------------------------------------------------- */
/* Player Mode (OWNER only) — persisted per user in localStorage.          */
/* Stored per user id so two owners on the same browser don't share state. */
/* ---------------------------------------------------------------------- */

const PLAYER_MODE_KEY_PREFIX = "medaplus.player_mode.";
const PLAYER_MODE_EVENT = "medaplus:player-mode-changed";

function playerModeKey(userId: string): string {
  return PLAYER_MODE_KEY_PREFIX + userId;
}

/** Read the saved Player Mode state for a user (defaults to OFF). */
export function getStoredPlayerMode(userId: string | null | undefined): boolean {
  if (!isBrowser() || !userId) return false;
  try {
    return localStorage.getItem(playerModeKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** Save Player Mode and notify listeners in this tab (AppShell, etc). */
export function setStoredPlayerMode(userId: string, value: boolean): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(playerModeKey(userId), value ? "1" : "0");
  } catch (err) {
    console.error("Failed to persist player mode:", err);
  }
  window.dispatchEvent(new CustomEvent(PLAYER_MODE_EVENT, { detail: { userId, value } }));
}

/**
 * Subscribe to Player Mode changes — fires for changes in this tab
 * (custom event) and in other tabs (native `storage` event).
 * Returns an unsubscribe function.
 */
export function subscribePlayerMode(listener: () => void): () => void {
  if (!isBrowser()) return () => {};

  function onStorage(e: StorageEvent) {
    if (e.key && e.key.startsWith(PLAYER_MODE_KEY_PREFIX)) listener();
  }

  window.addEventListener(PLAYER_MODE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PLAYER_MODE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}