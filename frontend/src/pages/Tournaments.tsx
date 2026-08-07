import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/Tournaments.module.css";

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
function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
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
function BracketIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 6h4M4 12h4M4 18h4M8 6v3.5h4M8 12v0M8 18v-3.5h4M12 9.5v5h4M16 9.5h4v2M16 14.5h4v-2" />
    </svg>
  );
}
function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}
function UsersSmallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.8 14.8c2.4.3 4.1 2 4.7 5.2" />
    </svg>
  );
}
function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.6 2.6L16.2 9" />
    </svg>
  );
}
function MailIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7l7.5 6 7.5-6" />
    </svg>
  );
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.4" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- data ---------- */

const FEATURES = [
  { icon: BracketIcon, title: "Auto-generated brackets", text: "Enter your teams — the bracket seeds and builds itself." },
  { icon: ChartIcon, title: "Live standings", text: "Scores and rankings update as results come in, no manual tables." },
  { icon: UsersSmallIcon, title: "Multi-team invites", text: "Pull in several teams at once instead of inviting one by one." },
];

const PHASES = [
  { label: "Now", title: "Teams, chat & split payments", status: "live" as const },
  { label: "Next", title: "Matchmaking & game lobbies", status: "live" as const },
  { label: "Later", title: "Leagues & tournaments", status: "upcoming" as const },
];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function Tournaments() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const error = !email.trim()
    ? "Enter your email to get notified."
    : !isValidEmail(email)
      ? "That doesn't look like a valid email."
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // TODO: await notificationsApi.subscribe({ email, feature: "tournaments" })
      // — registers interest so we can notify when leagues/tournaments ship.
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSuccess(true);
    } catch (err) {
      setSubmitError("Couldn't save that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <BallIcon />
          </span>
          <span className={styles.brandName}>MedaPlus</span>
        </Link>
        <Link to="/home" className={styles.backLink}>
          <ArrowLeftIcon width={15} height={15} />
          Back home
        </Link>
      </nav>

      <header className={styles.hero}>
        <span className={styles.eyebrow}>Tournaments · on the roadmap</span>
        <h1 className={styles.heroTitle}>
          Brackets are <em>coming</em>
        </h1>
        <p className={styles.heroSubtitle}>
          Leagues and tournaments ship after teams, matchmaking and shared payments have proven
          out — so the foundation they run on is solid first.
        </p>
      </header>

      <main className={styles.main}>
        <section className={styles.bracketSection}>
          <div className={styles.bracketWrap}>
            <svg viewBox="0 0 640 320" className={styles.bracketSvg} aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <g key={`r1-${i}`} className={styles.bracketGroup} style={{ animationDelay: `${i * 0.12}s` }}>
                  <rect x={20} y={20 + i * 68} width={130} height={34} rx={8} className={styles.bracketNode} />
                  <path d={`M150 ${37 + i * 68} h30`} className={styles.bracketLine} />
                </g>
              ))}
              {[0, 1].map((i) => (
                <g key={`r2-${i}`} className={styles.bracketGroup} style={{ animationDelay: `${0.5 + i * 0.14}s` }}>
                  <path
                    d={`M180 ${37 + i * 136} v${34} M180 ${37 + i * 136} h30 M180 ${71 + i * 136} h30`}
                    className={styles.bracketLine}
                  />
                  <rect x={210} y={37 + i * 136 - 3} width={130} height={34} rx={8} className={styles.bracketNode} data-tier="2" />
                  <path d={`M340 ${54 + i * 136} h30`} className={styles.bracketLine} />
                </g>
              ))}
              <g className={styles.bracketGroup} style={{ animationDelay: "0.85s" }}>
                <path d="M370 54 v136 M370 54 h30 M370 190 h30" className={styles.bracketLine} />
                <rect x={400} y={105} width={130} height={34} rx={8} className={styles.bracketNode} data-tier="3" />
              </g>
              <g className={styles.bracketGroup} style={{ animationDelay: "1s" }}>
                <path d="M530 122 h30" className={styles.bracketLine} />
                <rect x={562} y={105} width={56} height={34} rx={17} className={styles.bracketTrophy} />
              </g>
            </svg>
            <div className={styles.bracketTrophyIcon}>
              <TrophyIcon width={20} height={20} />
            </div>
            <span className={styles.bracketBadge}>Preview — not live yet</span>
          </div>
        </section>

        <section className={styles.timeline}>
          {PHASES.map((p, i) => (
            <div key={p.label} className={styles.timelineStep} data-status={p.status}>
              <div className={styles.timelineDot} />
              {i < PHASES.length - 1 && <div className={styles.timelineConnector} />}
              <span className={styles.timelineLabel}>{p.label}</span>
              <span className={styles.timelineTitle}>{p.title}</span>
            </div>
          ))}
        </section>

        <section className={styles.featuresGrid}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className={styles.featureCard}>
                <span className={styles.featureIcon}>
                  <Icon width={18} height={18} />
                </span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureText}>{f.text}</p>
              </div>
            );
          })}
        </section>

        <section className={styles.notifySection}>
          {success ? (
            <div className={styles.notifySuccess}>
              <span className={styles.successIcon}>
                <CheckCircleIcon width={22} height={22} />
              </span>
              <div>
                <h3 className={styles.notifySuccessTitle}>You're on the list</h3>
                <p className={styles.notifySuccessText}>
                  We'll email {email} the moment tournaments open up.
                </p>
              </div>
            </div>
          ) : (
            <form className={styles.notifyCard} onSubmit={handleSubmit} noValidate>
              <div className={styles.notifyText}>
                <h3 className={styles.notifyTitle}>Want first access?</h3>
                <p className={styles.notifySubtitle}>
                  Get an email the moment leagues and tournaments open for your area.
                </p>
              </div>
              <div className={styles.notifyForm}>
                <div className={styles.notifyInputWrap} data-invalid={touched && !!error}>
                  <MailIcon width={16} height={16} className={styles.notifyInputIcon} />
                  <input
                    type="email"
                    className={styles.notifyInput}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched(true)}
                  />
                </div>
                <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                  {submitting ? (
                    <SpinnerIcon className={styles.spin} width={16} height={16} />
                  ) : (
                    "Notify me"
                  )}
                </button>
              </div>
              {touched && error && <span className={styles.errorText}>{error}</span>}
              {submitError && <span className={styles.errorText}>{submitError}</span>}
            </form>
          )}
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
