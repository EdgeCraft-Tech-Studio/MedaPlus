import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/Teams.module.css";
import { SearchIcon, PlusIcon, UsersIcon } from "./Icons";
import { mockTeams } from "./mockData";

export default function TeamsPage() {
  const [query, setQuery] = useState("");

  const filtered = mockTeams.filter((t) =>
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
          <Link to="/team/create" className={styles.btnPrimary}>
            <PlusIcon width={15} height={15} />
            Create team
          </Link>
        </div>
      </header>

      {mockTeams.length > 3 && (
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

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No teams match "{query}".</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.logo}>
                  {team.logo ? <img src={team.logo} alt="" /> : team.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className={styles.roleBadge} data-role={team.role}>
                  {team.role === "OWNER" ? "Owner" : team.role === "ADMIN" ? "Admin" : "Member"}
                </span>
              </div>
              <div className={styles.name}>{team.name}</div>
              <div className={styles.meta}>{team.sport} · {team.location}</div>
              <div className={styles.capRow}>
                <div className={styles.capBar}>
                  <div className={styles.capFill} style={{ width: `${Math.min((team.activeMembers / team.capacity) * 100, 100)}%` }} />
                </div>
                <span>{team.activeMembers}/{team.capacity} active players</span>
              </div>
            </Link>
          ))}

          <Link to="/team/create" className={`${styles.card} ${styles.cardAdd}`}>
            <UsersIcon width={22} height={22} />
            Create a new team
          </Link>
        </div>
      )}
    </div>
  );
}
