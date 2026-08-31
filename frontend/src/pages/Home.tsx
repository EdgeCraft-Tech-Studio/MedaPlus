import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import styles from "./css/Home.module.css";
import {
  VersusIcon, UsersIcon, ChevronRightIcon, TrophyIcon, FootballPitchIcon,
  ClockIcon, MapPinIcon, BookPitchIcon,
} from "./Icons";
import { type TournamentStatus } from "./types";
import type { SessionUser } from "../lib/session";
import { me } from "../lib/auth";

const PITCH_OWNER_ROLE = "OWNER";
const ADMIN_ROLE = "ADMIN";

const baseQuickActions = [
  { key: "pitchbook", to: "/app", icon: BookPitchIcon, label: "Book Pitch" },
  { key: "createteam", to: "/team/create", icon: UsersIcon, label: "Create team" },
];

const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  registration_open: "Registration open",
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
};

/* =============================================================
   MOCK DATA — unchanged from before, UI-only demo data.
   ============================================================= */

interface HomeMatch {
  id: string;
  teamName: string;
  opponentLabel: string;
  sport: string;
  pitchName: string;
  pitchArea: string;
  date: string;
  time: string;
  status: "confirmed" | "pending_payment" | "open";
}

// TODO: replace with `await getUpcomingMatches()` once that endpoint exists.
const mockUpcomingMatches: HomeMatch[] = [
  {
    id: "m1", teamName: "Bole United", opponentLabel: "vs Friday FC", sport: "Football",
    pitchName: "Bole Arena", pitchArea: "Bole, Addis Ababa", date: "2026-08-19", time: "18:00",
    status: "confirmed",
  },
  {
    id: "m2", teamName: "Bole United", opponentLabel: "Open match — 3 spots left", sport: "Football",
    pitchName: "CMC Pitch 2", pitchArea: "CMC, Addis Ababa", date: "2026-08-21", time: "16:30",
    status: "open",
  },
  {
    id: "m3", teamName: "Hoops Collective", opponentLabel: "vs Court Kings", sport: "Basketball",
    pitchName: "Sarbet Indoor Court", pitchArea: "Sarbet, Addis Ababa", date: "2026-08-22", time: "19:00",
    status: "pending_payment",
  },
];

interface HomeTournament {
  id: string;
  name: string;
  teamName: string;
  sport: string;
  location: string;
  status: TournamentStatus;
  startDate: string;
  teamsJoined: number;
  teamsMax: number;
}

// TODO: replace with `await getUpcomingTournaments()` once that endpoint exists.
const mockUpcomingTournaments: HomeTournament[] = [
  {
    id: "t1", name: "Bole Weekend Cup", teamName: "Bole United", sport: "Football",
    location: "Bole, Addis Ababa", status: "registration_open", startDate: "2026-08-22",
    teamsJoined: 6, teamsMax: 8,
  },
  {
    id: "t2", name: "CMC 3x3 Showdown", teamName: "Hoops Collective", sport: "Basketball",
    location: "CMC, Addis Ababa", status: "upcoming", startDate: "2026-09-02",
    teamsJoined: 10, teamsMax: 16,
  },
];

