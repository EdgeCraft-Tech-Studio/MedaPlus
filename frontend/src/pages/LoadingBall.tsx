import styles from "./css/LoadingBall.module.css";

type LoadingBallProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  fullscreen?: boolean;
};

export default function LoadingBall({ label, size = "md", fullscreen = false }: LoadingBallProps) {
  const content = (
    <div className={`${styles.wrap} ${styles[size]}`}>
      <div className={styles.shimmerRing} />
      <svg className={styles.ball} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle className={styles.ballBase} cx="50" cy="50" r="46" />
        <g className={styles.ballPattern}>
          <line x1="50" y1="37" x2="50" y2="18" />
          <line x1="62.36" y1="45.98" x2="80.43" y2="40.11" />
          <line x1="57.64" y1="60.52" x2="68.82" y2="75.89" />
          <line x1="42.36" y1="60.52" x2="31.18" y2="75.89" />
          <line x1="37.64" y1="45.98" x2="19.57" y2="40.11" />
          <polygon points="50,37 62.36,45.98 57.64,60.52 42.36,60.52 37.64,45.98" />
          <polygon points="50,11 56.66,15.84 54.11,23.66 45.89,23.66 43.34,15.84" />
          <polygon points="80.43,33.11 87.09,37.95 84.54,45.77 76.32,45.77 73.77,37.95" />
          <polygon points="68.82,68.89 75.48,73.73 72.93,81.55 64.71,81.55 62.16,73.73" />
          <polygon points="31.18,68.89 37.84,73.73 35.29,81.55 27.07,81.55 24.52,73.73" />
          <polygon points="19.57,33.11 26.23,37.95 23.68,45.77 15.46,45.77 12.91,37.95" />
        </g>
      </svg>
      <div className={styles.shadow} />
      {label && <div className={styles.label}>{label}</div>}
    </div>
  );

  if (fullscreen) {
    return <div className={styles.overlay}>{content}</div>;
  }

  return content;
}
