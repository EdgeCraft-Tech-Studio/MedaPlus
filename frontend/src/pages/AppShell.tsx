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
import { me } from "../lib/auth";
import type { SessionUser } from "../lib/session";

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: HomeIcon, end: true },
  { to: "/teams", label: "Teams", icon: UsersIcon },
  { to: "/app", label: "pitchs", icon: FootballPitchIcon },
  { to: "/discover", label: "Discover", icon: CompassIcon },
  { to: "/profile", label: "Profile", icon: UserCircleIcon },
];

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  team: "Team", match: "Match", booking: "Booking", tournament: "Tournament",
};

function timeAgoColor(read: boolean) {
  return read ? "var(--muted)" : "var(--grass)";
}

/** First letter of first_name, uppercased. Falls back to full_name, then "–". */
function avatarFallback(user: SessionUser | null): string {
  if (!user) return "–";
  const source = user.first_name?.trim() || user.full_name?.trim();
  if (!source) return "–";
  return source[0].toUpperCase();
}

export default function AppShell() {
  const nav = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>(mockNotifications);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const u = await me();
        setUser(u);
      } catch (err) {
        console.error("Failed to load user for topbar avatar:", err);
        setUser(null);
      }
    }
    loadUser();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        panelOpen &&
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [panelOpen]);

  function markAllRead() {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    // TODO: await markAllNotificationsRead();
  }

  function handleAction(notif: AppNotification, response?: "accept" | "decline") {
    setNotifications((list) => list.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    if (notif.action?.kind === "open" && notif.action.to) {
      setPanelOpen(false);
      nav(notif.action.to);
      return;
    }
    // TODO: await respondToNotification(notif.id, response);
    console.log("TODO: respond to notification", notif.id, response);
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
          <div className={styles.notifWrap}>
            <button
              ref={bellRef}
              className={styles.bellBtn}
              onClick={() => setPanelOpen((v) => !v)}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              aria-expanded={panelOpen}
            >
              <BellIcon width={20} height={20} />
              {unreadCount > 0 && <span className={styles.bellBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>

            {panelOpen && (
              <div className={styles.notifPanel} ref={panelRef} role="dialog" aria-label="Notifications">
                <div className={styles.notifPanelHead}>
                  <span>Notifications</span>
                  <div className={styles.notifPanelHeadActions}>
                    {unreadCount > 0 && (
                      <button className={styles.markAllBtn} onClick={markAllRead}>Mark all read</button>
                    )}
                    <button className={styles.closePanelBtn} onClick={() => setPanelOpen(false)} aria-label="Close">
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
            )}
          </div>

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
    </div>
  );
}