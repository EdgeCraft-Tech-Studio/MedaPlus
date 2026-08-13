import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/Discover.module.css";
import { SearchIcon, MapPinIcon } from "./Icons";
import { mockPitches, mockPublicTeams, mockAllTournaments } from "./mockData";
import { type TournamentStatus } from "./types";

type Tab = "pitches" | "teams" | "tournaments";

const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  registration_open: "Registration open", upcoming: "Upcoming", ongoing: "Ongoing", completed: "Completed",
};

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>("pitches");
  const [query, setQuery] = useState("");
  const [requestedIds, setRequestedIds] = useState<string[]>([]);

  async function handleRequestJoin(teamId: string) {
    setRequestedIds((ids) => [...ids, teamId]);
    // TODO: replace with the real API call, e.g. await sendJoinRequest(teamId);
    console.log("TODO: send join request", teamId);
  }

  const filteredPitches = mockPitches.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const filteredTeams = mockPublicTeams.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));
  const filteredTournaments = mockAllTournaments.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>Explore</span>
      <h1 className={styles.title}>Discover</h1>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === "pitches" ? styles.tabActive : ""}`} onClick={() => setTab("pitches")}>Find pitch</button>
        <button className={`${styles.tab} ${tab === "teams" ? styles.tabActive : ""}`} onClick={() => setTab("teams")}>Find teams</button>
        <button className={`${styles.tab} ${tab === "tournaments" ? styles.tabActive : ""}`} onClick={() => setTab("tournaments")}>Tournaments</button>
      </div>

      <div className={styles.searchBox}>
        <SearchIcon width={16} height={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab === "pitches" ? "pitches" : tab}...`} />
      </div>

      {tab === "pitches" && (
        <div className={styles.grid}>
          {filteredPitches.length === 0 ? (
            <div className={styles.empty}>No pitches match "{query}".</div>
          ) : filteredPitches.map((p) => (
            <div key={p.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.logo}><MapPinIcon width={18} height={18} /></span>
                <span className={styles.pill} data-tone="grass">{p.rating.toFixed(1)} ★</span>
              </div>
              <div className={styles.name}>{p.name}</div>
              <div className={styles.meta}>{p.sport.join(", ")} · {p.location}</div>
              <div className={styles.rowBetween}>
                <span className={styles.priceRow}>{p.pricePerHourEtb} ETB/hr</span>
                <span className={styles.rating}>{p.nextAvailable}</span>
              </div>
              {/* TODO: link to the existing pitch booking flow, e.g. /app/pitches/:pitchId */}
              <button className={styles.actionBtn}>View availability</button>
            </div>
          ))}
        </div>
      )}

      {tab === "teams" && (
        <div className={styles.grid}>
          {filteredTeams.length === 0 ? (
            <div className={styles.empty}>No teams match "{query}".</div>
          ) : filteredTeams.map((t) => {
            const requested = requestedIds.includes(t.id) || t.alreadyRequested;
            return (
              <div key={t.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.logo}>
                    {t.logo ? <img src={t.logo} alt="" /> : t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <span className={styles.pill} data-tone="team">{t.skillLevel}</span>
                </div>
                <div className={styles.name}>{t.name}</div>
                <div className={styles.meta}>{t.sport} · {t.location}</div>
                <div className={styles.capBar}>
                  <div className={styles.capFill} style={{ width: `${Math.min((t.activeMembers / t.capacity) * 100, 100)}%` }} />
                </div>
                <button
                  className={`${styles.actionBtn} ${requested ? styles.actionBtnDisabled : ""}`}
                  onClick={() => !requested && handleRequestJoin(t.id)}
                  disabled={requested}
                >
                  {requested ? "Request sent" : "Request to join"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "tournaments" && (
        <div className={styles.grid}>
          {filteredTournaments.length === 0 ? (
            <div className={styles.empty}>No tournaments match "{query}".</div>
          ) : filteredTournaments.map((t) => (
            <Link key={t.id} to={`/discover/tournaments/${t.id}`} className={styles.card} style={{ textDecoration: "none", color: "inherit" }}>
              <div className={styles.cardTop}>
                <span className={styles.logo}>{t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <span className={styles.pill} data-tone="tournament">{TOURNAMENT_STATUS_LABEL[t.status]}</span>
              </div>
              <div className={styles.name}>{t.name}</div>
              <div className={styles.meta}>{t.sport} · {t.location}</div>
              <div className={styles.rowBetween}>
                <span className={styles.priceRow}>{t.teamsJoined}/{t.teamsMax} teams</span>
                <span className={styles.rating}>{new Date(t.startDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
