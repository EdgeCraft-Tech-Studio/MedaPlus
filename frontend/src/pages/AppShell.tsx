import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import styles from "./css/AppShell.module.css";
import {
  BallIcon, HomeIcon, UsersIcon, CompassIcon,
  BellIcon, XIcon, InboxEmptyIcon,
  FootballPitchIcon,
} from "./Icons";
import { type AppNotification, type NotificationCategory } from "./types";
import { getUnreadSummary, type ChatUnreadSummary } from "../lib/chat";
import { me } from "../lib/auth";
import { getStoredPlayerMode, subscribePlayerMode } from "../lib/session";
import type { SessionUser } from "../lib/session";
import { getPendingSoloBooking } from "../lib/pitches";
import {
  acknowledgeBookingCompletion,
  confirmTeamBooking, coverRemainingOpenSlotsAndStartPayment, declineTeamBooking,
  getBookedPitchSummary, getMyActiveTeamBookings,
  getMyConfirmationDetail, getMyPaymentDetail, getPendingOwnerAction, getPendingPayment,
  getPendingTeamBookingConfirmation, resolveConfirmSummary, resolvePaymentTimeout,
  type BookedPitchSummary, type ConfirmationDetail, type ConfirmSummaryAction, type PaymentDetail,
  type PaymentTimeoutAction, type PendingOwnerAction, type PendingPayment,
  type PendingTeamBookingConfirmation, type TeamBookingLiveDetail,
} from "../lib/teamBooking";
import {
  getUnreadNotificationCount, listNotifications, markAllNotificationsRead, markNotificationRead,
  type AppNotificationDTO,
} from "../lib/notifications";
import TeamBookingConfirmPopup from "./TeamBookingConfirmPopup";
import PitchUnavailablePopup from "./PitchUnavailablePopup";
import MemberPaymentPopup from "./MemberPaymentPopup";
import OwnerBookingSummaryPopup from "./OwnerBookingSummaryPopup";
import TeamBookingListPopup from "./TeamBookingListPopup";
import TeamBookingLiveDetailPopup from "./TeamBookingLiveDetailPopup";
import BookedPitchSummaryPopup from "./BookedPitchSummaryPopup";
import OpenSlotFormPopup from "./OpenSlotFormPopup";
import TeamInvitationPopup from "./TeamInvitationPopup";

function DashboardIcon({ width = 20, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export type UserRole = "ADMIN" | "OWNER" | "PLAYER";

export function getDashboardPath(role?: UserRole | null): string | null {
  if (role === "ADMIN") return "/admin/";
  if (role === "OWNER") return "/owner/";
  return null;
}

const BASE_NAV_ITEMS = [
  { to: "/home", label: "Home", icon: HomeIcon, end: true },
  { to: "/teams", label: "My Teams", icon: UsersIcon },
  { to: "/app", label: "pitchs", icon: FootballPitchIcon },
  { to: "/discover", label: "Discover", icon: CompassIcon },
];

// Paths an OWNER with player-mode OFF must never reach, even by
// typing the URL directly. Checked with startsWith so nested routes
// (/teams/:slug, /discover/matches/:id, etc.) are covered too.
const OWNER_RESTRICTED_PREFIXES = ["/home", "/teams", "/app", "/discover", "/chat"];

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  team: "Team", match: "Match", booking: "Booking", tournament: "Tournament",
};

const CHAT_POLL_INTERVAL_MS = 20000;
const NOTIFICATIONS_POLL_INTERVAL_MS = 10000;
const BOOKING_CONFIRMATION_POLL_INTERVAL_MS = 3000;
const OWNER_ACTION_POLL_INTERVAL_MS = 3000;
const TEAM_UPDATE_BADGE_POLL_INTERVAL_MS = 5000;
const PENDING_PAYMENT_POLL_INTERVAL_MS = 2000;

const VIEWABLE_TYPES = new Set([
  "team_booking_request_received",
  "team_booking_payment_request",
  "team_booking_pitch_booked",
  "team_invitation_received",
]);

function mapDtoToAppNotification(dto: AppNotificationDTO): AppNotification {
  const category: NotificationCategory =
    dto.notification_type.startsWith("team_") ? "team"
    : dto.notification_type.startsWith("match_") ? "match"
    : dto.notification_type.startsWith("chat_") ? "team"
    : "booking";

  return {
    id: dto.id,
    category,
    title: dto.title,
    message: dto.body,
    time: new Date(dto.created_at).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }),
    read: dto.is_read,
    rawType: dto.notification_type,
    data: dto.data,
  };
}

