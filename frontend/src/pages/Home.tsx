import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./css/Home.module.css";
import {
  VersusIcon, UsersIcon, ChevronRightIcon, TrophyIcon, FootballPitchIcon,
  ClockIcon, MapPinIcon, BookPitchIcon,
} from "./Icons";
import type { SessionUser } from "../lib/session";
import { me } from "../lib/auth";
import type { Match } from "../lib/match";
import { listPitches, type Pitch } from "../lib/pitches";
import { getMyTeams, type MyTeam } from "../lib/team";
import { getHomeMatches } from "../lib/home";

const PITCH_OWNER_ROLE = "OWNER";
const ADMIN_ROLE = "ADMIN";

type Tone = "grass" | "match" | "team" | "tournament";

const baseQuickActions: Array<{ key: string; to: string; icon: any; label: string; tone: Tone }> = [
  { key: "pitchbook", to: "/app", icon: BookPitchIcon, label: "Book pitch", tone: "grass" },
  { key: "findmatch", to: "/discover?mode=matches", icon: VersusIcon, label: "Find match", tone: "match" },
  { key: "createteam", to: "/team/create", icon: UsersIcon, label: "Create team", tone: "team" },
];

/* ---------------- small local icons ---------------- */

function FootballIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8 12 7.2z" fill="currentColor" stroke="none" />
      <path d="M12 3v4.2M12 20.8V16.8M4.5 8.3l3.9 1.5M19.5 8.3l-3.9 1.5M4.5 15.7l3.9-1.5M19.5 15.7l-3.9-1.5" />
    </svg>
  );
}

function BasketballIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
      <path d="M5.6 5.6c2.9 3 2.9 9.8 0 12.8M18.4 5.6c-2.9 3-2.9 9.8 0 12.8" />
    </svg>
  );
}

/* ---------------- helpers ---------------- */

function formatDateBlock(iso: string) {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "2-digit" }),
    month: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

/** Time anchored to Addis Ababa's own clock, with an Amharic day-part label
 *  alongside the English one — matches, players, and pitches all live in
 *  Ethiopia, so this shouldn't silently shift for a visitor abroad. */
function addisTimeInfo(iso: string) {
  const d = new Date(iso);
  const tz = "Africa/Addis_Ababa";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d));
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);

  let dayPartEn = "Night";
  let dayPartAm = "ሌሊት";
  if (hour >= 5 && hour < 12) { dayPartEn = "Morning"; dayPartAm = "ጠዋት"; }
  else if (hour >= 12 && hour < 17) { dayPartEn = "Afternoon"; dayPartAm = "ከሰዓት በኋላ"; }
  else if (hour >= 17 && hour < 21) { dayPartEn = "Evening"; dayPartAm = "ማታ"; }

  return { timeLabel, dayPartEn, dayPartAm };
}

