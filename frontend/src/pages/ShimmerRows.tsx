// components/ShimmerRows.tsx
import styles from "./css/ShimmerRows.module.css";

interface Props {
  count?: number;
  height?: number;
}

export default function ShimmerRows({ count = 3, height = 60 }: Props) {
  return (
    <div className={styles.wrap}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.row} style={{ height }} />
      ))}
    </div>
  );
}