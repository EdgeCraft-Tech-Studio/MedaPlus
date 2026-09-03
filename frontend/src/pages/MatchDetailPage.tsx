import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import { getMatch, joinMatch, acceptChallenge, type Match } from "../lib/match";
import { getPitchDetail, type Pitch } from "../lib/pitches";
import { getMyTeams, type MyTeam } from "../lib/team";
import styles from "./css/MatchDetailPage.module.css";

/* ---------------- icons ---------------- */

type IconName =
  | "arrowLeft" | "pin" | "clock" | "cash" | "users" | "swords"
  | "shirt" | "droplet" | "car" | "bulb" | "imageOff" | "check" | "calendar" | "shield";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrowLeft: (
      <>
        <path d="M19 12H5" />
        <path d="m11 6-6 6 6 6" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 16 14" />
      </>
    ),
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c0-3.6 2.6-6 5.5-6s5.5 2.4 5.5 6" />
        <path d="M16 8.5a3 3 0 1 1 0-6" />
        <path d="M15 14.2c2.6.3 4.5 2.6 4.5 5.8" />
      </>
    ),
    swords: (
      <>
        <path d="m5 5 14 14M19 5 5 19" />
        <path d="M5 5h4M5 5v4M19 5h-4M19 5v4M5 19h4M5 19v-4M19 19h-4M19 19v-4" />
      </>
    ),
    shirt: <path d="M8 3 4 6v4l2-1v11h12V9l2 1V6l-4-3-2 2h-4L8 3z" />,
    droplet: <path d="M12 2s6 7.5 6 12a6 6 0 0 1-12 0c0-4.5 6-12 6-12z" />,
    car: (
      <>
        <path d="M3 13l1.2-3.6A2 2 0 0 1 6.1 8h11.8a2 2 0 0 1 1.9 1.4L21 13v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <circle cx="7" cy="17" r="1.4" />
        <circle cx="17" cy="17" r="1.4" />
      </>
    ),
    bulb: (
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
    ),
    imageOff: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.4" />
        <path d="M21 15l-5-5L5 21" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    calendar: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18" />
        <path d="M8 3v3M16 3v3" />
      </>
    ),
    shield: (
      <path d="M12 3.5 19 6v5.5c0 4.2-2.7 7.5-7 9-4.3-1.5-7-4.8-7-9V6l7-2.5z" />
    ),
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function FootballIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8 12 7.2z" fill="currentColor" stroke="none" />
      <path d="M12 3v4.2M12 20.8V16.8M4.5 8.3l3.9 1.5M19.5 8.3l-3.9 1.5M4.5 15.7l3.9-1.5M19.5 15.7l-3.9-1.5" />
    </svg>
  );
}

function BasketballIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
      <path d="M5.6 5.6c2.9 3 2.9 9.8 0 12.8M18.4 5.6c-2.9 3-2.9 9.8 0 12.8" />
    </svg>
  );
}

/* ---------------- helpers ---------------- */

function formatBirr(value: string | number | null | undefined) {
  const num = Number(value) || 0;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;
}

/** Time info anchored to Addis Ababa's own clock, not the visitor's device timezone —
 *  matches, players, and pitches all live in Ethiopia, so the match's local time
 *  should never silently shift for someone browsing from abroad. */
function addisTimeInfo(iso: string) {
  const d = new Date(iso);
  const tz = "Africa/Addis_Ababa";

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d));
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);

  let dayPartEn = "Night";
  let dayPartAm = "ሌሊት";
  if (hour >= 5 && hour < 12) { dayPartEn = "Morning"; dayPartAm = "ጠዋት"; }
  else if (hour >= 12 && hour < 17) { dayPartEn = "Afternoon"; dayPartAm = "ከሰዓት በኋላ"; }
  else if (hour >= 17 && hour < 21) { dayPartEn = "Evening"; dayPartAm = "ማታ"; }

  return { timeLabel, dateLabel, dayPartEn, dayPartAm };
}

function durationLabel(startIso: string, endIso: string) {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins % 60 === 0) return `${mins / 60} hour${mins === 60 ? "" : "s"}`;
  return `${(mins / 60).toFixed(1)} hours`;
}

