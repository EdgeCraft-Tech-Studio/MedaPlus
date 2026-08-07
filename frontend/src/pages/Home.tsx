import { Link } from "react-router-dom";
import styles from "./css/Home.module.css";
import AppHeader from "./AppHeader";

/* ---------- icons ---------- */

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2z" />
      <path d="M12 3v5.2M4.5 8.5l3.5 2.7M19.5 8.5L16 11.2M6.3 18l1.6-4.8M17.7 18l-1.6-4.8" />
    </svg>
  );
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.8 14.8c2.4.3 4.1 2 4.7 5.2" />
    </svg>
  );
}

function VersusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="6" cy="12" r="4" />
      <circle cx="18" cy="12" r="4" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" strokeWidth="1.4" />
    </svg>
  );
}

function MapPinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

function TrophyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 4h10v5a5 5 0 01-10 0V4z" />
      <path d="M7 6H4a3 3 0 003 3M17 6h3a3 3 0 01-3 3" />
      <path d="M12 14v3M9 21h6M9.5 21c0-2 1-3 2.5-4 1.5 1 2.5 2 2.5 4" />
    </svg>
  );
}

function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

/* ---------- data ---------- */

const actions = [
  {
    key: "team",
    accent: "team",
    icon: UsersIcon,
    label: "Create team",
    to: "/team/create",
    title: "Create a team",
    text: "Set up your squad's page — name, colors, and a roster your players can join with a code.",
    bullets: ["Custom team name & badge", "Invite players by link or code", "Track your squad's match history"],
  },
  {
    key: "match",
    accent: "match",
    icon: VersusIcon,
    label: "Make match",
    to: "/match/create",
    title: "Make a match",
    text: "Set the date, format, and pitch, then send a challenge to another team or open it to anyone.",
    bullets: ["Pick a format: 5-a-side to 11-a-side", "Challenge a team or post it open", "Automatic reminders before kickoff"],
  },
  {
    key: "pitch",
    accent: "pitch",
    icon: MapPinIcon,
    label: "Find pitch",
    to: "/app",
    title: "Find a pitch",
    text: "Browse pitches near you, check live availability, and lock in your hours in a couple of taps.",
    bullets: ["Live slots — no back-and-forth", "Filter by price, size & surface", "Verified, owner-approved listings"],
  },
  {
    key: "tournament",
    accent: "tournament",
    icon: TrophyIcon,
    label: "Tournament",
    to: "/tournaments",
    title: "Tournament",
    text: "Join an open bracket with your team, or set up a tournament for your own league to run.",
    bullets: ["Auto-generated brackets", "Live standings & results", "Invite multiple teams at once"],
  },
];

const stats = [
  { label: "Your teams", value: "2" },
  { label: "Upcoming matches", value: "1" },
  { label: "Pitches booked", value: "6" },
];

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
      <AppHeader variant="logout" />

      <header className={styles.hero}>
        <div className={styles.heroGlow} />
        <span className={styles.eyebrow}>{getGreeting()}</span>
        <h1 className={styles.heroTitle}>
          Where are we <em>playing</em> today?
        </h1>
        <p className={styles.heroSubtitle}>Pick an action below to get started.</p>

        <div className={styles.statsRow}>
          {stats.map((s) => (
            <div key={s.label} className={styles.statItem}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.actionsSection}>
          <span className={styles.sectionEyebrow}>Quick actions</span>
          <div className={styles.actionsRow}>
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.key}
                  to={a.to}
                  className={styles.actionBtn}
                  data-accent={a.accent}
                  style={{ animationDelay: `${i * 0.09}s` }}
                >
                  <span className={styles.actionIconWrap}>
                    <Icon width={22} height={22} />
                  </span>
                  <span className={styles.actionLabel}>{a.label}</span>
                  <span className={styles.actionOpenPill}>
                    Open
                    <ArrowRightIcon width={13} height={13} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className={styles.detailsSection}>
          <span className={styles.sectionEyebrow}>What each one does</span>
          <div className={styles.detailsGrid}>
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <div
                  key={a.key}
                  className={styles.detailCard}
                  data-accent={a.accent}
                  style={{ animationDelay: `${0.3 + i * 0.09}s` }}
                >
                  <div className={styles.detailTop}>
                    <span className={styles.detailIconWrap}>
                      <Icon width={19} height={19} />
                    </span>
                    <span className={styles.detailTag}>{a.label}</span>
                  </div>

                  <h3 className={styles.detailTitle}>{a.title}</h3>
                  <p className={styles.detailText}>{a.text}</p>

                  <ul className={styles.detailBullets}>
                    {a.bullets.map((b) => (
                      <li key={b}>
                        <CheckIcon width={13} height={13} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to={a.to} className={styles.detailLink}>
                    Open {a.title.toLowerCase()}
                    <ArrowRightIcon width={14} height={14} />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <BallIcon width={14} height={14} />
          Meda Plus
        </div>
        <div>© {new Date().getFullYear()} Meda Plus. All rights reserved.</div>
      </footer>
    </div>
  );
}