function timeAgoColor(read: boolean) {
  return read ? "var(--muted)" : "var(--grass)";
}

function notifAccentColor(n: AppNotification): string {
  const title = n.title.toLowerCase();
  if (title.includes("confirmed") || title.includes("paid") || title.includes("booked")) return "#0f7a52";
  if (title.includes("can't") || title.includes("unavailable") || title.includes("declined")) return "#dc2626";
  return timeAgoColor(n.read);
}

function notifBgColor(n: AppNotification): string {
  const title = n.title.toLowerCase();
  if (title.includes("confirmed") || title.includes("paid") || title.includes("booked")) return "#eefaf3";
  if (title.includes("can't") || title.includes("unavailable") || title.includes("declined")) return "#fdf0f0";
  return "transparent";
}

function avatarFallback(user: SessionUser | null): string {
  if (!user) return "–";
  const source = user.first_name?.trim() || user.full_name?.trim();
  if (!source) return "–";
  return source[0].toUpperCase();
}

function ChatBubbleIcon({ width = 20, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5H9.4l-3.9 3.4c-.5.44-1.3.09-1.3-.58V17H5.5C4.67 17 4 16.33 4 15.5v-10Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
      />
      <circle cx="8.3" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="10.5" r="1" fill="currentColor" />
      <circle cx="15.7" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

interface OpenSlotContext {
  requestId: string;
  pitchName: string;
  teamName: string;
  slotsNeeded: number;
  pricePerSlot: number;
}

interface SoloPendingPayment {
  id: string;
  pitch_name: string;
  amount: string;
  payment_expires_at: string;
}

function isPathRestrictedForOwner(pathname: string): boolean {
  // Carve-out: /app is restricted (player pitch-browsing), but an
  // owner must still reach their own /app/owner/... pages — e.g.
  // editing a specific pitch at /app/owner/pitches/:id.
  if (pathname === "/app/owner" || pathname.startsWith("/app/owner/")) return false;
  return OWNER_RESTRICTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function OwnerBlockedPage() {
  return (
    <div
      style={{
        minHeight: "60vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800 }}>Page not found</div>
      <div style={{ fontSize: 13.5, color: "var(--muted, #686d76)", maxWidth: 360 }}>
        This page isn't available on your account.
      </div>
    </div>
  );
}

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const bellRef = useRef<HTMLButtonElement>(null);

  const [chatSummary, setChatSummary] = useState<ChatUnreadSummary | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // Player Mode (OWNER only) — persisted in localStorage, set together
  // with `user` so there is never a frame with the wrong nav.
  const [playerModeActive, setPlayerModeActive] = useState(false);

  const [pendingBookingConfirmation, setPendingBookingConfirmation] =
    useState<PendingTeamBookingConfirmation | null>(null);
  const [pendingOwnerAction, setPendingOwnerAction] = useState<PendingOwnerAction | null>(null);
  const [ownerActionLoading, setOwnerActionLoading] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [pendingSoloPayment, setPendingSoloPayment] = useState<SoloPendingPayment | null>(null);
  const [unavailablePitchId, setUnavailablePitchId] = useState<string | null>(null);

  const [viewedConfirmation, setViewedConfirmation] = useState<ConfirmationDetail | null>(null);
  const [viewedPayment, setViewedPayment] = useState<PaymentDetail | null>(null);
  const [viewedBookedSummary, setViewedBookedSummary] = useState<BookedPitchSummary | null>(null);
  const [viewedInvitationId, setViewedInvitationId] = useState<string | null>(null);
  const [viewNotificationLoading, setViewNotificationLoading] = useState(false);

  const [teamBookingListOpen, setTeamBookingListOpen] = useState(false);
  const [activeLiveDetailId, setActiveLiveDetailId] = useState<string | null>(null);
  const [teamUpdateNeedsDecision, setTeamUpdateNeedsDecision] = useState(false);
  const [teamUpdateVisible, setTeamUpdateVisible] = useState(false);

  const [openSlotContext, setOpenSlotContext] = useState<OpenSlotContext | null>(null);

  const [dismissedConfirmationId, setDismissedConfirmationId] = useState<string | null>(null);
  const [dismissedOwnerActionId, setDismissedOwnerActionId] = useState<string | null>(null);

  // ---------------- user ----------------
  useEffect(() => {
    async function loadUser() {
      try {
        const u = await me();
        setUser(u);
        setPlayerModeActive(getStoredPlayerMode(u.id));
      } catch (err) {
        console.error("Failed to load user for topbar:", err);
        setUser(null);
      } finally {
        setUserLoaded(true);
      }
    }
    loadUser();
  }, []);

  // ---------------- player mode sync (Profile toggle / other tabs) ----------------
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    return subscribePlayerMode(() => {
      setPlayerModeActive(getStoredPlayerMode(userId));
    });
  }, [user?.id]);

  // ---------------- chat unread ----------------
  async function refreshChatSummary() {
    try {
      const summary = await getUnreadSummary();
      setChatSummary(summary);
    } catch (err) {
      console.error("Failed to load chat unread summary:", err);
    }
  }

  useEffect(() => {
    refreshChatSummary();
    const interval = setInterval(refreshChatSummary, CHAT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- notifications ----------------
  async function refreshNotifications() {
    try {
      const [list, unread] = await Promise.all([
        listNotifications(1),
        getUnreadNotificationCount(),
      ]);
      setNotifications(list.results.map(mapDtoToAppNotification));
      setUnreadNotifCount(unread.unread_count);
    } catch (err) {
      console.error("Failed to load notifications:", err, (err as any)?.response?.data);
    } finally {
      setNotificationsLoading(false);
    }
  }

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, NOTIFICATIONS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- mandatory member play-confirmation popup ----------------
  async function refreshPendingBookingConfirmation() {
    try {
      const pending = await getPendingTeamBookingConfirmation();
      setPendingBookingConfirmation(pending);
    } catch (err) {
      console.error("Failed to check pending booking confirmation:", err);
    }
  }

  useEffect(() => {
    refreshPendingBookingConfirmation();
    const interval = setInterval(refreshPendingBookingConfirmation, BOOKING_CONFIRMATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- mandatory owner action ----------------
  async function refreshPendingOwnerAction() {
    try {
      const action = await getPendingOwnerAction();
      if (action?.type === "pitch_unavailable" && action.pitch_id) {
        setUnavailablePitchId(action.pitch_id);
        await acknowledgeBookingCompletion(action.request_id);
        setPendingOwnerAction(null);
        return;
      }
      setPendingOwnerAction(action);
    } catch (err) {
      console.error("Failed to check pending owner action:", err);
    }
  }

  async function handleAcknowledgeSuccess(requestId: string) {
    setOwnerActionLoading(true);
    try {
      await acknowledgeBookingCompletion(requestId);
      setPendingOwnerAction(null);
      refreshPendingOwnerAction();
      refreshTeamUpdateBadge();
    } finally {
      setOwnerActionLoading(false);
    }
  }

  useEffect(() => {
    refreshPendingOwnerAction();
    const interval = setInterval(refreshPendingOwnerAction, OWNER_ACTION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- "Team Update" pill: visibility + attention state ----------------
  async function refreshTeamUpdateBadge() {
    try {
      const items = await getMyActiveTeamBookings();
      setTeamUpdateVisible(items.length > 0);
      setTeamUpdateNeedsDecision(items.some((i) => i.status === "expired"));
    } catch {
      setTeamUpdateVisible(false);
      setTeamUpdateNeedsDecision(false);
    }
  }

  useEffect(() => {
    refreshTeamUpdateBadge();
    const interval = setInterval(refreshTeamUpdateBadge, TEAM_UPDATE_BADGE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- mandatory member payment popup (team) ----------------
  async function refreshPendingPayment() {
    try {
      const payment = await getPendingPayment();
      setPendingPayment(payment);
    } catch (err) {
      console.error("Failed to check pending payment:", err);
    }
  }

  useEffect(() => {
    refreshPendingPayment();
    const interval = setInterval(refreshPendingPayment, PENDING_PAYMENT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- mandatory member payment popup (solo) ----------------
  async function refreshPendingSoloPayment() {
    try {
      const payment = await getPendingSoloBooking();
      setPendingSoloPayment(payment);
    } catch (err) {
      console.error("Failed to check pending solo payment:", err);
    }
  }

  useEffect(() => {
    refreshPendingSoloPayment();
    const interval = setInterval(refreshPendingSoloPayment, PENDING_PAYMENT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------- owner action resolution handlers ----------------
  async function handleResolveSummary(requestId: string, action: ConfirmSummaryAction) {
    setOwnerActionLoading(true);
    try {
      const result = await resolveConfirmSummary(requestId, action);
      setPendingOwnerAction(null);
      if (result.unavailable && result.pitch_id) setUnavailablePitchId(result.pitch_id);
      if (result.cancelled) {
        setActiveLiveDetailId(null);
        setTeamBookingListOpen(false);
      }
      refreshPendingOwnerAction();
      refreshNotifications();
      refreshTeamUpdateBadge();
    } catch (err) {
      console.error("Failed to resolve confirm summary:", err);
    } finally {
      setOwnerActionLoading(false);
    }
  }

  async function handleResolvePaymentTimeout(requestId: string, action: PaymentTimeoutAction) {
    setOwnerActionLoading(true);
    try {
      const result = await resolvePaymentTimeout(requestId, action);
      setPendingOwnerAction(null);
      if (result.unavailable && result.pitch_id) setUnavailablePitchId(result.pitch_id);
      if (result.cancelled) {
        setActiveLiveDetailId(null);
        setTeamBookingListOpen(false);
      }
      refreshPendingOwnerAction();
      refreshNotifications();
      refreshTeamUpdateBadge();
    } catch (err) {
      console.error("Failed to resolve payment timeout:", err);
    } finally {
      setOwnerActionLoading(false);
    }
  }

  async function handleBookingConfirmYes(requestId: string) {
    await confirmTeamBooking(requestId);
    setPendingBookingConfirmation(null);
    refreshPendingBookingConfirmation();
    refreshNotifications();
  }

  async function handleBookingConfirmNo(requestId: string) {
    await declineTeamBooking(requestId);
    setPendingBookingConfirmation(null);
    refreshPendingBookingConfirmation();
    refreshNotifications();
  }

  // ---------------- notification "View" click routing ----------------
  async function handleViewNotification(n: AppNotification) {
    if (n.rawType === "team_invitation_received") {
      const invitationId = n.data?.invitation_id;
      if (!invitationId) return;
      setViewedInvitationId(invitationId);
      return;
    }

    const requestId = n.data?.team_booking_request_id;
    if (!requestId) return;

    setViewNotificationLoading(true);
    try {
      if (n.rawType === "team_booking_request_received") {
        const detail = await getMyConfirmationDetail(requestId);
        setViewedConfirmation(detail);
      } else if (n.rawType === "team_booking_payment_request") {
        const detail = await getMyPaymentDetail(requestId);
        setViewedPayment(detail);
      } else if (n.rawType === "team_booking_pitch_booked") {
        const summary = await getBookedPitchSummary(requestId);
        setViewedBookedSummary(summary);
      }
      setNotifDrawerOpen(false);
    } catch (err) {
      console.error("Failed to load notification detail:", err);
    } finally {
      setViewNotificationLoading(false);
    }
  }

  // ---------------- open-slot popup triggers ----------------
  function openSlotFromOwnerAction() {
    if (!pendingOwnerAction) return;
    setOpenSlotContext({
      requestId: pendingOwnerAction.request_id,
      pitchName: pendingOwnerAction.pitch_name,
      teamName: pendingOwnerAction.team_name || "",
      slotsNeeded: pendingOwnerAction.declined_members?.length || 0,
      pricePerSlot: Number(pendingOwnerAction.price_per_member) || 0,
    });
  }

  function openSlotFromLiveDetail(detail: TeamBookingLiveDetail) {
    setOpenSlotContext({
      requestId: detail.id,
      pitchName: detail.pitch_name,
      teamName: detail.team_name,
      slotsNeeded: detail.declined_members?.length || 0,
      pricePerSlot: Number(detail.price_per_member) || 0,
    });
  }

  async function handleCoverRemainingAndPay(requestId: string) {
    setOwnerActionLoading(true);
    try {
      const result = await coverRemainingOpenSlotsAndStartPayment(requestId);
      if (result.unavailable && result.pitch_id) setUnavailablePitchId(result.pitch_id);
      setActiveLiveDetailId(null);
      setTeamBookingListOpen(false);
      refreshPendingOwnerAction();
      refreshTeamUpdateBadge();
    } catch (err) {
      console.error("Failed to cover remaining slots and start payment:", err);
    } finally {
      setOwnerActionLoading(false);
    }
  }

  const unreadCount = unreadNotifCount;
  const unreadChatCount = chatSummary?.total_unread ?? 0;

  const role = user?.role as UserRole | undefined;
  const dashboardPath = getDashboardPath(role);
  const isOwner = role === "OWNER";
  // OWNER only: Player Mode OFF => dashboard-only nav, no chat icon.
  // PLAYER / ADMIN are never affected by this flag.
  const ownerPlayerModeOff = isOwner && !playerModeActive;
  const canSeePlayerNav = user ? (role !== "OWNER" || playerModeActive) : false;

  const NAV_ITEMS = dashboardPath
    ? canSeePlayerNav
      ? [{ to: dashboardPath, label: "Dashboard", icon: DashboardIcon, end: false }, ...BASE_NAV_ITEMS]
      : [{ to: dashboardPath, label: "Dashboard", icon: DashboardIcon, end: false }]
    : BASE_NAV_ITEMS;

  useEffect(() => {
    if (!notifDrawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNotifDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [notifDrawerOpen]);

  async function markAllRead() {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    setUnreadNotifCount(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  }

  async function handleBellClick() {
    const opening = !notifDrawerOpen;
    setNotifDrawerOpen((v) => !v);
    if (opening && unreadCount > 0) {
      await markAllRead();
    }
  }

  async function handleAction(notif: AppNotification, response?: "accept" | "decline") {
    setNotifications((list) => list.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    setUnreadNotifCount((c) => Math.max(0, c - (notif.read ? 0 : 1)));

    try {
      await markNotificationRead(notif.id);
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }

    if (notif.action?.kind === "open" && notif.action.to) {
      setNotifDrawerOpen(false);
      nav(notif.action.to);
      return;
    }
    console.log("TODO: respond to notification", notif.id, response);
  }

  function goToChat() {
    nav("/chat");
  }

  const routeBlockedForOwner = ownerPlayerModeOff && isPathRestrictedForOwner(location.pathname);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        {!userLoaded ? (
          // Nothing role-dependent renders until we actually know the
          // role — this is what guarantees zero frames of the wrong
          // UI, not just a fast swap after the fact.
          <Link to="/" className={styles.brand} aria-label="MedaPlus">
            <span className={styles.brandMark}><BallIcon /></span>
            <span className={styles.brandName}>MedaPlus</span>
          </Link>
        ) : ownerPlayerModeOff ? (
          <>
            <Link to={dashboardPath || "/owner/"} className={styles.brand}>
              <span className={styles.brandMark}><BallIcon /></span>
              <span className={styles.brandName}>MedaPlus</span>
            </Link>
            <div className={styles.topbarActions}>
              <button
                ref={bellRef}
                className={styles.bellBtn}
                onClick={handleBellClick}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                aria-expanded={notifDrawerOpen}
              >
                <BellIcon width={20} height={20} />
                {unreadCount > 0 && <span className={styles.bellBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>
              <Link to="/profile" className={styles.avatarLink} aria-label="Profile">
                <span className={styles.avatarCircle}>
                  {user?.profile_photo_url ? (
                    <img
                      src={user.profile_photo_url}
                      alt=""
                      style={{ width: "100%", height: "100%", borderRadius: "inherit", objectFit: "cover" }}
                    />
                  ) : (
                    avatarFallback(user)
                  )}
                </span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <Link to="/home" className={styles.brand}>
              <span className={styles.brandMark}><BallIcon /></span>
              <span className={styles.brandName}>MedaPlus</span>
            </Link>

            <nav className={styles.desktopNav} aria-label="Main navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                  >
                    <Icon width={17} height={17} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className={styles.topbarActions}>
              <button
                className={styles.bellBtn}
                onClick={goToChat}
                aria-label={`Team chats${unreadChatCount ? `, ${unreadChatCount} unread` : ""}`}
              >
                <ChatBubbleIcon width={20} height={20} />
                {unreadChatCount > 0 && (
                  <span className={styles.bellBadge}>{unreadChatCount > 9 ? "9+" : unreadChatCount}</span>
                )}
              </button>

              <button
                ref={bellRef}
                className={styles.bellBtn}
                onClick={handleBellClick}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                aria-expanded={notifDrawerOpen}
              >
                <BellIcon width={20} height={20} />
                {unreadCount > 0 && <span className={styles.bellBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>

              {teamUpdateVisible && (
                <button
                  className={`${styles.teamUpdatePill} ${teamUpdateNeedsDecision ? styles.teamUpdatePillAlert : ""}`}
                  onClick={() => setTeamBookingListOpen(true)}
                  aria-label={teamUpdateNeedsDecision ? "Booking needs a decision" : "Booking in progress"}
                >
                  <span className={styles.teamUpdateDot} />
                  <span className={styles.teamUpdateLabelFull}>
                    {teamUpdateNeedsDecision ? "Action Needed" : "Booking Active"}
                  </span>
                  <span className={styles.teamUpdateLabelShort}>
                    {teamUpdateNeedsDecision ? "Action" : "Active"}
                  </span>
                </button>
              )}

              <Link to="/profile" className={styles.avatarLink} aria-label="Profile">
                <span className={styles.avatarCircle}>
                  {user?.profile_photo_url ? (
                    <img
                      src={user.profile_photo_url}
                      alt=""
                      style={{ width: "100%", height: "100%", borderRadius: "inherit", objectFit: "cover" }}
                    />
                  ) : (
                    avatarFallback(user)
                  )}
                </span>
              </Link>
            </div>
          </>
        )}
      </header>

      <main className={styles.content}>
        {routeBlockedForOwner ? <OwnerBlockedPage /> : <Outlet />}
      </main>

      {userLoaded && !ownerPlayerModeOff && (
        <nav className={styles.bottomNav} aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${styles.bottomNavLink} ${isActive ? styles.bottomNavLinkActive : ""}`}
              >
                <Icon width={20} height={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {/* Notification drawer */}
      {notifDrawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setNotifDrawerOpen(false)} />
          <div className={styles.notifDrawer} role="dialog" aria-label="Notifications" aria-modal="true">
            <div className={styles.chatDrawerHead}>
              <span>Notifications</span>
              <div className={styles.notifPanelHeadActions}>
                <button className={styles.closePanelBtn} onClick={() => setNotifDrawerOpen(false)} aria-label="Close">
                  <XIcon width={15} height={15} />
                </button>
              </div>
            </div>

            <div className={styles.notifList}>
              {notificationsLoading ? (
                <div style={{ display: "grid", gap: 8, padding: "4px 2px" }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 66, borderRadius: 12,
                        background: "linear-gradient(90deg, var(--surface-alt, #f4f5f6) 25%, #e8e9ea 37%, var(--surface-alt, #f4f5f6) 63%)",
                        backgroundSize: "400% 100%",
                        animation: "shimmerNotif 1.4s ease infinite",
                      }}
                    />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className={styles.notifEmpty}>
                  <InboxEmptyIcon width={30} height={30} />
                  <span>You're all caught up</span>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`${styles.notifItem} ${!n.read ? styles.notifItemUnread : ""}`}
                    style={{ backgroundColor: notifBgColor(n) }}
                  >
                    <span className={styles.notifDot} style={{ background: notifAccentColor(n) }} />
                    <div className={styles.notifBody}>
                      <div className={styles.notifTopRow}>
                        <span className={styles.notifTag}>{CATEGORY_LABEL[n.category]}</span>
                        <span className={styles.notifTime}>{n.time}</span>
                      </div>
                      <div className={styles.notifTitle}>{n.title}</div>
                      <div className={styles.notifMsg}>{n.message}</div>

                      {n.action?.kind === "accept_decline" && (
                        <div className={styles.notifActions}>
                          <button className={styles.notifAcceptBtn} onClick={() => handleAction(n, "accept")}>Accept</button>
                          <button className={styles.notifDeclineBtn} onClick={() => handleAction(n, "decline")}>Decline</button>
                        </div>
                      )}
                      {n.action?.kind === "open" && (
                        <button className={styles.notifOpenBtn} onClick={() => handleAction(n)}>
                          {n.action.label}
                        </button>
                      )}
                      {n.rawType === "team_invitation_received" && n.data?.invitation_id && !n.data?.response && (
                        <div className={styles.notifActions}>
                          <button
                            className={styles.notifDeclineBtn}
                            onClick={() => setViewedInvitationId(n.data!.invitation_id)}
                          >
                            Reject
                          </button>
                          <button
                            className={styles.notifAcceptBtn}
                            onClick={() => handleViewNotification(n)}
                          >
                            View
                          </button>
                        </div>
                      )}
                      {n.rawType === "team_invitation_received" && n.data?.response && (
                        <div
                          className={
                            n.data.response === "accepted"
                              ? styles.notifResolvedTagAccepted
                              : styles.notifResolvedTagDeclined
                          }
                        >
                          {n.data.response === "accepted" ? "You accepted" : "You rejected"}
                        </div>
                      )}
                      {VIEWABLE_TYPES.has(n.rawType || "") &&
                        n.rawType !== "team_invitation_received" &&
                        n.data?.team_booking_request_id && (
                          <button className={styles.notifViewBtn} onClick={() => handleViewNotification(n)}>
                            View
                          </button>
                        )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {viewNotificationLoading && (
        <div className={styles.viewLoadingOverlay}>
          <div className={styles.viewLoadingSpinner} />
        </div>
      )}

      {/* ---------------- Mandatory / dismissible popups ---------------- */}

      {pendingBookingConfirmation && pendingBookingConfirmation.id !== dismissedConfirmationId && (
        <TeamBookingConfirmPopup
          confirmation={pendingBookingConfirmation}
          onConfirmed={() => {}}
          onDeclined={() => {}}
          onConfirm={handleBookingConfirmYes}
          onDecline={handleBookingConfirmNo}
          onClose={() => setDismissedConfirmationId(pendingBookingConfirmation.id)}
        />
      )}

      {!pendingBookingConfirmation && pendingOwnerAction && (
        pendingOwnerAction.type === "confirm_summary"
          ? pendingOwnerAction.request_id !== dismissedOwnerActionId && (
              <OwnerBookingSummaryPopup
                action={pendingOwnerAction}
                loading={ownerActionLoading}
                onResolveSummary={handleResolveSummary}
                onResolvePaymentTimeout={handleResolvePaymentTimeout}
                onAcknowledgeSuccess={handleAcknowledgeSuccess}
                onOpenSlotChosen={openSlotFromOwnerAction}
                onClose={() => setDismissedOwnerActionId(pendingOwnerAction.request_id)}
              />
            )
          : (
              <OwnerBookingSummaryPopup
                action={pendingOwnerAction}
                loading={ownerActionLoading}
                onResolveSummary={handleResolveSummary}
                onResolvePaymentTimeout={handleResolvePaymentTimeout}
                onAcknowledgeSuccess={handleAcknowledgeSuccess}
                onOpenSlotChosen={openSlotFromOwnerAction}
              />
            )
      )}

      {!pendingBookingConfirmation && !pendingOwnerAction && pendingPayment && (
        <MemberPaymentPopup payment={pendingPayment} />
      )}

      {!pendingBookingConfirmation && !pendingOwnerAction && !pendingPayment && pendingSoloPayment && (
        <MemberPaymentPopup
          payment={pendingSoloPayment}
          kind="solo"
          onClose={() => { setPendingSoloPayment(null); refreshPendingSoloPayment(); }}
          onPaid={() => { setPendingSoloPayment(null); refreshPendingSoloPayment(); }}
        />
      )}

      {/* ---------------- Anytime team-bookings drawer flow ---------------- */}

      {teamBookingListOpen && !activeLiveDetailId && (
        <TeamBookingListPopup
          onClose={() => setTeamBookingListOpen(false)}
          onSelect={(id) => setActiveLiveDetailId(id)}
        />
      )}

      {activeLiveDetailId && !openSlotContext && (
        <TeamBookingLiveDetailPopup
          requestId={activeLiveDetailId}
          onClose={() => {
            setActiveLiveDetailId(null);
            setTeamBookingListOpen(false);
          }}
          onResolveSummary={handleResolveSummary}
          onOpenSlotChosen={openSlotFromLiveDetail}
          onCoverRemainingAndPay={handleCoverRemainingAndPay}
          resolveLoading={ownerActionLoading}
        />
      )}

      {unavailablePitchId && (
        <PitchUnavailablePopup
          pitchId={unavailablePitchId}
          onClose={() => setUnavailablePitchId(null)}
        />
      )}

      {openSlotContext && (
        <OpenSlotFormPopup
          requestId={openSlotContext.requestId}
          pitchName={openSlotContext.pitchName}
          teamName={openSlotContext.teamName}
          slotsNeeded={openSlotContext.slotsNeeded}
          pricePerSlot={openSlotContext.pricePerSlot}
          onClose={() => setOpenSlotContext(null)}
          onCreated={() => {
            setOpenSlotContext(null);
            refreshPendingOwnerAction();
            refreshTeamUpdateBadge();
          }}
          onUnavailable={(pitchId) => setUnavailablePitchId(pitchId)}
        />
      )}

      {/* ---------------- "View" from a notification ---------------- */}

      {viewedConfirmation && (
        <TeamBookingConfirmPopup
          confirmation={{
            id: viewedConfirmation.id,
            request_id: viewedConfirmation.request_id,
            pitch_name: viewedConfirmation.pitch_name,
            team_name: viewedConfirmation.team_name,
            selections: viewedConfirmation.selections,
            price_per_member: viewedConfirmation.price_per_member,
            expires_at: viewedConfirmation.expires_at,
          }}
          onConfirmed={() => {}}
          onDeclined={() => {}}
          onConfirm={async (id) => {
            await handleBookingConfirmYes(id);
            setViewedConfirmation(null);
          }}
          onDecline={async (id) => {
            await handleBookingConfirmNo(id);
            setViewedConfirmation(null);
          }}
          onClose={() => setViewedConfirmation(null)}
          readOnly={!viewedConfirmation.can_respond}
          readOnlyStatusLabel={
            viewedConfirmation.my_status === "confirmed"
              ? "You already confirmed."
              : viewedConfirmation.my_status === "declined"
              ? "You already declined."
              : "This confirmation window has closed."
          }
        />
      )}

      {viewedPayment && (
        <MemberPaymentPopup
          payment={{
            id: viewedPayment.id,
            request_id: viewedPayment.request_id,
            pitch_name: viewedPayment.pitch_name,
            team_name: viewedPayment.team_name,
            amount: viewedPayment.amount,
            payment_expires_at: viewedPayment.payment_expires_at,
          }}
          onClose={() => setViewedPayment(null)}
          readOnly={!viewedPayment.can_pay}
          readOnlyStatusLabel={
            viewedPayment.my_status === "paid" || viewedPayment.my_status === "covered_by_owner"
              ? "You already paid."
              : viewedPayment.my_status === "excluded"
              ? "You were excluded from this round."
              : "This payment window has closed."
          }
        />
      )}

      {viewedBookedSummary && (
        <BookedPitchSummaryPopup
          summary={viewedBookedSummary}
          onClose={() => setViewedBookedSummary(null)}
        />
      )}

      {viewedInvitationId && (
        <TeamInvitationPopup
          invitationId={viewedInvitationId}
          onClose={() => setViewedInvitationId(null)}
          onAccepted={() => {
            setViewedInvitationId(null);
            refreshNotifications();
          }}
          onDeclined={() => {
            setViewedInvitationId(null);
            refreshNotifications();
          }}
        />
      )}
    </div>
  );
}