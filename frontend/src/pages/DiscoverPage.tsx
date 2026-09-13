import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styles from "./css/Discover.module.css";
import { SearchIcon } from "./Icons";
import {
  getPublicTeams, sendJoinRequest, getMyJoinRequests, cancelMyJoinRequest, getMyTeams,
  type PublicTeam, type MyTeam,
} from "../lib/team";
import { listMatches, type Match } from "../lib/match";
import { listPitches, type Pitch } from "../lib/pitches";

const SKILL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const AGE_LABEL: Record<string, string> = {
  open: "Open — no age limit",
  u18: "Under 18",
  u21: "Under 21",
  adult: "Adult",
  other: "Other",
};

/* ---------------- icons ---------------- */

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

function TeamsModeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.6 2.6-6 5.5-6s5.5 2.4 5.5 6" />
      <path d="M16 8.5a3 3 0 1 1 0-6" />
      <path d="M15 14.2c2.6.3 4.5 2.6 4.5 5.8" />
    </svg>
  );
}

function MatchModeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m5 5 14 14M19 5 5 19" />
      <path d="M5 5h4M5 5v4M19 5h-4M19 5v4M5 19h4M5 19v-4M19 19h-4M19 19v-4" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

function CashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** The little "person" glyph mobile apps use for their profile tab —
 *  reused here to mark anything about people/headcount: roster size,
 *  players still needed to join a match. */
function ProfileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

/** Real ball artwork (not a line icon) so football/basketball is
 *  identifiable at a glance, matching the assets already used in
 *  MatchesTab and MatchDetailPage. */
function SportBall({ sport, size = 20 }: { sport?: string; size?: number }) {
  const isBasketball = (sport || "").toUpperCase() === "BASKETBALL";
  const src = isBasketball ? "/basketball.png" : "/football.png";
  return <img src={src} alt="" width={size} height={size} />;
}

/* ---------------- helpers ---------------- */

function formatBirr(value: string | number | null | undefined) {
  const num = Number(value) || 0;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;
}

