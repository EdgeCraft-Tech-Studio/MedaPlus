import { Link } from "react-router-dom";
import styles from "./css/Landing.module.css";

/* ---------- small inline icons (purely presentational) ---------- */

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2z" />
      <path d="M12 3v5.2M4.5 8.5l3.5 2.7M19.5 8.5L16 11.2M6.3 18l1.6-4.8M17.7 18l-1.6-4.8" />
    </svg>
  );
}

function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
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

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l7 3v5.4c0 4.6-3 8.4-7 9.6-4-1.2-7-5-7-9.6V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function MapIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

function ZapIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
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

function PitchLinesBackground() {
  return (
    <svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" fill="none" stroke="white" strokeWidth="1.5">
      <rect x="60" y="60" width="1080" height="480" rx="4" />
      <line x1="600" y1="60" x2="600" y2="540" />
      <circle cx="600" cy="300" r="90" />
      <circle cx="600" cy="300" r="3" fill="white" />
      <rect x="60" y="180" width="130" height="240" />
      <rect x="970" y="180" width="130" height="240" />
      <rect x="60" y="240" width="50" height="120" />
      <rect x="1050" y="240" width="50" height="120" />
    </svg>
  );
}

const steps = [
  {
    icon: SearchIcon,
    title: "Find a pitch",
    text: "Search by location, price, or amenities to find a pitch that fits your game.",
  },
  {
    icon: CalendarIcon,
    title: "Pick your hours",
    text: "Book by the hour, week, or month — see live availability before you commit.",
  },
  {
    icon: TrophyIcon,
    title: "Show up and play",
    text: "Get your booking code, arrive, and enjoy the game. No calls, no back-and-forth.",
  },
];

const features = [
  { icon: MapIcon, title: "Pitches near you", text: "Map and list views to find a match spot close by." },
  { icon: ZapIcon, title: "Instant booking", text: "Real-time slots — no waiting on a reply to confirm." },
  { icon: ShieldIcon, title: "Verified owners", text: "Every pitch is reviewed and approved before listing." },
  { icon: UsersIcon, title: "Built for teams", text: "Weekly and monthly plans made for regular squads." },
];

export default function Landing() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <BallIcon />
          </span>
          <span className={styles.brandName}>MedaPlus</span>
        </Link>

        <div className={styles.navActions}>
          <Link to="/login" className={styles.navLink}>
            <button className={styles.btnGhostNav}>Login</button>
          </Link>
          <Link to="/signup" className={styles.navLink}>
            <button className={styles.btnPrimaryNav}>Sign up</button>
          </Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.pitchLines}>
          <PitchLinesBackground />
        </div>
        <div className={styles.heroGlow} />

        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Now booking pitches across Addis Ababa
          </span>

          <h1 className={styles.heroTitle}>
            Book the pitch. <em>Bring the game.</em>
          </h1>

          <p className={styles.heroSubtitle}>
            MedaPlus makes it simple to find football pitches, lock in your hours,
            and get your team on the field — all in a couple of taps.
          </p>

          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.navLink}>
              <button className={styles.btnHeroPrimary}>
                Get started
                <ArrowRightIcon />
              </button>
            </Link>
            <Link to="/login" className={styles.navLink}>
              <button className={styles.btnHeroGhost}>I already have an account</button>
            </Link>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>120+</span>
              <span className={styles.statLabel}>Pitches listed</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>4.8/5</span>
              <span className={styles.statLabel}>Average rating</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>24/7</span>
              <span className={styles.statLabel}>Online booking</span>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>How it works</span>
          <h2 className={styles.sectionTitle}>From search to kickoff in three steps</h2>
          <p className={styles.sectionText}>
            No phone calls, no guessing whether a pitch is free — everything happens right here.
          </p>
        </div>

        <div className={styles.stepsGrid}>
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <div key={step.title} className={styles.stepCard}>
                <div className={styles.stepNumber}>Step {index + 1}</div>
                <div className={styles.stepIconWrap}>
                  <StepIcon />
                </div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepText}>{step.text}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.featuresSection}>
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>Why MedaPlus</span>
            <h2 className={styles.sectionTitle}>Everything you need to get on the field</h2>
          </div>

          <div className={styles.featuresGrid}>
            {features.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <div key={feature.title} className={styles.featureCard}>
                  <FeatureIcon className={styles.featureIcon} />
                  <div className={styles.featureTitle}>{feature.title}</div>
                  <div className={styles.featureText}>{feature.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className={styles.ctaBanner}>
        <div className={styles.ctaText}>
          <div className={styles.ctaTitle}>Ready to play?</div>
          <div className={styles.ctaSubtitle}>
            Create a free account and book your first pitch in minutes.
          </div>
        </div>
        <div className={styles.ctaActions}>
          <Link to="/signup" className={styles.navLink}>
            <button className={styles.btnHeroPrimary}>
              Sign up free
              <ArrowRightIcon />
            </button>
          </Link>
          <Link to="/login" className={styles.navLink}>
            <button className={styles.btnHeroGhost}>Login</button>
          </Link>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <BallIcon width={16} height={16} />
          Meda Plus
        </div>
        <div>© {new Date().getFullYear()} Meda Plus. All rights reserved.</div>
      </footer>
    </div>
  );
}