// Same marker artwork as the match-creation map in MatchesTab — a real football
// or basketball rendered inside a pin, so the sport is identifiable at a glance.
function buildBallDivIcon(sport: "FOOTBALL" | "BASKETBALL") {
  const isBasketball = sport === "BASKETBALL";
  const pinColor = isBasketball ? "#c9942a" : "#3fae7f";

  const ballGlyph = isBasketball
    ? `<path d="M12 3v18M3 12h18" stroke="${pinColor}" stroke-width="1.6" fill="none"/>
       <path d="M5.8 5.8c2.7 2.9 2.7 9.5 0 12.4M18.2 5.8c-2.7 2.9-2.7 9.5 0 12.4" stroke="${pinColor}" stroke-width="1.4" fill="none"/>
       <circle cx="12" cy="12" r="9" stroke="${pinColor}" stroke-width="1.6" fill="none"/>`
    : `<circle cx="12" cy="12" r="9" stroke="${pinColor}" stroke-width="1.6" fill="none"/>
       <path d="M12 7.5 14.9 9.6l-1.1 3.4h-3.6L9.1 9.6 12 7.5z" fill="${pinColor}"/>
       <path d="M12 3v4.5M12 20.5V17M4.7 8.3l3.4 1.3M19.3 8.3l-3.4 1.3M4.7 15.7l3.4-1.3M19.3 15.7l-3.4-1.3" stroke="${pinColor}" stroke-width="1.3"/>`;

  const w = 42;
  const h = 52;

  const html = `
    <div class="ball-marker ball-marker-selected">
      <svg width="${w}" height="${h}" viewBox="0 0 30 37" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 1C7.8 1 2 6.6 2 13.4c0 9 13 22 13 22s13-13 13-22C28 6.6 22.2 1 15 1z"
          fill="${pinColor}" stroke="#ffffff" stroke-width="1.8"/>
        <circle cx="15" cy="13.4" r="9.3" fill="#ffffff"/>
        <g transform="translate(3,1.4)">${ballGlyph}</g>
      </svg>
    </div>`;

  return L.divIcon({
    html,
    className: "match-pitch-marker",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
  });
}

const RULES: string[] = [
  "Arrive at least 10 minutes before kickoff — late arrivals can lose their reserved slot to someone else.",
  "Payment for your slot (or your team's share) confirms your place. Unpaid reservations may be released.",
  "Cancelling less than 24 hours before the match may forfeit your payment — check the match organizer's own policy before booking.",
  "Wear footwear appropriate for the pitch surface. Studs may not be allowed on all surfaces — confirm with the venue.",
  "Respect the pitch, opposing players, and venue staff. Repeated reports of unsporting conduct can result in removal from future matches.",
  "MedaPlus connects teams, players, and pitches — disputes about a specific match are between its organizer and participants, not the platform.",
];

