import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/Matches.module.css";
import { mockAllMatches } from "./mockData";
import { type MatchStage } from "./types";

const TABS: { key: MatchStage; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "ongoing", label: "Ongoing" },
  { key: "completed", label: "Completed" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return { day: d.toLocaleDateString(undefined, { day: "2-digit" }), month: d.toLocaleDateString(undefined, { month: "short" }) };
}

export default function MatchesPage() {
  const [stage, setStage] = useState<MatchStage>("upcoming");
  const matches = mockAllMatches.filter((m) => m.stage === stage);

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>Your matches</span>
      <h1 className={styles.title}>Matches</h1>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.key} className={`${styles.tab} ${stage === t.key ? styles.tabActive : ""}`} onClick={() => setStage(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className={styles.empty}>No {stage} matches.</div>
      ) : (
        <div className={styles.list}>
          {matches.map((m) => {
            const { day, month } = formatDate(m.date);
            return (
              <Link key={m.id} to={`/matches/${m.id}`} className={styles.row}>
                <div className={styles.dateBlock}>
                  <span className={styles.day}>{day}</span>
                  <span className={styles.month}>{month}</span>
                </div>
                <div className={styles.info}>
                  <div className={styles.rowTitle}>{m.teamName} — {m.opponentLabel}</div>
                  <div className={styles.rowMeta}>{m.pitchName} · {m.time}</div>
                </div>
                {m.stage === "upcoming" && (
                  <span className={styles.pill} data-status={m.bookingStatus}>
                    {m.bookingStatus === "confirmed" && "Confirmed"}
                    {m.bookingStatus === "pending_payment" && "Payment pending"}
                    {m.bookingStatus === "open" && "Open"}
                  </span>
                )}
                {m.stage === "completed" && m.result && (
                  <span className={styles.pill} data-status="confirmed">{m.result.teamScore}–{m.result.opponentScore}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
