import { Link } from "react-router-dom";
import styles from "../pages/css/AppHeader.module.css";

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2z" />
      <path d="M12 3v5.2M4.5 8.5l3.5 2.7M19.5 8.5L16 11.2M6.3 18l1.6-4.8M17.7 18l-1.6-4.8" />
    </svg>
  );
}

type AppHeaderProps = {
  variant?: "logout";
  onLogout?: () => void;
};

export default function AppHeader({ variant = "logout", onLogout }: AppHeaderProps) {
  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.brand}>
        <span className={styles.brandMark}>
          <BallIcon />
        </span>
        <span className={styles.brandName}>MedaPlus</span>
      </Link>

      <div className={styles.navActions}>
        <span className={styles.verifiedPill}>
          <span className={styles.verifiedDot} />
          Verified
        </span>
        {variant === "logout" && (
          <button className={styles.btnGhostNav} onClick={onLogout}>
            Log out
          </button>
        )}
      </div>
    </nav>
  );
}