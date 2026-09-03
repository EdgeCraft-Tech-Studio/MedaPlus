import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/Teams.module.css";
import { SearchIcon, PlusIcon, UsersIcon } from "./Icons";
import { getMyTeams, type MyTeam } from "../lib/team";

const SKELETON_COUNT = 6;

function CrownMark() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="currentColor" aria-hidden="true">
      <path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8zm2 12h14v2H5v-2z" />
    </svg>
  );
}

function TeamCardSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <div className={styles.skeletonTop}>
        <div className={`${styles.shimmer} ${styles.skeletonLogo}`} />
        <div className={`${styles.shimmer} ${styles.skeletonPill}`} />
      </div>
      <div className={`${styles.shimmer} ${styles.skeletonLine}`} style={{ width: "70%" }} />
      <div className={`${styles.shimmer} ${styles.skeletonLine}`} style={{ width: "45%", height: 10 }} />
      <div className={styles.skeletonCapRow}>
        <div className={`${styles.shimmer} ${styles.skeletonBar}`} />
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<MyTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadTeams() {
      try {
        const myTeams = await getMyTeams();
        setTeams(myTeams);
      } catch (err) {
        console.error("Failed to load team:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadTeams();
  }, []);

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  // Keep owned teams first so your own squads surface at the top of the grid.
  const sorted = [...filtered].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    return 0;
  });

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Your teams</span>
          <h1 className={styles.heroTitle}>Teams</h1>
        </div>
        <div className={styles.heroActions}>
          <Link to="/discover" className={styles.btnGhost}>
            <SearchIcon width={15} height={15} />
            Find teams
          </Link>
        </div>
      </header>

      {!loading && teams.length > 3 && (
        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <SearchIcon width={16} height={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your teams..."
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.grid} aria-busy="true" aria-label="Loading your teams">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <TeamCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} data-tone="danger">
            <UsersIcon width={28} height={28} />
          </div>
          <h2 className={styles.emptyTitle}>Couldn't load your teams</h2>
          <p className={styles.emptyText}>
            Something went wrong on our end. Refresh the page to try again.
          </p>
        </div>
      ) : teams.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <UsersIcon width={28} height={28} />
          </div>

          <h2 className={styles.emptyTitle}>Build your team</h2>

          <p className={styles.emptyText}>
            Create your own team or join an existing one to start playing.
          </p>

          <div className={styles.emptyActions}>
            <Link to="/team/create" className={styles.createTeamBtn}>
              <span className={styles.btnIcon}>
                <PlusIcon width={16} height={16} />
              </span>
              <span>
                <strong>Create a team</strong>
                <small>Start your own squad</small>
              </span>
            </Link>

            <Link to="/join" className={styles.joinTeamBtn}>
              <span className={styles.btnIcon}>
                <UsersIcon width={16} height={16} />
              </span>
              <span>
                <strong>Join a team</strong>
                <small>Find your next squad</small>
              </span>
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No teams match "{query}".</p>
        </div>
      ) : (
        <div className={`${styles.grid} ${styles.gridIn}`}>
          {sorted.map((team) => {
            const role = team.role ?? "member";
            const roleLabel = role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
            const isOwner = role === "owner";
            const pct = Math.min((team.active_member_count / team.max_roster_size) * 100, 100);

            return (
              <Link
                key={team.id}
                to={`/teams/${team.slug}`}
                className={`${styles.card} ${isOwner ? styles.cardOwner : ""}`}
              >
                {isOwner && (
                  <span className={styles.ownerRibbon}>
                    <CrownMark />
                    Your team
                  </span>
                )}
                <div className={styles.cardTop}>
                  <span className={styles.logo}>
                    {team.logo ? (
                      <img
                        src={team.logo}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.remove();
                        }}
                      />
                    ) : (
                      team.name.split(" ").map((w) => w[0]).slice(0, 2).join("")
                    )}
                  </span>
                  {!isOwner && (
                    <span className={styles.roleBadge} data-role={role.toUpperCase()}>
                      {roleLabel}
                    </span>
                  )}
                </div>
                <div className={styles.name}>{team.name}</div>
                <div className={styles.meta}>{team.sport} · {team.area || team.city}</div>
                <div className={styles.capRow}>
                  <div className={styles.capBar}>
                    <div className={styles.capFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span>{team.active_member_count}/{team.max_roster_size} active players</span>
                </div>
              </Link>
            );
          })}

          <Link to="/team/create" className={`${styles.card} ${styles.cardAdd}`}>
            <span className={styles.cardAddIcon}>
              <PlusIcon width={18} height={18} />
            </span>
            Create a new team
          </Link>
          <Link to="/join" className={`${styles.card} ${styles.cardAdd}`}>
            <span className={styles.cardAddIcon}>
              <UsersIcon width={18} height={18} />
            </span>
            Join a team
          </Link>
        </div>
      )}
    </div>
  );
}