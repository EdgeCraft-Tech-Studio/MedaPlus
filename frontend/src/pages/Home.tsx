import { Link } from "react-router-dom";
import styles from "./css/Home.module.css";
import {
  MapPinIcon, VersusIcon, SearchIcon, UsersIcon, PlusIcon, ChevronRightIcon, TrophyIcon,
} from "./Icons";
import { mockTeams, mockMatches, mockTournaments } from "./mockData";
import {  type TournamentStatus, type TeamRole } from "./types";

const quickActions = [
  { key: "pitch", to: "/app", accent: "pitch", icon: MapPinIcon, label: "Find pitch" },
  { key: "match", to: "/match/create", accent: "match", icon: VersusIcon, label: "Make match" },
  { key: "findteam", to: "/discover/teams", accent: "findteam", icon: SearchIcon, label: "Find team" },
  { key: "createteam", to: "/team/create", accent: "team", icon: UsersIcon, label: "Create team" },
];

const ROLE_LABEL: Record<TeamRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  registration_open: "Registration open",
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString(undefined, { day: "2-digit" }),
    month: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{getGreeting()}</span>
        <h1 className={styles.heroTitle}>Here's what's going on.</h1>
      </header>

      {/* ---------------- QUICK ACTIONS ---------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Quick actions</span>
        </div>
        <div className={styles.quickGrid}>
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.key} to={a.to} className={styles.quickBtn} data-accent={a.accent}>
                <span className={styles.quickIconWrap}><Icon width={20} height={20} /></span>
                <span className={styles.quickLabel}>{a.label}</span>
                <ChevronRightIcon className={styles.quickChevron} width={15} height={15} />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------------- MY TEAMS ---------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>My teams</span>
          <Link to="/teams" className={styles.seeAllLink}>See all <ChevronRightIcon width={13} height={13} /></Link>
        </div>

        {mockTeams.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            text="You haven't joined a team yet."
            ctaLabel="Create a team"
            ctaTo="/team/create"
          />
        ) : (
          <div className={styles.teamsRow}>
            {mockTeams.map((team) => (
              <Link key={team.id} to={`/teams/${team.id}`} className={styles.teamCard}>
                <div className={styles.teamCardTop}>
                  <span className={styles.teamLogo}>
                    {team.logo ? <img src={team.logo} alt="" /> : initials(team.name)}
                  </span>
                  <span className={styles.roleBadge} data-role={team.role}>{ROLE_LABEL[team.role]}</span>
                </div>
                <div className={styles.teamName}>{team.name}</div>
                <div className={styles.teamMeta}>{team.sport} · {team.location}</div>
                <div className={styles.teamCapacity}>
                  <div className={styles.capacityBar}>
                    <div
                      className={styles.capacityFill}
                      style={{ width: `${Math.min((team.activeMembers / team.capacity) * 100, 100)}%` }}
                    />
                  </div>
                  <span>{team.activeMembers}/{team.capacity} members</span>
                </div>
              </Link>
            ))}
            <Link to="/team/create" className={styles.teamCardAdd}>
              <PlusIcon width={20} height={20} />
              <span>Create team</span>
            </Link>
          </div>
        )}
      </section>

      {/* ---------------- UPCOMING MATCHES ---------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Upcoming matches</span>
          <Link to="/matches" className={styles.seeAllLink}>See all <ChevronRightIcon width={13} height={13} /></Link>
        </div>

        {mockMatches.length === 0 ? (
          <EmptyState
            icon={VersusIcon}
            text="No matches on your calendar yet."
            ctaLabel="Make a match"
            ctaTo="/match/create"
          />
        ) : (
          <div className={styles.matchList}>
            {mockMatches.map((m) => {
              const { day, month } = formatMatchDate(m.date);
              return (
                <Link key={m.id} to={`/matches/${m.id}`} className={styles.matchRow}>
                  <div className={styles.matchDateBlock}>
                    <span className={styles.matchDay}>{day}</span>
                    <span className={styles.matchMonth}>{month}</span>
                  </div>
                  <div className={styles.matchInfo}>
                    <div className={styles.matchTitle}>{m.opponentLabel}</div>
                    <div className={styles.matchMeta}>{m.pitchName} · {m.time}</div>
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

      {/* ---------------- TOURNAMENT PREVIEW ---------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Tournaments for you</span>
          <Link to="/discover/tournaments" className={styles.seeAllLink}>See all <ChevronRightIcon width={13} height={13} /></Link>
        </div>

        {mockTournaments.length === 0 ? (
          <EmptyState
            icon={TrophyIcon}
            text="No tournaments to show right now."
            ctaLabel="Browse tournaments"
            ctaTo="/discover/tournaments"
          />
        ) : (
          <div className={styles.tournamentRow}>
            {mockTournaments.map((t) => (
              <Link key={t.id} to={`/discover/tournaments/${t.id}`} className={styles.tournamentCard}>
                <div className={styles.tournamentTop}>
                  <span className={styles.tournamentIconWrap}><TrophyIcon width={18} height={18} /></span>
                  <span className={styles.statusPill} data-status={t.status}>{TOURNAMENT_STATUS_LABEL[t.status]}</span>
                </div>
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
  );
}

function EmptyState({
  icon: Icon, text, ctaLabel, ctaTo,
}: { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; text: string; ctaLabel: string; ctaTo: string }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIconWrap}><Icon width={22} height={22} /></span>
      <p>{text}</p>
      <Link to={ctaTo} className={styles.emptyCta}>{ctaLabel}</Link>
    </div>
  );
}
