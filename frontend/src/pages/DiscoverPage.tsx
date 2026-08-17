import { useEffect, useMemo, useState } from "react";
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

function LocationIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h16M7 12h10M10 19h4" />
    </svg>
  );
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // map slug -> pending join-request id
  const [pendingRequests, setPendingRequests] = useState<Map<string, string>>(new Map());
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const [skillFilter, setSkillFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState("");
  const [sportFilter, setSportFilter] = useState("");

  const [nearMeCity, setNearMeCity] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

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

  async function handleNearMe() {
    if (nearMeCity) {
      setNearMeCity(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocateError(true);
      return;
    }
    setLocating(true);
    setLocateError(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          const city = data.city || data.locality || data.principalSubdivision;
          if (city) {
            setNearMeCity(city);
          } else {
            setLocateError(true);
          }
        } catch (err) {
          console.error("Reverse geocoding failed:", err);
          setLocateError(true);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocateError(true);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }

  
  const BASE_SPORTS = ["Football", "Basketball"];

const sportOptions = useMemo(() => {
  const fromTeams = teams.map((t) => t.sport).filter(Boolean);
  return Array.from(new Set([...BASE_SPORTS, ...fromTeams])).sort();
}, [teams]);


  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (skillFilter && t.skill_level !== skillFilter) return false;
      if (ageFilter && t.age_category !== ageFilter) return false;
      if (sportFilter && t.sport !== sportFilter) return false;
      if (nearMeCity) {
        const loc = `${t.area || ""} ${t.city || ""}`.toLowerCase();
        if (!loc.includes(nearMeCity.toLowerCase())) return false;
      }
      return true;
    });
  }, [teams, query, skillFilter, ageFilter, sportFilter, nearMeCity]);

  const activeFilterCount =
    (skillFilter ? 1 : 0) + (ageFilter ? 1 : 0) + (sportFilter ? 1 : 0) + (nearMeCity ? 1 : 0);

  function clearFilters() {
    setSkillFilter("");
    setAgeFilter("");
    setSportFilter("");
    setNearMeCity(null);
  }

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>Explore</span>
      <h1 className={styles.title}>Find a team</h1>

      <div className={styles.filterBar}>
        <div className={styles.searchField}>
          <SearchIcon width={16} height={16} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams..."
          />
          {query && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <XIcon width={10} height={10} />
            </button>
          )}
        </div>

        <div className={styles.pillDivider} />

        <button
          type="button"
          className={`${styles.nearBtn} ${nearMeCity ? styles.nearBtnActive : ""}`}
          onClick={handleNearMe}
          disabled={locating}
        >
          <LocationIcon width={14} height={14} />
          {locating ? "Locating…" : nearMeCity ? nearMeCity : "Near me"}
          {nearMeCity && (
            <span
              className={styles.nearBtnClear}
              onClick={(e) => {
                e.stopPropagation();
                setNearMeCity(null);
              }}
            >
              <XIcon width={9} height={9} />
            </span>
          )}
        </button>

        <div className={styles.pillDivider} />

        <div className={styles.selectField}>
          <select
            className={styles.select}
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            <option value="">Any sport</option>
            {sportOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className={styles.selectField}>
          <select
            className={styles.select}
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
          >
            <option value="">Any skill level</option>
            {Object.entries(SKILL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className={styles.selectField}>
          <select
            className={styles.select}
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value)}
          >
            <option value="">Any age group</option>
            {Object.entries(AGE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {activeFilterCount > 0 && (
          <>
            <div className={styles.pillDivider} />
            <button className={styles.clearBtn} onClick={clearFilters}>
              Clear
            </button>
          </>
        )}
      </div>

      {locateError && (
        <div className={styles.locateNote}>
          <FilterIcon width={13} height={13} />
          Couldn't detect your location — check location permissions and try again.
        </div>
      )}

      {!loading && !error && (
        <div className={styles.resultsCount}>
          {filteredTeams.length} {filteredTeams.length === 1 ? "team" : "teams"} found
        </div>
      )}

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.cardSkeleton} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.empty}>Couldn't load teams. Please try again shortly.</div>
      ) : filteredTeams.length === 0 ? (
        <div className={styles.empty}>
          {teams.length === 0
            ? "No public teams to join right now."
            : "No teams match your filters."}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredTeams.map((t) => {
            const isPending = pendingRequests.has(t.slug);
            const isBusy = busySlug === t.slug;
            const spotsLeft = Math.max(t.max_roster_size - t.active_member_count, 0);

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
                <div className={styles.metaRow}>
                  <LocationIcon width={12} height={12} className={styles.metaIcon} />
                  {t.sport} · {t.area || t.city}
                </div>
                <div className={styles.meta}>{AGE_LABEL[t.age_category] ?? t.age_category}</div>

                <div className={styles.capBar}>
                  <div
                    className={styles.capFill}
                    style={{ width: `${Math.min((t.active_member_count / t.max_roster_size) * 100, 100)}%` }}
                  />
                </div>
                <div className={styles.rowBetween}>
                  <span className={styles.capText}>{t.active_member_count}/{t.max_roster_size} members</span>
                  {t.is_full ? (
                    <span className={styles.fullBadge}>Full</span>
                  ) : (
                    <span className={styles.spotsBadge}>{spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left</span>
                  )}
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