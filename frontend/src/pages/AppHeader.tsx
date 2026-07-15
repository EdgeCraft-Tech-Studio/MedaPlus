import { useNavigate, Link } from "react-router-dom";
import { logout } from "../lib/auth";
import styles from "./css/AppHeader.module.css";

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2z" />
      <path d="M12 3v5.2M4.5 8.5l3.5 2.7M19.5 8.5L16 11.2M6.3 18l1.6-4.8M17.7 18l-1.6-4.8" />
    </svg>
  );
}

function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

type Props = {
  /** "logout" shows a logout button on the right. "none" shows nothing there. */
  variant?: "logout" | "none";
  /** Where the brand mark links to. Defaults to "/". */
  homeHref?: string;
};

export default function AppHeader({ variant = "none", homeHref = "/" }: Props) {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <nav className={styles.nav}>
      <Link to={homeHref} className={styles.brand}>
        <span className={styles.brandMark}>
          <BallIcon />
        </span>
        <span className={styles.brandName}>Meda Plus</span>
      </Link>

      {variant === "logout" && (
        <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
          <LogoutIcon />
          Logout
        </button>
      )}
    </nav>
  );
}
