import { useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import styles from "./css/Discover.module.css";
import { BackArrowIcon } from "./Icons";
import { mockAllTournaments } from "./mockData";
import { mockTeams } from "./mockData";
import { type TournamentStatus } from "./types";

const STATUS_LABEL: Record<TournamentStatus, string> = {
  registration_open: "Registration open", upcoming: "Upcoming", ongoing: "Ongoing", completed: "Completed",
};

export default function TournamentDetail() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const tournament = mockAllTournaments.find((t) => t.id === tournamentId);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  if (!tournament) return <Navigate to="/discover" replace />;

  // Team → Tournament registration is owned by the Team Dashboard's own
  // "Tournaments" tab, not by Discover. This button is a shortcut into that
  // flow, not the registration itself.
  async function handleRegister() {
    setRegistering(true);
    // TODO: replace with the real API call, e.g.
    // await registerTeamForTournament(mockTeams[0].id, tournament.id);
    await new Promise((r) => setTimeout(r, 800));
    console.log("TODO: register team for tournament", tournament!.id);
    setRegistering(false);
    setRegistered(true);
  }

  const canRegister = tournament.status === "registration_open" && !registered;

  return (
    <div className={styles.page}>
      <Link to="/discover" className={styles.backLink}>
        <BackArrowIcon width={13} height={13} />
        Discover
      </Link>

      <div className={styles.detailCard}>
        <div className={styles.cardTop}>
          <div className={styles.detailTitle}>{tournament.name}</div>
          <span className={styles.pill} data-tone="tournament">{STATUS_LABEL[tournament.status]}</span>
        </div>
        <div className={styles.detailMeta}>{tournament.sport} · {tournament.location} · Organized by {tournament.organizer}</div>
        <p className={styles.detailDesc}>{tournament.description}</p>

        <div className={styles.statGrid}>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Teams</div>
            <div className={styles.statValue}>{tournament.teamsJoined}/{tournament.teamsMax}</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Entry fee</div>
            <div className={styles.statValue}>{tournament.entryFeeEtb} ETB</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Registration closes</div>
            <div className={styles.statValue}>{new Date(tournament.registrationDeadline).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statLabel}>Starts</div>
            <div className={styles.statValue}>{new Date(tournament.startDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
          </div>
        </div>

        {canRegister && (
          <button className={styles.actionBtn} onClick={handleRegister} disabled={registering}>
            {registering ? "Registering..." : `Register ${mockTeams[0]?.name || "your team"}`}
          </button>
        )}
        {registered && (
          <button className={`${styles.actionBtn} ${styles.actionBtnDisabled}`} disabled>
            Registration submitted — pending organizer approval
          </button>
        )}
      </div>
    </div>
  );
}