// TODO: replace with `await getWeekSnapshot()` once that endpoint exists.
const mockWeekSnapshot = {
  matchesThisWeek: 3,
  pendingPayments: 1,
  tournamentsOpen: 1,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString(undefined, { day: "2-digit" }),
    month: d.toLocaleDateString(undefined, { month: "short" }),
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
  };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const HERO_IMAGE_SRC = "/homeimage.png";

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const preloadedRef = useRef(false);

  const pitchOwnerAction = {
    key: "pitch", to: "/owner", icon: FootballPitchIcon, label: "Manage pitch",
  };

  const adminAction = {
    key: "pitch", to: "/admin", icon: FootballPitchIcon, label: "Dashboard",
  };

  const roleAction =
    user?.role === PITCH_OWNER_ROLE
      ? pitchOwnerAction
      : user?.role === ADMIN_ROLE
      ? adminAction
      : null;

  const quickActions = roleAction ? [...baseQuickActions, roleAction] : baseQuickActions;

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await me();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    }
    loadUser();
  }, []);

  // Best-effort <link rel="preload"> for the hero image so it starts
  // fetching as early as possible. For a real production LCP win this
  // preload tag should live in index.html's <head> directly (it fires
  // before React even loads) — this is a same-effect fallback for
  // when that's not editable here.
  useEffect(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = HERO_IMAGE_SRC;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  return (
    <div className={styles.page}>
      {/* ---------------- HERO BANNER (full-bleed, scrolls under the sticky AppShell nav) ---------------- */}
      <div className={styles.heroBanner}>
        {!heroLoaded && <div className={styles.heroShimmer} />}
        <img
          src={HERO_IMAGE_SRC}
          alt=""
          className={`${styles.heroImg} ${heroLoaded ? styles.heroImgLoaded : ""}`}
          decoding="async"
          onLoad={() => setHeroLoaded(true)}
          {...({ fetchpriority: "high" } as any)}
        />
        <div className={styles.heroOverlay} />

        <div className={styles.heroContent}>
          <span className={styles.heroEyebrow}>{todayLabel()}</span>
          <h1 className={styles.heroTitle}>{getGreeting()}, {user?.username ?? "there"}</h1>
          <p className={styles.heroSubtitle}>Book a pitch, build your squad, and get on the field.</p>
        </div>
      </div>

      {/* ---------------- QUICK ACTIONS — floating card overlapping the hero's bottom edge ---------------- */}
      <div className={styles.quickCard}>
        <div className={styles.quickGrid}>
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.key} to={a.to} className={styles.quickBtn}>
                <span className={styles.quickIconWrap}><Icon width={18} height={18} /></span>
                <span className={styles.quickLabel}>{a.label}</span>
                <ChevronRightIcon className={styles.quickChevron} width={14} height={14} />
              </Link>
            );
          })}
        </div>
      </div>

      <div className={styles.content}>
        {/* ---------------- WEEK SNAPSHOT ---------------- */}
        <div className={styles.snapshotRow}>
          <div className={styles.snapshotItem}>
            <span className={styles.snapshotValue}>{mockWeekSnapshot.matchesThisWeek}</span>
            <span className={styles.snapshotLabel}>Matches this week</span>
          </div>
          <div className={styles.snapshotDivider} />
          <div className={styles.snapshotItem}>
            <span className={styles.snapshotValue}>{mockWeekSnapshot.pendingPayments}</span>
            <span className={styles.snapshotLabel}>Pending payments</span>
          </div>
          <div className={styles.snapshotDivider} />
          <div className={styles.snapshotItem}>
            <span className={styles.snapshotValue}>{mockWeekSnapshot.tournamentsOpen}</span>
            <span className={styles.snapshotLabel}>Tournaments open</span>
          </div>
        </div>

        {/* ---------------- UPCOMING MATCHES ---------------- */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Upcoming matches</span>
            <Link to="" className={styles.seeAllLink}>See all <ChevronRightIcon width={13} height={13} /></Link>
          </div>

          {mockUpcomingMatches.length === 0 ? (
            <EmptyState2 icon={VersusIcon} text="No matches on your calendar yet." />
          ) : (
            <div className={styles.matchList}>
              {mockUpcomingMatches.map((m) => {
                const { day, month, weekday } = formatDate(m.date);
                return (
                  <Link key={m.id} to="" className={styles.matchRow}>
                    <div className={styles.matchDateBlock}>
                      <span className={styles.matchWeekday}>{weekday}</span>
                      <span className={styles.matchDay}>{day}</span>
                      <span className={styles.matchMonth}>{month}</span>
                    </div>

                    <div className={styles.matchDivider} />

                    <div className={styles.matchInfo}>
                      <div className={styles.matchTeamRow}>
                        <span className={styles.matchTeamTag}>{m.teamName}</span>
                        <span className={styles.matchSport}>{m.sport}</span>
                      </div>
                      <div className={styles.matchTitle}>{m.opponentLabel}</div>
                      <div className={styles.matchMeta}>
                        <ClockIcon width={12} height={12} /> {m.time}
                        <span className={styles.matchMetaDot} />
                        <MapPinIcon width={12} height={12} /> {m.pitchName}, {m.pitchArea}
                      </div>
                    </div>

                    <span className={styles.statusPill} data-status={m.status}>
                      {m.status === "confirmed" && "Confirmed"}
                      {m.status === "pending_payment" && "Payment pending"}
                      {m.status === "open" && "Open"}
                    </span>
                    <ChevronRightIcon className={styles.matchChevron} width={16} height={16} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------- UPCOMING TOURNAMENTS ---------------- */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Upcoming tournaments</span>
            <Link to="" className={styles.seeAllLink}>See all <ChevronRightIcon width={13} height={13} /></Link>
          </div>

          {mockUpcomingTournaments.length === 0 ? (
            <EmptyState2 icon={TrophyIcon} text="No tournaments to show right now." />
          ) : (
            <div className={styles.tournamentRow}>
              {mockUpcomingTournaments.map((t) => (
                <Link key={t.id} to="" className={styles.tournamentCard}>
                  <div className={styles.tournamentTop}>
                    <span className={styles.tournamentIconWrap}><TrophyIcon width={16} height={16} /></span>
                    <span className={styles.statusPill} data-status={t.status}>{TOURNAMENT_STATUS_LABEL[t.status]}</span>
                  </div>
                  <div className={styles.tournamentTeamTag}>{t.teamName}</div>
                  <div className={styles.tournamentName}>{t.name}</div>
                  <div className={styles.tournamentMeta}>{t.sport} · {t.location}</div>
                  <div className={styles.tournamentFoot}>
                    <span>{t.teamsJoined}/{t.teamsMax} teams</span>
                    <span>{new Date(t.startDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyState2({
  icon: Icon, text,
}: { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; text: string }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIconWrap}><Icon width={20} height={20} /></span>
      <p>{text}</p>
    </div>
  );
}