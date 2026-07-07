import { Link } from "react-router-dom";
import styles from "./css/Auth.module.css";

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2z" />
      <path d="M12 3v5.2M4.5 8.5l3.5 2.7M19.5 8.5L16 11.2M6.3 18l1.6-4.8M17.7 18l-1.6-4.8" />
    </svg>
  );
}

type Props = {
  variant: "login" | "signup";
};

export default function AuthHeader({ variant }: Props) {
  const isLogin = variant === "login";

  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.brand}>
        <span className={styles.brandMark}>
          <BallIcon />
        </span>
        <span className={styles.brandName}>MedaPlus</span>
      </Link>

      <Link to={isLogin ? "/signup" : "/login"} className={styles.navLink}>
        <button className={styles.btnPrimaryNav}>
          {isLogin ? "Sign up" : "Login"}
        </button>
      </Link>
    </nav>
  );
}
