import { useEffect, useState } from "react";
import styles from "./css/Discover.module.css";
import { SearchIcon } from "./Icons";
import {
  getPublicTeams, sendJoinRequest, getMyJoinRequests, cancelMyJoinRequest,
  type PublicTeam,
} from "../lib/team";

const SKILL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  competitive: "Competitive",
};

const AGE_LABEL: Record<string, string> = {
  open: "Open — no age limit",
  u18: "Under 18",
  u21: "Under 21",
  adult: "Adult",
  other: "Other",
};

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // ✅ map slug -> pending join-request id, instead of just a Set<slug>
  const [pendingRequests, setPendingRequests] = useState<Map<string, string>>(new Map());
  const [busySlug, setBusySlug] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [publicTeams, myRequests] = await Promise.all([
          getPublicTeams(),
          getMyJoinRequests().catch(() => []),
        ]);
        setTeams(publicTeams);

        const pending = new Map<string, string>();
        myRequests.forEach((r) => {
          if (r.status === "pending" && r.team_slug) {
            pending.set(r.team_slug, r.id);
          }
        });
        setPendingRequests(pending);
      } catch (err) {
        console.error("Failed to load public teams:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRequestJoin(slug: string) {
    setBusySlug(slug);
    try {
      const result = await sendJoinRequest(slug, "");
      setPendingRequests((prev) => new Map(prev).set(slug, result.id));
    } catch (err) {
      console.error("Failed to send join request:", err);
    } finally {
      setBusySlug(null);
    }
  }

  async function handleCancelRequest(slug: string) {
    const requestId = pendingRequests.get(slug);
    if (!requestId) return;
    setBusySlug(slug);
    try {
      await cancelMyJoinRequest(requestId);
      setPendingRequests((prev) => {
        const next = new Map(prev);
        next.delete(slug);
        return next;
      });
    } catch (err) {
      console.error("Failed to cancel join request:", err);
    } finally {
      setBusySlug(null);
    }
  }

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>Explore</span>
      <h1 className={styles.title}>Find a team</h1>

      <div className={styles.searchBox}>
        <SearchIcon width={16} height={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams..." />
      </div>

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.card} style={{ opacity: 0.5 }} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.empty}>Couldn't load teams. Please try again shortly.</div>
      ) : filteredTeams.length === 0 ? (
        <div className={styles.empty}>
          {teams.length === 0 ? "No public teams to join right now." : `No teams match "${query}".`}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredTeams.map((t) => {
            const isPending = pendingRequests.has(t.slug);
            const isBusy = busySlug === t.slug;
            return (
              <div key={t.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.logo}>
                    {t.logo ? <img src={t.logo} alt="" /> : t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <span className={styles.pill} data-tone="team">
                    {t.skill_level ? SKILL_LABEL[t.skill_level] ?? t.skill_level : "Any skill level"}
                  </span>
                </div>
                <div className={styles.name}>{t.name}</div>
                <div className={styles.meta}>{t.sport} · {t.area || t.city}</div>
                <div className={styles.meta}>{AGE_LABEL[t.age_category] ?? t.age_category}</div>
                <div className={styles.capBar}>
                  <div
                    className={styles.capFill}
                    style={{ width: `${Math.min((t.active_member_count / t.max_roster_size) * 100, 100)}%` }}
                  />
                </div>
                <div className={styles.rowBetween}>
                  <span>{t.active_member_count}/{t.max_roster_size} members</span>
                  {t.is_full && <span style={{ color: "var(--danger)" }}>Full</span>}
                </div>

                {isPending ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDisabled}`} disabled style={{ flex: 1 }}>
                      Request sent
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleCancelRequest(t.slug)}
                      disabled={isBusy}
                      style={{ flex: 1, background: "var(--danger)" }}
                    >
                      {isBusy ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                ) : (
                  <button
                    className={`${styles.actionBtn} ${t.is_full ? styles.actionBtnDisabled : ""}`}
                    onClick={() => !t.is_full && handleRequestJoin(t.slug)}
                    disabled={isBusy || t.is_full}
                  >
                    {isBusy ? "Sending…" : t.is_full ? "Team full" : "Request to join"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}