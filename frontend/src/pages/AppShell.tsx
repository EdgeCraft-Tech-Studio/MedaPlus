// AppShell.tsx
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import styles from "./css/AppShell.module.css";
import {
  BallIcon, HomeIcon, UsersIcon, CompassIcon, UserCircleIcon,
  BellIcon, XIcon, InboxEmptyIcon,
  FootballPitchIcon,
} from "./Icons";
import { mockNotifications } from "./mockData";
import { type AppNotification, type NotificationCategory } from "./types";
import { getUnreadSummary, colorFromId, initialFromName, type ChatUnreadSummary } from "../lib/chat";
import { me } from "../lib/auth";
import type { SessionUser } from "../lib/session";

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: HomeIcon, end: true },
  { to: "/teams", label: "My Teams", icon: UsersIcon },
  { to: "/app", label: "pitchs", icon: FootballPitchIcon },
  { to: "/discover", label: "Discover", icon: CompassIcon },
  { to: "/profile", label: "Profile", icon: UserCircleIcon },
];

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  team: "Team", match: "Match", booking: "Booking", tournament: "Tournament",
};

const CHAT_POLL_INTERVAL_MS = 20000;

function timeAgoColor(read: boolean) {
  return read ? "var(--muted)" : "var(--grass)";
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

export default function AppShell() {
  const nav = useNavigate();

  const [notifications, setNotifications] = useState<AppNotification[]>(mockNotifications);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  const [chatSummary, setChatSummary] = useState<ChatUnreadSummary | null>(null);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const chatBtnRef = useRef<HTMLButtonElement>(null);

  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        setUser(await me());
      } catch (err) {
        console.error("Failed to load user for topbar avatar:", err);
        setUser(null);
      }
    }
    loadUser();
  }, []);

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

  const unreadCount = notifications.filter((n) => !n.read).length;
  const unreadChatCount = chatSummary?.total_unread ?? 0;

  // Both drawers: close on Escape.
  useEffect(() => {
    if (!notifDrawerOpen && !chatDrawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNotifDrawerOpen(false);
        setChatDrawerOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [notifDrawerOpen, chatDrawerOpen]);

  function markAllRead() {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    // TODO: await markAllNotificationsRead();
  }

  function handleAction(notif: AppNotification, response?: "accept" | "decline") {
    setNotifications((list) => list.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    if (notif.action?.kind === "open" && notif.action.to) {
      setNotifDrawerOpen(false);
      nav(notif.action.to);
      return;
    }
    // TODO: await respondToNotification(notif.id, response);
    console.log("TODO: respond to notification", notif.id, response);
  }

  function openChat(teamSlug: string, teamName: string) {
    setChatDrawerOpen(false);
    nav(`/chat/${teamSlug}`, { state: { teamName } });
  }

  function toggleChatDrawer() {
    setChatDrawerOpen((v) => {
      const next = !v;
      if (next) refreshChatSummary(); // fresh counts every time it's opened
      return next;
    });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
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
            ref={chatBtnRef}
            className={styles.bellBtn}
            onClick={toggleChatDrawer}
            aria-label={`Team chats${unreadChatCount ? `, ${unreadChatCount} unread` : ""}`}
            aria-expanded={chatDrawerOpen}
          >
            <ChatBubbleIcon width={20} height={20} />
            {unreadChatCount > 0 && (
              <span className={styles.bellBadge}>{unreadChatCount > 9 ? "9+" : unreadChatCount}</span>
            )}
          </button>

          <button
            ref={bellRef}
            className={styles.bellBtn}
            onClick={() => setNotifDrawerOpen((v) => !v)}
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
      </header>

      <main className={styles.content}>
        <Outlet />
      </main>

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

      {/* Notification drawer — slides in from the LEFT */}
      {notifDrawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setNotifDrawerOpen(false)} />
          <div className={styles.notifDrawer} role="dialog" aria-label="Notifications" aria-modal="true">
            <div className={styles.chatDrawerHead}>
              <span>Notifications</span>
              <div className={styles.notifPanelHeadActions}>
                {unreadCount > 0 && (
                  <button className={styles.markAllBtn} onClick={markAllRead}>Mark all read</button>
                )}
                <button className={styles.closePanelBtn} onClick={() => setNotifDrawerOpen(false)} aria-label="Close">
                  <XIcon width={15} height={15} />
                </button>
              </div>
            </div>

            <div className={styles.notifList}>
              {notifications.length === 0 && (
                <div className={styles.notifEmpty}>
                  <InboxEmptyIcon width={30} height={30} />
                  <span>You're all caught up</span>
                </div>
              )}

              {notifications.map((n) => (
                <div key={n.id} className={`${styles.notifItem} ${!n.read ? styles.notifItemUnread : ""}`}>
                  <span className={styles.notifDot} style={{ background: timeAgoColor(n.read) }} />
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Chat drawer — slides in from the RIGHT */}
      {chatDrawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setChatDrawerOpen(false)} />
          <div className={styles.chatDrawer} role="dialog" aria-label="Team chats" aria-modal="true">
            <div className={styles.chatDrawerHead}>
              <span>Chats</span>
              <button className={styles.closePanelBtn} onClick={() => setChatDrawerOpen(false)} aria-label="Close">
                <XIcon width={15} height={15} />
              </button>
            </div>

            <div className={styles.chatDrawerList}>
              {!chatSummary && (
                <div className={styles.notifEmpty}>
                  <span>Loading…</span>
                </div>
              )}

              {chatSummary && chatSummary.teams.length === 0 && (
                <div className={styles.notifEmpty}>
                  <InboxEmptyIcon width={30} height={30} />
                  <span>No team chats yet</span>
                </div>
              )}

              {chatSummary?.teams.map((team) => (
                <button
                  key={team.team_id}
                  className={`${styles.chatDrawerItem} ${team.unread_count > 0 ? styles.chatListItemUnread : ""}`}
                  onClick={() => openChat(team.team_slug, team.team_name)}
                >
                  <span className={styles.chatAvatar} style={{ background: colorFromId(team.team_id) }}>
                    {team.team_logo ? (
                      <img
                        src={team.team_logo}
                        alt=""
                        style={{ width: "100%", height: "100%", borderRadius: "inherit", objectFit: "cover" }}
                      />
                    ) : (
                      initialFromName(team.team_name)
                    )}
                  </span>
                  <span className={styles.chatDrawerItemName}>{team.team_name}</span>
                  {team.unread_count > 0 && (
                    <span className={styles.chatItemUnreadDot}>
                      {team.unread_count > 9 ? "9+" : team.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}