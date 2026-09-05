import { useNavigate } from "react-router-dom";
import styles from "./css/PitchUnavailablePopup.module.css";

interface Props {
  pitchId: string;
  onClose: () => void;
}

function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l9.5 17H2.5L12 3z" />
      <path d="M12 10v4M12 17v.01" />
    </svg>
  );
}

export default function PitchUnavailablePopup({ pitchId, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="alertdialog" aria-modal="true">
        <div className={styles.iconWrap}>
          <AlertIcon className={styles.icon} />
        </div>
        <div className={styles.title}>Pitch no longer available</div>
        <div className={styles.subtitle}>
          Someone else booked this time slot while payment was pending. Pick a new time, or try
          a different pitch.
        </div>
        <div className={styles.footerRow}>
          <button
            className={styles.secondaryBtn}
            onClick={() => {
              onClose();
              navigate("/app");
            }}
          >
            Go to pitch
          </button>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              onClose();
              navigate(`/pitches/${pitchId}`);
            }}
          >
            Change time
          </button>
        </div>
      </div>
    </div>
  );
}