function formatBirr(value: string | number | null | undefined) {
  const num = Number(value) || 0;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;
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

/** Why this match shows up for the user — team commitment vs a personal join. */
function classifyMatch(m: Match, myTeamIds: Set<string>): { label: string; tone: "team" | "match" } {
  if (m.match_type === "team_vs_team") {
    const isCreator = myTeamIds.has(m.creator_team_id);
    const teamName = isCreator ? m.creator_team_name : m.opponent_team_name;
    return { label: `Your team — ${teamName || "—"}`, tone: "team" };
  }
  if (myTeamIds.has(m.creator_team_id)) {
    return { label: `Your team — ${m.creator_team_name}`, tone: "team" };
  }
  return { label: "You joined", tone: "match" };
}

const HERO_IMAGE_SRC = "/homeimage.png";

/* ---------------- match row ---------------- */

function HomeMatchRow({
  match, pitch, myTeamIds,
}: { match: Match; pitch: Pitch | undefined; myTeamIds: Set<string> }) {
  const { day, month, weekday } = formatDateBlock(match.start_time);
  const { timeLabel, dayPartEn, dayPartAm } = addisTimeInfo(match.start_time);
  const isOpenSlots = match.match_type === "open_slots";
  const SportIcon = pitch?.sport_type === "BASKETBALL" ? BasketballIcon : FootballIcon;
  const reason = classifyMatch(match, myTeamIds);

  return (
    <Link
      to={`/discover/matches/${match.id}`}
      className={`${styles.matchRow} ${match.status === "confirmed" ? styles.matchRowConfirmed : ""}`}
    >
      <div className={styles.matchDateBlock}>
        <span className={styles.matchWeekday}>{weekday}</span>
        <span className={styles.matchDay}>{day}</span>
        <span className={styles.matchMonth}>{month}</span>
      </div>

      <div className={styles.matchDivider} />

      <div className={styles.matchInfo}>
        <div className={styles.matchTeamRow}>
          <span className={styles.matchReasonTag} data-tone={reason.tone}>{reason.label}</span>
          <span className={styles.matchSport}>
            <SportIcon width={12} height={12} />
            {pitch?.sport_type === "BASKETBALL" ? "Basketball" : "Football"}
          </span>
        </div>

        <div className={styles.matchTitle}>
          {isOpenSlots
            ? `${match.creator_team_name} · Open slots (${match.confirmed_participant_count}/${match.slots_needed})`
            : `${match.creator_team_name} vs ${match.opponent_team_name || "waiting for opponent"}`}
        </div>

        <div className={styles.matchMeta}>
          <ClockIcon width={12} height={12} />
          {timeLabel} · {dayPartEn} <span className={styles.amharic}>({dayPartAm})</span>
          <span className={styles.matchMetaDot} />
          <MapPinIcon width={12} height={12} />
          {pitch?.name || "Pitch"}{pitch?.address ? `, ${pitch.address}` : ""}
        </div>

        <div className={styles.matchPriceLine}>
          {isOpenSlots ? formatBirr(match.price_per_slot) + " to join" : formatBirr(match.price_per_team) + " for your team"}
        </div>
      </div>

      <span className={styles.statusPill} data-status={match.status}>
        {match.status[0].toUpperCase() + match.status.slice(1)}
      </span>
      <ChevronRightIcon className={styles.matchChevron} width={16} height={16} />
    </Link>
  );
}

/* ---------------- page ---------------- */

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const preloadedRef = useRef(false);

  const [matches, setMatches] = useState<Match[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);

  const pitchOwnerAction = { key: "pitch", to: "/owner", icon: FootballPitchIcon, label: "Manage pitch", tone: "tournament" as Tone };
  const adminAction = { key: "pitch", to: "/admin", icon: FootballPitchIcon, label: "Dashboard", tone: "tournament" as Tone };

  const roleAction =
    user?.role === PITCH_OWNER_ROLE ? pitchOwnerAction
    : user?.role === ADMIN_ROLE ? adminAction
    : null;

  const quickActions = roleAction ? [...baseQuickActions, roleAction] : baseQuickActions;

  useEffect(() => {
    async function loadUser() {
      try {
        setUser(await me());
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    async function loadFeed() {
      try {
        setFeedLoading(true);
        setFeedError(false);
        const [m, p, teams] = await Promise.all([
          getHomeMatches(),
          listPitches().catch(() => []),
          getMyTeams().catch(() => []),
        ]);
        setMatches(m);
        setPitches(p);
        setMyTeams(teams);
      } catch (err) {
        console.error("Failed to load home feed:", err);
        setFeedError(true);
      } finally {
        setFeedLoading(false);
      }
    }
    loadFeed();
  }, []);

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

  const pitchById = useMemo(() => {
    const map = new Map<string, Pitch>();
    pitches.forEach((p) => map.set(p.id, p));
    return map;
  }, [pitches]);

  const myTeamIds = useMemo(() => new Set(myTeams.map((t) => t.id)), [myTeams]);

  const sortedMatches = useMemo(
    () => [...matches].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [matches]
  );

  const visibleMatches = showAllMatches ? sortedMatches : sortedMatches.slice(0, 5);

  const weekAheadMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const matchesThisWeek = sortedMatches.filter((m) => new Date(m.start_time).getTime() <= weekAheadMs).length;
  const confirmedCount = sortedMatches.filter((m) => m.status === "confirmed").length;
  const totalUpcoming = sortedMatches.length;

  return (
    <div className={styles.page}>
      {/* ---------------- HERO ---------------- */}
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

      {/* ---------------- QUICK ACTIONS ---------------- */}
      <div className={styles.quickCard}>
        <div className={styles.quickGrid}>
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.key} to={a.to} className={styles.quickBtn}>
                <span className={`${styles.quickIconWrap} ${styles[`tone_${a.tone}`]}`}>
                  <Icon width={18} height={18} />
                </span>
                <span className={styles.quickLabel}>{a.label}</span>
                <ChevronRightIcon className={styles.quickChevron} width={14} height={14} />
              </Link>
            );
          })}
        </div>
      </div>

      <div className={styles.content}>
        {/* ---------------- SNAPSHOT ---------------- */}
        <div className={styles.snapshotRow}>
          <div className={styles.snapshotItem}>
            <span className={styles.snapshotValue}>{feedLoading ? "—" : matchesThisWeek}</span>
            <span className={styles.snapshotLabel}>Matches this week</span>
          </div>
          <div className={styles.snapshotDivider} />
          <div className={styles.snapshotItem}>
            <span className={styles.snapshotValue}>{feedLoading ? "—" : confirmedCount}</span>
            <span className={styles.snapshotLabel}>Confirmed</span>
          </div>
          <div className={styles.snapshotDivider} />
          <div className={styles.snapshotItem}>
            <span className={styles.snapshotValue}>{feedLoading ? "—" : totalUpcoming}</span>
            <span className={styles.snapshotLabel}>Total upcoming</span>
          </div>
        </div>

        {/* ---------------- UPCOMING MATCHES ---------------- */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Upcoming matches</span>
          </div>

          {feedLoading ? (
            <div className={styles.matchList}>
              {[0, 1, 2].map((i) => <div key={i} className={styles.matchRowSkeleton} />)}
            </div>
          ) : feedError ? (
            <EmptyState2 icon={VersusIcon} text="Couldn't load your matches. Please try again shortly." />
          ) : sortedMatches.length === 0 ? (
            <EmptyState2 icon={VersusIcon} text="No matches yet — accept a challenge or join an open match to see it here." />
          ) : (
            <>
              <div className={styles.matchList}>
                {visibleMatches.map((m) => (
                  <HomeMatchRow key={m.id} match={m} pitch={pitchById.get(m.pitch_id)} myTeamIds={myTeamIds} />
                ))}
              </div>
              {sortedMatches.length > 5 && (
                <button className={styles.showMoreBtn} onClick={() => setShowAllMatches((v) => !v)}>
                  {showAllMatches ? "Show fewer" : `Show all ${sortedMatches.length} matches`}
                </button>
              )}
            </>
          )}
        </section>

        {/* ---------------- TOURNAMENTS (coming soon) ---------------- */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Tournaments</span>
          </div>
          <div className={styles.comingSoonCard}>
            <span className={styles.comingSoonIconWrap}><TrophyIcon width={22} height={22} /></span>
            <div className={styles.comingSoonTitle}>Tournaments — coming soon</div>
            <p className={styles.comingSoonText}>
              Team tournaments and brackets are on the way. We'll let you know the moment registration opens.
            </p>
          </div>
        </section>
      </div>

      <HomeFooter />
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

function HomeFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>MedaPlus</span>
          <p className={styles.footerTagline}>
            Book pitches, build teams, and find your next match — all in one place.
          </p>
        </div>

        <div className={styles.footerCol}>
          <span className={styles.footerColTitle}>Explore</span>
          <Link to="/app" className={styles.footerLink}>Book a pitch</Link>
          <Link to="/discover" className={styles.footerLink}>Find a team</Link>
          <Link to="/discover?mode=matches" className={styles.footerLink}>Find a match</Link>
          <Link to="/team/create" className={styles.footerLink}>Create a team</Link>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} MedaPlus. All rights reserved.</span>
        <span className={styles.footerBottomNote}>Built for pitches, teams, and matches across Ethiopia.</span>
      </div>
    </footer>
  );
}