function formatWhen(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateLabel = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${startLabel} – ${endLabel}`;
}

function formatSince(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

type DiscoverMode = "teams" | "matches";

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<DiscoverMode>(
    searchParams.get("mode") === "matches" ? "matches" : "teams"
  );

  /* ---------- shared: location ---------- */
  const [nearMeCity, setNearMeCity] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  /* ---------- teams state ---------- */
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Map<string, string>>(new Map());
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState("");
  const [sportFilter, setSportFilter] = useState("");

  /* ---------- matches state ---------- */
  const [matchQuery, setMatchQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState(false);
  const [matchSportFilter, setMatchSportFilter] = useState<"" | "FOOTBALL" | "BASKETBALL">("");

  /* ---------- load teams ---------- */
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
        setTeamsError(true);
      } finally {
        setTeamsLoading(false);
      }
    }
    load();
  }, []);

  /* ---------- load matches lazily ---------- */
  useEffect(() => {
    if (mode !== "matches" || matchesLoaded) return;

    async function loadMatches() {
      try {
        setMatchesLoading(true);
        setMatchesError(false);
        const [m, p, mine] = await Promise.all([
          listMatches({ status: "open" }),
          listPitches().catch(() => []),
          getMyTeams().catch(() => []),
        ]);
        setMatches(m);
        setPitches(p);
        setMyTeams(mine);
        setMatchesLoaded(true);
      } catch (err) {
        console.error("Failed to load matches:", err);
        setMatchesError(true);
      } finally {
        setMatchesLoading(false);
      }
    }
    loadMatches();
  }, [mode, matchesLoaded]);

  /* ---------- teams actions ---------- */

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

  /* ---------- shared: near me ---------- */

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

  /* ---------- teams derived data ---------- */

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

  const activeTeamFilterCount =
    (skillFilter ? 1 : 0) + (ageFilter ? 1 : 0) + (sportFilter ? 1 : 0) + (nearMeCity ? 1 : 0);

  function clearTeamFilters() {
    setSkillFilter("");
    setAgeFilter("");
    setSportFilter("");
    setNearMeCity(null);
  }

  /* ---------- matches derived data ---------- */

  const pitchById = useMemo(() => {
    const map = new Map<string, Pitch>();
    pitches.forEach((p) => map.set(p.id, p));
    return map;
  }, [pitches]);

  // Every team the current user belongs to, any role — a match your own
  // team posted isn't something to "discover", whether you're the owner
  // who created it or just a member.
  const myTeamIds = useMemo(() => new Set(myTeams.map((t) => t.id)), [myTeams]);

  const filteredMatches = useMemo(() => {
    const q = matchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (myTeamIds.has(m.creator_team_id)) return false;

      const pitch = pitchById.get(m.pitch_id);
      if (q) {
        const haystack = `${pitch?.name || ""} ${pitch?.address || ""} ${m.creator_team_name || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (matchSportFilter && pitch?.sport_type !== matchSportFilter) return false;
      if (nearMeCity) {
        const loc = (pitch?.address || "").toLowerCase();
        if (!loc.includes(nearMeCity.toLowerCase())) return false;
      }
      if ((m.available_slots ?? 0) <= 0) return false;
      return true;
    });
  }, [matches, matchQuery, matchSportFilter, nearMeCity, pitchById, myTeamIds]);

  const activeMatchFilterCount = (matchSportFilter ? 1 : 0) + (nearMeCity ? 1 : 0);

  function clearMatchFilters() {
    setMatchSportFilter("");
    setNearMeCity(null);
  }

  const isTeams = mode === "teams";

  return (
    <div className={styles.page}>
      <span className={styles.eyebrow}>Explore</span>
      <h1 className={styles.title}>{isTeams ? "Find a team" : "Find a match"}</h1>

      {/* ---------------- mode toggle ---------------- */}
      <div className={styles.modeToggle}>
        <button
          type="button"
          className={`${styles.modeBtn} ${isTeams ? styles.modeBtnTeamsOn : ""}`}
          onClick={() => setMode("teams")}
        >
          <TeamsModeIcon width={16} height={16} />
          Find team
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${!isTeams ? styles.modeBtnMatchOn : ""}`}
          onClick={() => setMode("matches")}
        >
          <MatchModeIcon width={16} height={16} />
          Find match
        </button>
      </div>

      {isTeams ? (
        <>
          {/* ---------------- teams filter bar ---------------- */}
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
                <button type="button" className={styles.searchClear} onClick={() => setQuery("")} aria-label="Clear search">
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
                <span className={styles.nearBtnClear} onClick={(e) => { e.stopPropagation(); setNearMeCity(null); }}>
                  <XIcon width={9} height={9} />
                </span>
              )}
            </button>

            <div className={styles.pillDivider} />

            <div className={styles.selectField}>
              <select className={styles.select} value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
                <option value="">Any sport</option>
                {sportOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className={styles.selectField}>
              <select className={styles.select} value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
                <option value="">Any skill level</option>
                {Object.entries(SKILL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className={styles.selectField}>
              <select className={styles.select} value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)}>
                <option value="">Any age group</option>
                {Object.entries(AGE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {activeTeamFilterCount > 0 && (
              <>
                <div className={styles.pillDivider} />
                <button className={styles.clearBtn} onClick={clearTeamFilters}>Clear</button>
              </>
            )}
          </div>

          {locateError && (
            <div className={styles.locateNote}>
              <FilterIcon width={13} height={13} />
              Couldn't detect your location — check location permissions and try again.
            </div>
          )}

          {!teamsLoading && !teamsError && (
            <div className={styles.resultsCount}>
              {filteredTeams.length} {filteredTeams.length === 1 ? "team" : "teams"} found
            </div>
          )}

          {teamsLoading ? (
            <div className={styles.grid} aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className={styles.cardSkeleton} />)}
            </div>
          ) : teamsError ? (
            <div className={styles.empty}>Couldn't load teams. Please try again shortly.</div>
          ) : filteredTeams.length === 0 ? (
            <div className={styles.empty}>
              {teams.length === 0 ? "No public teams to join right now." : "No teams match your filters."}
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredTeams.map((t) => {
                const isPending = pendingRequests.has(t.slug);
                const isBusy = busySlug === t.slug;
                const spotsLeft = Math.max(t.max_roster_size - t.active_member_count, 0);
                const capacityPct = Math.min((t.active_member_count / t.max_roster_size) * 100, 100);

                return (
                  <div key={t.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={styles.logo}>
                        {t.logo ? <img src={t.logo} alt="" /> : t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </span>
                      <span className={styles.sportBadgeTeam}>
                        <SportBall sport={t.sport} size={16} />
                        {t.sport}
                      </span>
                    </div>

                    <div className={styles.name}>{t.name}</div>

                    <div className={styles.metaRow}>
                      <LocationIcon width={12} height={12} className={styles.metaIcon} />
                      {t.area ? `${t.area}, ${t.city}` : t.city || "Location not set"}
                    </div>

                    <div className={styles.tagRow}>
                      <span className={styles.pill} data-tone="team">
                        {t.skill_level ? SKILL_LABEL[t.skill_level] ?? t.skill_level : "Any skill level"}
                      </span>
                      <span className={styles.pill} data-tone="grass">
                        {(AGE_LABEL[t.age_category] ?? t.age_category) || "Open"}
                      </span>
                    </div>

                    <div className={styles.sinceRow}>On MedaPlus since {formatSince(t.created_at)}</div>

                    <div className={styles.capacityBlock}>
                      <div className={styles.capacityHead}>
                        <ProfileIcon width={13} height={13} />
                        {t.active_member_count}/{t.max_roster_size} players on roster
                      </div>
                      <div className={styles.capBar}>
                        <div className={styles.capFill} style={{ width: `${capacityPct}%` }} />
                      </div>
                      <div className={styles.rowBetween}>
                        <span className={styles.capText}>{capacityPct.toFixed(0)}% full</span>
                        {t.is_full ? (
                          <span className={styles.fullBadge}>Full</span>
                        ) : (
                          <span className={styles.spotsBadge}>{spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left</span>
                        )}
                      </div>
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
        </>
      ) : (
        <>
          {/* ---------------- matches filter bar ---------------- */}
          <div className={`${styles.filterBar} ${styles.filterBarMatch}`}>
            <div className={styles.searchField}>
              <SearchIcon width={16} height={16} />
              <input
                className={styles.searchInput}
                value={matchQuery}
                onChange={(e) => setMatchQuery(e.target.value)}
                placeholder="Search by pitch or team..."
              />
              {matchQuery && (
                <button type="button" className={styles.searchClear} onClick={() => setMatchQuery("")} aria-label="Clear search">
                  <XIcon width={10} height={10} />
                </button>
              )}
            </div>

            <div className={styles.pillDivider} />

            <button
              type="button"
              className={`${styles.nearBtn} ${nearMeCity ? styles.nearBtnActiveMatch : ""}`}
              onClick={handleNearMe}
              disabled={locating}
            >
              <LocationIcon width={14} height={14} />
              {locating ? "Locating…" : nearMeCity ? nearMeCity : "Near me"}
              {nearMeCity && (
                <span className={styles.nearBtnClear} onClick={(e) => { e.stopPropagation(); setNearMeCity(null); }}>
                  <XIcon width={9} height={9} />
                </span>
              )}
            </button>

            <div className={styles.pillDivider} />

            <div className={styles.selectField}>
              <select className={styles.select} value={matchSportFilter} onChange={(e) => setMatchSportFilter(e.target.value as any)}>
                <option value="">Any sport</option>
                <option value="FOOTBALL">Football</option>
                <option value="BASKETBALL">Basketball</option>
              </select>
            </div>

            {activeMatchFilterCount > 0 && (
              <>
                <div className={styles.pillDivider} />
                <button className={styles.clearBtn} onClick={clearMatchFilters}>Clear</button>
              </>
            )}
          </div>

          {locateError && (
            <div className={styles.locateNote}>
              <FilterIcon width={13} height={13} />
              Couldn't detect your location — check location permissions and try again.
            </div>
          )}

          {!matchesLoading && !matchesError && (
            <div className={styles.resultsCount}>
              {filteredMatches.length} {filteredMatches.length === 1 ? "match" : "matches"} found
            </div>
          )}

          {matchesLoading ? (
            <div className={styles.grid} aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className={styles.cardSkeleton} />)}
            </div>
          ) : matchesError ? (
            <div className={styles.empty}>Couldn't load matches. Please try again shortly.</div>
          ) : filteredMatches.length === 0 ? (
            <div className={styles.empty}>
              {matches.length === 0 ? "No open matches right now." : "No matches match your filters."}
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredMatches.map((m) => {
                const pitch = pitchById.get(m.pitch_id);
                const joinedPct = Math.min(((m.confirmed_participant_count || 0) / (m.slots_needed || 1)) * 100, 100);

                return (
                  <div
                    key={m.id}
                    className={styles.matchCard}
                    onClick={() => navigate(`/discover/matches/${m.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.matchCardTop}>
                      <span className={styles.logoMatch}>
                        <SportBall sport={pitch?.sport_type} size={22} />
                      </span>
                      <span className={styles.pill} data-tone="tournament">
                        <ProfileIcon width={11} height={11} />
                        Open slots
                      </span>
                    </div>

                    <div className={styles.matchTeamRow}>
                      <span className={styles.matchTeamBadge}>{m.creator_team_name}</span>
                    </div>

                    <div className={styles.name}>
                      {pitch ? pitch.name : "Pitch unavailable"}
                    </div>
                    <div className={styles.metaRow}>
                      <LocationIcon width={12} height={12} className={styles.metaIcon} />
                      {pitch?.address || "No address on file"}
                    </div>
                    <div className={styles.metaRow}>
                      <ClockIcon width={12} height={12} className={styles.metaIcon} />
                      {formatWhen(m.start_time, m.end_time)}
                    </div>

                    <div className={styles.capacityBlock}>
                      <div className={styles.capacityHead}>
                        <ProfileIcon width={13} height={13} />
                        {m.confirmed_participant_count}/{m.slots_needed} players joined
                      </div>
                      <div className={styles.capBar}>
                        <div className={styles.capFillMatch} style={{ width: `${joinedPct}%` }} />
                      </div>
                      <span className={styles.spotsBadgeMatch}>
                        {m.available_slots} spot{m.available_slots === 1 ? "" : "s"} still need players
                      </span>
                    </div>

                    <div className={styles.priceRowMatch}>
                      <CashIcon width={20} height={20} />
                      <span>{formatBirr(m.price_per_slot)}<small>to join</small></span>
                    </div>

                    <div className={styles.viewDetailRow}>
                      View match details
                      <ChevronIcon width={14} height={14} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}