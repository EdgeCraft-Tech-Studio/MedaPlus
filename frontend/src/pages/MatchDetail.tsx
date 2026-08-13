import { useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import styles from "./css/Matches.module.css";
import { BackArrowIcon } from "./Icons";
import { mockAllMatches } from "./mockData";

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const match = mockAllMatches.find((m) => m.id === matchId);
  const [loading, setLoading] = useState(false);

  if (!match) return <Navigate to="/matches" replace />;

  const paidPct = Math.round((match.paidEtb / match.totalPriceEtb) * 100);

  async function handlePayShare() {
    setLoading(true);
    // TODO: replace with the real API call, e.g. await payMyShare(match.id);
    await new Promise((r) => setTimeout(r, 800));
    console.log("TODO: pay my share for match", match.id);
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <Link to="/matches" className={styles.backLink}>
        <BackArrowIcon width={13} height={13} />
        All matches
      </Link>

      <div className={styles.detailCard}>
        <div className={styles.detailHead}>
          <div className={styles.detailTitle}>{match.teamName} — {match.opponentLabel}</div>
          {match.stage === "upcoming" && (
            <span className={styles.pill} data-status={match.bookingStatus}>
              {match.bookingStatus === "confirmed" && "Confirmed"}
              {match.bookingStatus === "pending_payment" && "Payment pending"}
              {match.bookingStatus === "open" && "Open"}
            </span>
          )}
        </div>
        <div className={styles.detailMeta}>
          {match.sport} · {match.pitchName}, {match.pitchAddress} · {new Date(match.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} at {match.time} · {match.durationMinutes} min
        </div>

        {match.result ? (
          <div className={styles.resultBox}>
            <div>{match.result.teamScore} <span>{match.teamName}</span></div>
            —
            <div>{match.result.opponentScore} <span>Opponent</span></div>
          </div>
        ) : (
          <>
            <div className={styles.statGrid}>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Total price</div>
                <div className={styles.statValue}>{match.totalPriceEtb} ETB</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Per player</div>
                <div className={styles.statValue}>{(match.totalPriceEtb / match.shareCount).toFixed(0)} ETB</div>
              </div>
            </div>

            <div className={styles.paymentBar}>
              <div className={styles.paymentFill} style={{ width: `${paidPct}%` }} />
            </div>
            <div className={styles.paymentLabel}>
              {match.sharePaidCount}/{match.shareCount} shares paid · {match.paidEtb}/{match.totalPriceEtb} ETB secured
            </div>

            {match.bookingStatus !== "confirmed" && (
              <button className={styles.actionBtn} onClick={handlePayShare} disabled={loading}>
                {loading ? "Processing..." : "Pay my share"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