/* ---------------- page ---------------- */

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [match, setMatch] = useState<Match | null>(null);
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pickingTeam, setPickingTeam] = useState(false);
  const [banner, setBanner] = useState("");

  async function load() {
    if (!id) return;
    try {
      setLoading(true);
      setError(false);
      const m = await getMatch(id);
      setMatch(m);
      const [p, teams] = await Promise.all([
        getPitchDetail(m.pitch_id).then((d) => d.pitch).catch(() => null),
        getMyTeams().catch(() => []),
      ]);
      setPitch(p);
      setMyTeams(teams);
      setActivePhoto(0);
    } catch (err) {
      console.error("Failed to load match:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const eligibleTeams = useMemo(() => {
    if (!match) return [];
    return myTeams.filter((t) => (t.role === "owner" || t.role === "admin") && t.id !== match.creator_team_id);
  }, [myTeams, match]);

  async function handleJoin() {
    if (!match) return;
    setBusy(true);
    setBanner("");
    try {
      await joinMatch(match.id);
      setBanner("You're in — see you on the pitch!");
      await load();
    } catch (err: any) {
      setBanner(err?.response?.data?.detail || "Couldn't join this match. It may already be full.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(teamId: string) {
    if (!match) return;
    setBusy(true);
    setBanner("");
    try {
      await acceptChallenge(match.id, teamId);
      setBanner("Challenge accepted — match confirmed!");
      setPickingTeam(false);
      await load();
    } catch (err: any) {
      setBanner(err?.response?.data?.detail || "Couldn't accept this challenge.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonBlock} />
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <Icon name="arrowLeft" size={16} />
            Back
          </button>
          <div className={styles.emptyState}>Couldn't load this match. It may have been cancelled.</div>
        </div>
      </div>
    );
  }

  const isOpenSlots = match.match_type === "open_slots";
  const startInfo = addisTimeInfo(match.start_time);
  const endInfo = addisTimeInfo(match.end_time);
  const photos = pitch?.images && pitch.images.length > 0 ? pitch.images : [];
  const sport = pitch?.sport_type;
  const SportIcon = sport === "BASKETBALL" ? BasketballIcon : FootballIcon;
  const isJoinable = match.status === "open";
  const canAcceptHere = !isOpenSlots && isJoinable && !match.opponent_team_id;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" size={16} />
          Back to matches
        </button>

        {banner && <div className={styles.banner}>{banner}</div>}

        <div className={styles.layout}>
          {/* ---------------- left: match info ---------------- */}
          <div className={styles.infoCol}>
            <div className={styles.badgeRow}>
              <span className={`${styles.typePill} ${isOpenSlots ? styles.typePillOpen : styles.typePillTeam}`}>
                <Icon name={isOpenSlots ? "users" : "swords"} size={13} />
                {isOpenSlots ? "Open slots" : "Team vs team"}
              </span>
              <span className={`${styles.statusPill} ${styles[`status_${match.status}`]}`}>
                {match.status[0].toUpperCase() + match.status.slice(1)}
              </span>
            </div>

            <h1 className={styles.pitchTitle}>{pitch ? pitch.name : "Pitch details unavailable"}</h1>
            {pitch && (
              <div className={styles.pitchAddress}>
                <Icon name="pin" size={14} />
                {pitch.address || "No address on file"}
              </div>
            )}

            {/* ---------- time card ---------- */}
            <div className={styles.timeCard}>
              <div className={styles.timeCardHead}>
                <Icon name="calendar" size={16} />
                {startInfo.dateLabel}
              </div>
              <div className={styles.timeRow}>
                <div className={styles.timeBlock}>
                  <div className={styles.timeBlockValue}>{startInfo.timeLabel}</div>
                  <div className={styles.timeBlockLabel}>
                    Kickoff · {startInfo.dayPartEn} <span className={styles.amharic}>({startInfo.dayPartAm})</span>
                  </div>
                </div>
                <div className={styles.timeArrow}>→</div>
                <div className={styles.timeBlock}>
                  <div className={styles.timeBlockValue}>{endInfo.timeLabel}</div>
                  <div className={styles.timeBlockLabel}>
                    Ends · {endInfo.dayPartEn} <span className={styles.amharic}>({endInfo.dayPartAm})</span>
                  </div>
                </div>
                <div className={styles.durationChip}>{durationLabel(match.start_time, match.end_time)}</div>
              </div>
              <div className={styles.timeCardFoot}>All times shown in Addis Ababa local time (EAT).</div>
            </div>

            {/* ---------- teams / slots ---------- */}
            {isOpenSlots ? (
              <div className={styles.detailCard}>
                <div className={styles.detailCardHead}>
                  <Icon name="users" size={16} />
                  Open slots
                </div>
                <div className={styles.slotsBarWrap}>
                  <div className={styles.slotsBar}>
                    <div
                      className={styles.slotsBarFill}
                      style={{ width: `${Math.min(((match.confirmed_participant_count || 0) / (match.slots_needed || 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <div className={styles.slotsBarText}>
                    {match.confirmed_participant_count}/{match.slots_needed} players joined
                    {" · "}
                    <b>{match.available_slots} spot{match.available_slots === 1 ? "" : "s"} left</b>
                  </div>
                </div>
                <div className={styles.priceLine}>
                  <Icon name="cash" size={15} />
                  <b>{formatBirr(match.price_per_slot)}</b> per player to join
                </div>
              </div>
            ) : (
              <div className={styles.detailCard}>
                <div className={styles.detailCardHead}>
                  <Icon name="swords" size={16} />
                  Challenge
                </div>
                <div className={styles.vsRow}>
                  <div className={styles.vsTeam}>
                    <span className={styles.vsTeamAvatar}>{match.creator_team_name?.[0]?.toUpperCase() || "?"}</span>
                    {match.creator_team_name}
                  </div>
                  <span className={styles.vsLabel}>vs</span>
                  <div className={styles.vsTeam}>
                    {match.opponent_team_name ? (
                      <>
                        <span className={styles.vsTeamAvatar}>{match.opponent_team_name[0]?.toUpperCase()}</span>
                        {match.opponent_team_name}
                      </>
                    ) : (
                      <span className={styles.vsOpen}>Open challenge — no opponent yet</span>
                    )}
                  </div>
                </div>
                <div className={styles.priceLine}>
                  <Icon name="cash" size={15} />
                  <b>{formatBirr(match.total_price)}</b> total pitch cost · <b>{formatBirr(match.price_per_team)}</b> per team
                </div>
              </div>
            )}

            {match.description && (
              <div className={styles.detailCard}>
                <div className={styles.detailCardHead}>
                  <Icon name="shield" size={16} />
                  Notes from the organizer
                </div>
                <p className={styles.notesText}>{match.description}</p>
              </div>
            )}

            {/* ---------- rules ---------- */}
            <div className={styles.detailCard}>
              <div className={styles.detailCardHead}>
                <Icon name="shield" size={16} />
                Rules &amp; policy
              </div>
              <ul className={styles.rulesList}>
                {RULES.map((r, i) => (
                  <li key={i}>
                    <Icon name="check" size={13} />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ---------- action ---------- */}
            <div className={styles.actionZone}>
              {isOpenSlots ? (
                !isJoinable ? (
                  <div className={styles.noteBox}>This match is no longer open to join.</div>
                ) : (match.available_slots ?? 0) <= 0 ? (
                  <div className={styles.noteBox}>All slots are filled for this match.</div>
                ) : (
                  <button className={styles.primaryBtn} onClick={handleJoin} disabled={busy}>
                    {busy ? "Joining…" : `Join match · ${formatBirr(match.price_per_slot)}`}
                  </button>
                )
              ) : canAcceptHere ? (
                pickingTeam ? (
                  <div className={styles.teamPicker}>
                    {eligibleTeams.length === 0 ? (
                      <div className={styles.noteBox}>You need to own or admin a team to accept this challenge.</div>
                    ) : (
                      eligibleTeams.map((t) => (
                        <button key={t.id} className={styles.teamPickerOption} onClick={() => handleAccept(t.id)} disabled={busy}>
                          {t.name}
                        </button>
                      ))
                    )}
                    <button className={styles.teamPickerCancel} onClick={() => setPickingTeam(false)}>Cancel</button>
                  </div>
                ) : eligibleTeams.length === 0 ? (
                  <div className={styles.noteBox}>You need to own or admin a team to accept this challenge.</div>
                ) : (
                  <button className={styles.primaryBtn} onClick={() => setPickingTeam(true)} disabled={busy}>
                    Accept challenge
                  </button>
                )
              ) : (
                <div className={styles.noteBox}>
                  {match.opponent_team_id ? "This challenge has already been accepted." : "This match is no longer open."}
                </div>
              )}
            </div>
          </div>

          {/* ---------------- right: pitch gallery + map ---------------- */}
          <div className={styles.mediaCol}>
            <div className={styles.gallery}>
              <div className={styles.galleryMain}>
                {photos.length > 0 ? (
                  <img src={photos[activePhoto]?.url} alt={pitch?.name || "Pitch"} />
                ) : (
                  <div className={styles.galleryEmpty}>
                    <Icon name="imageOff" size={30} />
                    No photos yet
                  </div>
                )}
                {sport && (
                  <span className={`${styles.sportBadge} ${sport === "BASKETBALL" ? styles.sportBadgeBball : styles.sportBadgeFball}`}>
                    <SportIcon width={13} height={13} />
                    {sport === "BASKETBALL" ? "Basketball" : "Football"}
                  </span>
                )}
              </div>
              {photos.length > 1 && (
                <div className={styles.galleryThumbs}>
                  {photos.map((img, i) => (
                    <button
                      key={img.id}
                      className={`${styles.galleryThumb} ${i === activePhoto ? styles.galleryThumbActive : ""}`}
                      onClick={() => setActivePhoto(i)}
                    >
                      <img src={img.url} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>

                        {pitch && pitch.latitude != null && pitch.longitude != null && (
              <div className={styles.mapCard}>
                <MapContainer
                  center={[pitch.latitude, pitch.longitude]}
                  zoom={15}
                  style={{ width: "100%", height: "100%" }}
                  scrollWheelZoom={false}
                >
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[pitch.latitude, pitch.longitude]} icon={buildBallDivIcon(pitch.sport_type)} />
                </MapContainer>
              </div>
            )}

            {pitch && (
              <div className={styles.pitchFacts}>
                <div className={styles.pitchFactsHead}>Pitch amenities</div>
                <div className={styles.factRow}>
                  <span className={`${styles.factChip} ${pitch.has_dressing_room ? styles.factChipOn : styles.factChipOff}`}>
                    <Icon name="shirt" size={12} />Dressing room
                  </span>
                  <span className={`${styles.factChip} ${pitch.has_showers ? styles.factChipOn : styles.factChipOff}`}>
                    <Icon name="droplet" size={12} />Showers
                  </span>
                  <span className={`${styles.factChip} ${pitch.has_parking ? styles.factChipOn : styles.factChipOff}`}>
                    <Icon name="car" size={12} />Parking
                  </span>
                  <span className={`${styles.factChip} ${pitch.has_lighting ? styles.factChipOn : styles.factChipOff}`}>
                    <Icon name="bulb" size={12} />Lighting
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}