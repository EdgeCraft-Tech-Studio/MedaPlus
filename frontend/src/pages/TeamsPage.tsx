import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/Teams.module.css";
import { SearchIcon, PlusIcon, UsersIcon } from "./Icons";
import { getMyTeams, type MyTeam } from "../lib/team";

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
        console.error("Failed to load teams:", err);
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

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Your teams</span>
          <h1 className={styles.heroTitle}>Teams</h1>
        </div>
        <div className={styles.heroActions}>
          <Link to="/discover/teams" className={styles.btnGhost}>
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
        <div className={styles.grid} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.card} style={{ opacity: 0.5 }} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.empty}>
          <p>Couldn't load your teams. Please try again shortly.</p>
        </div>
      ) : teams.length === 0 ? (
        <div className={styles.empty}>
          <p>You haven't joined a team yet.</p>
          <Link to="/team/create" className={styles.btnPrimary}>
            <PlusIcon width={15} height={15} />
            Create team
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No teams match "{query}".</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((team) => {
            const roleLabel =
              team.role === "owner" ? "Owner" : team.role === "admin" ? "Admin" : "Member";
            return (
              <Link key={team.id} to={`/teams/${team.slug}`} className={styles.card}>
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
                  <span className={styles.roleBadge} data-role={(team.role ?? "member").toUpperCase()}>
                    {roleLabel}
                  </span>
                </div>
                <div className={styles.name}>{team.name}</div>
                <div className={styles.meta}>{team.sport} · {team.area || team.city}</div>
                <div className={styles.capRow}>
                  <div className={styles.capBar}>
                    <div
                      className={styles.capFill}
                      style={{
                        width: `${Math.min(
                          (team.active_member_count / team.max_roster_size) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <span>{team.active_member_count}/{team.max_roster_size} active players</span>
                </div>
              </Link>
            );
          })}

          <Link to="/team/create" className={`${styles.card} ${styles.cardAdd}`}>
            <UsersIcon width={22} height={22} />
            Create a new team
          </Link>
        </div>
      )}
    </div>
  );
}