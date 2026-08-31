import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me } from "../lib/auth";
import type { OwnerPitchStat, OwnerStats, Pitch } from "../lib/pitches";
import {
  createPitch,
  getOwnerStats,
  listPitches,
  updatePitch,
} from "../lib/pitches";
import AddButton from "../components/AddButton";
import PitchWizardModal from "../components/PitchWizardModal";
import ToastContainer, { showToast } from "./Toast";
import styles from "./css/Owner.module.css";

type IconName =
  | "clock"
  | "pin"
  | "tag"
  | "shirt"
  | "droplet"
  | "car"
  | "bulb"
  | "imageOff"
  | "verifiedCheck"
  | "search"
  | "x"
  | "cash"
  | "calendarCheck"
  | "checkCircle"
  | "hourglass"
  | "pencil"
  | "trophy"
  | "medal";

export function ApprovalIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      {...props}
    >
      <path
        d="M12 3.5 19 6v5.5c0 4.2-2.7 7.5-7 9-4.3-1.5-7-4.8-7-9V6l7-2.5z"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 12 2.2 2.2 4.8-5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 16 14" />
      </>
    ),
    pin: (
      <>
        <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
    tag: (
      <>
        <path d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <circle cx="7" cy="7" r="1.4" />
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
    verifiedCheck: (
      <path
        d="M9 16.2 4.8 12l-1.4 1.4L9 19 20.6 7.4l-1.4-1.4z"
        fill="currentColor"
        stroke="none"
      />
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>
    ),
    x: <path d="M18 6 6 18M6 6l12 12" />,
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 9.2v-.01M18 14.8v.01" strokeLinecap="round" />
      </>
    ),
    calendarCheck: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18" />
        <path d="M8 3v3M16 3v3" />
        <path d="m8.5 14.5 2 2 4-4" />
      </>
    ),
    checkCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.3 2.3L16 10" />
      </>
    ),
    hourglass: (
      <>
        <path d="M6 3h12M6 21h12" strokeLinecap="round" />
        <path d="M7 3c0 4 3.2 5.5 5 6.5-1.8 1-5 2.5-5 6.5M17 3c0 4-3.2 5.5-5 6.5 1.8 1 5 2.5 5 6.5" />
      </>
    ),
    pencil: <path d="m14.5 3.5 3 3L7 17l-4 1 1-4 10.5-10.5z" />,
    trophy: (
      <>
        <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
        <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" />
        <path d="M12 13v3" />
        <path d="M8.5 20h7l-1-3h-5l-1 3z" />
      </>
    ),
    medal: (
      <>
        <circle cx="12" cy="14.5" r="6" />
        <path d="M9 9 6.5 3M15 9l2.5-6" />
        <path
          d="m12 12 1.4 2.8-1.4.9-1.4-.9L12 12z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function formatBirr(value: string | number | undefined) {
  const num = Number(value) || 0;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;
}

function sportLabel(sport: Pitch["sport_type"]) {
  return sport === "BASKETBALL" ? "Basketball" : "Football";
}

const RANK_TONES = ["green", "gold", "bronze"] as const;
function rankTone(index: number) {
  return RANK_TONES[index] ?? "neutral";
}

function matchesSearch(p: Pitch, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    (p.address || "").toLowerCase().includes(q)
  );
}

function matchesPrice(p: Pitch, maxPrice: string) {
  if (!maxPrice.trim()) return true;
  const max = Number(maxPrice);
  if (Number.isNaN(max)) return true;

  const prices = [
    Number(p.hourly_price || 0),
    Number(p.weekly_price || 0),
    Number(p.monthly_price || 0),
  ].filter((v) => !Number.isNaN(v));

  return prices.some((price) => price <= max);
}

function matchesAmenities(
  p: Pitch,
  amenities: {
    dressing: boolean;
    showers: boolean;
    parking: boolean;
    lighting: boolean;
  }
) {
  if (amenities.dressing && !p.has_dressing_room) return false;
  if (amenities.showers && !p.has_showers) return false;
  if (amenities.parking && !p.has_parking) return false;
  if (amenities.lighting && !p.has_lighting) return false;
  return true;
}

function CardImage({ pitch }: { pitch: Pitch }) {
  return (
    <div className={styles.cardImage}>
      {pitch.cover_image_url ? (
        <img src={pitch.cover_image_url} alt={pitch.name} />
      ) : (
        <div className={styles.cardImagePlaceholder}>
          <Icon name="imageOff" size={30} />
          No photo yet
        </div>
      )}
      <span
        className={`${styles.sportTag} ${
          pitch.sport_type === "BASKETBALL"
            ? styles.sportTagBasketball
            : styles.sportTagFootball
        }`}
      >
        {sportLabel(pitch.sport_type)}
      </span>
      <span
        className={`${styles.imgStatusPill} ${
          pitch.is_approved ? styles.imgStatusApproved : styles.imgStatusPending
        }`}
      >
        {pitch.is_approved ? "Approved" : "Pending"}
      </span>
    </div>
  );
}

function PitchHours({ pitch }: { pitch: Pitch }) {
  const hours =
    pitch.opening_time_label && pitch.closing_time_label
      ? `${pitch.opening_time_label} - ${pitch.closing_time_label}`
      : `${pitch.opening_time} - ${pitch.closing_time}`;

  return (
    <div className={styles.metaGrid}>
      <div className={styles.metaItem}>
        <Icon name="clock" />
        {hours}
      </div>
      <div className={styles.metaItem}>
        <Icon name="tag" />
        Hourly <b>{pitch.hourly_price}</b>
      </div>
      <div className={styles.metaItem}>
        <Icon name="tag" />
        Weekly <b>{pitch.weekly_price}</b>
      </div>
      <div className={styles.metaItem}>
        <Icon name="tag" />
        Monthly <b>{pitch.monthly_price}</b>
      </div>
    </div>
  );
}

function AmenityTags({ pitch }: { pitch: Pitch }) {
  const items: Array<{ label: string; on: boolean; icon: IconName }> = [
    { label: "Dressing room", on: pitch.has_dressing_room, icon: "shirt" },
    { label: "Showers", on: pitch.has_showers, icon: "droplet" },
    { label: "Parking", on: pitch.has_parking, icon: "car" },
    { label: "Lighting", on: pitch.has_lighting, icon: "bulb" },
  ];

  return (
    <div className={styles.tagRow}>
      {items.map((item) => (
        <span
          key={item.label}
          className={`${styles.tag} ${item.on ? styles.tagYes : styles.tagNo}`}
        >
          <Icon name={item.icon} size={12} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ approved }: { approved: boolean }) {
  return (
    <div
      className={`${styles.statusBadge} ${
        approved ? styles.statusBadgeApproved : styles.statusBadgePending
      }`}
      title={approved ? "Account verified" : "Pending admin approval"}
    >
      <ApprovalIcon width={20} height={20} strokeWidth={approved ? 2 : 1.8} />
    </div>
  );
}

function PitchRevenueBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className={styles.revenueBar}>
      <div className={styles.revenueBarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Owner() {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [msg, setMsg] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editingPitch, setEditingPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [amenities, setAmenities] = useState({
    dressing: false,
    showers: false,
    parking: false,
    lighting: false,
  });

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (maxPrice.trim() ? 1 : 0) +
    Object.values(amenities).filter(Boolean).length;

  async function refresh() {
    try {
      setLoading(true);
      setMsg("");
      const u = await me();
      setUser(u);
      const [pitchData, statsData] = await Promise.all([
        listPitches(),
        getOwnerStats().catch(() => null),
      ]);
      setPitches(pitchData);
      setStats(statsData);
    } catch {
      setMsg("Failed to load owner data. Check API / token.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const isApproved = !!user?.is_approved;

  const statsByPitchId = useMemo(() => {
    const map = new Map<string, OwnerPitchStat>();
    (stats?.pitch_stats || []).forEach((s) => map.set(s.pitch_id, s));
    return map;
  }, [stats]);

  const maxPitchRevenue = useMemo(() => {
    return (stats?.pitch_stats || []).reduce(
      (max, s) => Math.max(max, Number(s.revenue) || 0),
      0
    );
  }, [stats]);

  const earners = useMemo(() => {
    return (stats?.pitch_stats || [])
      .filter((s) => Number(s.revenue) > 0)
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));
  }, [stats]);

  const pendingPitches = useMemo(() => {
    return (stats?.pitch_stats || []).filter((s) => !s.is_approved);
  }, [stats]);

  const todaySchedule = stats?.today_schedule || [];

  const filteredPitches = useMemo(() => {
    return pitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities)
    );
  }, [pitches, search, maxPrice, amenities]);

  function clearFilters() {
    setSearch("");
    setMaxPrice("");
    setAmenities({ dressing: false, showers: false, parking: false, lighting: false });
  }

  return (
    <div>
      <div className={styles.page}>
        <ToastContainer />
        <div className={styles.container}>
          {/* ---------- Hero scoreboard ---------- */}
          <div className={styles.hero}>
            <svg
              className={styles.heroPattern}
              viewBox="0 0 900 260"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line x1="450" y1="0" x2="450" y2="260" />
              <circle cx="450" cy="130" r="70" />
              <path d="M0 40 a40 40 0 0 0 40 40" />
              <path d="M900 180 a40 40 0 0 1 -40 40" />
            </svg>

            <div className={styles.heroTop}>
              <div>
                <div className={styles.heroGreeting}>
                  {user
                    ? `Welcome back, ${user.first_name || user.username}`
                    : "Welcome back"}
                </div>
                <div className={styles.heroSub}>
                  Here's how your pitches are doing
                </div>
              </div>

              <div className={styles.heroTopRight}>
                {user && <StatusBadge approved={isApproved} />}
                <div
                  className={`${styles.addWrap} ${
                    !isApproved ? styles.addWrapDisabled : ""
                  }`}
                >
                  <AddButton
                    onClick={() => setOpenAdd(true)}
                    title={isApproved ? "Add Pitch" : "Waiting for admin approval"}
                  />
                </div>
              </div>
            </div>

            <div className={styles.scoreboard}>
              <div className={styles.scoreboardPrimary}>
                <div className={styles.scoreboardIconWrap}>
                  <Icon name="cash" size={20} />
                </div>
                <div>
                  <div className={styles.scoreboardPrimaryValue}>
                    {loading ? "—" : formatBirr(stats?.total_revenue)}
                  </div>
                  <div className={styles.scoreboardPrimaryLabel}>
                    Total earnings
                  </div>
                </div>
              </div>

              <div className={styles.scoreboardDivider} />

              <div className={styles.scoreboardStats}>
                <div className={styles.scoreboardStat}>
                  <Icon name="calendarCheck" size={15} />
                  <div>
                    <div className={styles.scoreboardStatValue}>
                      {loading ? "—" : stats?.total_bookings ?? 0}
                    </div>
                    <div className={styles.scoreboardStatLabel}>Bookings</div>
                  </div>
                </div>
                <div className={styles.scoreboardStat}>
                  <Icon name="checkCircle" size={15} />
                  <div>
                    <div className={styles.scoreboardStatValue}>
                      {loading ? "—" : stats?.active_pitches ?? 0}
                    </div>
                    <div className={styles.scoreboardStatLabel}>
                      Active pitches
                    </div>
                  </div>
                </div>
                <div className={styles.scoreboardStat}>
                  <Icon name="hourglass" size={15} />
                  <div>
                    <div className={styles.scoreboardStatValueWarn}>
                      {loading ? "—" : stats?.pending_pitches ?? 0}
                    </div>
                    <div className={styles.scoreboardStatLabel}>
                      Pending approval
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Insight cards — sit below the hero, never overlapping it ---------- */}
          <div className={styles.insightRow}>
            <div className={styles.insightCard}>
              <div className={styles.insightHead}>
                <div className={`${styles.insightIconWrap} ${styles.insightIconBlue}`}>
                  <Icon name="calendarCheck" size={16} />
                </div>
                <div className={styles.insightTitle}>Today's schedule</div>
              </div>
              {loading ? (
                <div className={styles.insightEmpty}>Loading...</div>
              ) : todaySchedule.length === 0 ? (
                <div className={styles.insightEmpty}>No bookings today</div>
              ) : (
                <ul className={styles.insightScrollList}>
                  {todaySchedule.map((s, i) => (
                    <li key={`${s.pitch_id}-${i}`} className={styles.insightRowItem}>
                      <span className={styles.insightItemName}>{s.pitch_name}</span>
                      <span className={styles.insightItemWhen}>{s.time_label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.insightCard}>
              <div className={styles.insightHead}>
                <div className={`${styles.insightIconWrap} ${styles.insightIconRed}`}>
                  <Icon name="hourglass" size={16} />
                </div>
                <div className={styles.insightTitle}>Needs attention</div>
              </div>
              {loading ? (
                <div className={styles.insightEmpty}>Loading...</div>
              ) : pendingPitches.length === 0 ? (
                <div className={styles.insightEmpty}>
                  All your pitches are approved
                </div>
              ) : (
                <ul className={styles.insightScrollList}>
                  {pendingPitches.map((s) => (
                    <li key={s.pitch_id} className={styles.insightRowItem}>
                      <span className={styles.insightItemName}>{s.name}</span>
                      <span className={styles.insightItemWhen}>Awaiting approval</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.insightCard}>
              <div className={styles.insightHead}>
                <div className={`${styles.insightIconWrap} ${styles.insightIconGold}`}>
                  <Icon name="trophy" size={16} />
                </div>
                <div className={styles.insightTitle}>Top earners</div>
              </div>
              {loading ? (
                <div className={styles.insightEmpty}>Loading...</div>
              ) : earners.length === 0 ? (
                <div className={styles.insightEmpty}>No earnings yet</div>
              ) : (
                <ul className={styles.insightScrollList}>
                  {earners.map((s, i) => (
                    <li key={s.pitch_id} className={styles.rankItem}>
                      <span className={`${styles.rankBadge} ${styles[`rank_${rankTone(i)}`]}`}>
                        {i === 0 ? (
                          <Icon name="trophy" size={12} />
                        ) : i < 3 ? (
                          <Icon name="medal" size={12} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className={styles.rankName}>{s.name}</span>
                      <span className={styles.rankValue}>{formatBirr(s.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {msg && <p className={styles.message}>{msg}</p>}

          <PitchWizardModal
            open={openAdd}
            onClose={() => setOpenAdd(false)}
            onSubmit={async (payload) => {
              await createPitch(payload);
              setMsg("Pitch created (pending admin approval).");
              showToast("Pitch created — pending approval.", "create");
              setOpenAdd(false);
              await refresh();
            }}
          />

          <PitchWizardModal
            open={!!editingPitch}
            onClose={() => setEditingPitch(null)}
            mode="edit"
            initialData={
              editingPitch
                ? {
                    id: editingPitch.id,
                    name: editingPitch.name,
                    sport_type: editingPitch.sport_type,
                    address: editingPitch.address,
                    latitude: editingPitch.latitude,
                    longitude: editingPitch.longitude,
                    opening_time: editingPitch.opening_time,
                    closing_time: editingPitch.closing_time,
                    hourly_price: editingPitch.hourly_price,
                    weekly_price: editingPitch.weekly_price,
                    monthly_price: editingPitch.monthly_price,
                    min_hours: editingPitch.min_hours,
                    allow_hourly: editingPitch.allow_hourly,
                    allow_weekly: editingPitch.allow_weekly,
                    allow_monthly: editingPitch.allow_monthly,
                    has_dressing_room: editingPitch.has_dressing_room,
                    has_showers: editingPitch.has_showers,
                    has_parking: editingPitch.has_parking,
                    has_lighting: editingPitch.has_lighting,
                    other_services: editingPitch.other_services,
                    images: editingPitch.images,
                  }
                : undefined
            }
            onSubmit={async (payload) => {
              if (!editingPitch?.id) return;
              await updatePitch(editingPitch.id, payload);
              setMsg("Pitch updated successfully.");
              setEditingPitch(null);
              await refresh();
            }}
          />

          {/* ---------- Filters, centered ---------- */}
          <div className={styles.filterZone}>
            <div className={styles.filterBar}>
              <div className={styles.searchField}>
                <Icon name="search" size={14} />
                <input
                  className={styles.searchInput}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search pitches"
                />
                {search && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    <Icon name="x" size={10} />
                  </button>
                )}
              </div>

              <div className={styles.pillDivider} />

              <div className={styles.priceField}>
                <span className={styles.priceLabel}>Max price</span>
                <input
                  className={styles.priceInput}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Any"
                  inputMode="numeric"
                />
              </div>

              <div className={styles.pillDivider} />

              <div className={styles.amenityGroup}>
                <button
                  type="button"
                  onClick={() => setAmenities((prev) => ({ ...prev, dressing: !prev.dressing }))}
                  className={`${styles.amenityToggle} ${amenities.dressing ? styles.amenityToggleOn : ""}`}
                  title="Dressing room"
                  aria-pressed={amenities.dressing}
                >
                  <Icon name="shirt" size={14} />
                  <span className={styles.amenityToggleLabel}>Dressing room</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAmenities((prev) => ({ ...prev, showers: !prev.showers }))}
                  className={`${styles.amenityToggle} ${amenities.showers ? styles.amenityToggleOn : ""}`}
                  title="Showers"
                  aria-pressed={amenities.showers}
                >
                  <Icon name="droplet" size={14} />
                  <span className={styles.amenityToggleLabel}>Showers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAmenities((prev) => ({ ...prev, parking: !prev.parking }))}
                  className={`${styles.amenityToggle} ${amenities.parking ? styles.amenityToggleOn : ""}`}
                  title="Parking"
                  aria-pressed={amenities.parking}
                >
                  <Icon name="car" size={14} />
                  <span className={styles.amenityToggleLabel}>Parking</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAmenities((prev) => ({ ...prev, lighting: !prev.lighting }))}
                  className={`${styles.amenityToggle} ${amenities.lighting ? styles.amenityToggleOn : ""}`}
                  title="Lighting"
                  aria-pressed={amenities.lighting}
                >
                  <Icon name="bulb" size={14} />
                  <span className={styles.amenityToggleLabel}>Lighting</span>
                </button>
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
          </div>

          <hr className={styles.divider} />

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleWrap}>
                <span className={styles.sectionAccent} />
                <h2 className={styles.sectionTitle}>My pitches</h2>
              </div>
              {!loading && (
                <span className={styles.countBadge}>
                  {filteredPitches.length} {filteredPitches.length === 1 ? "pitch" : "pitches"}
                </span>
              )}
            </div>

            {loading ? (
              <div className={styles.loadingSlot}>
                <p className={styles.emptyText}>Loading pitches...</p>
              </div>
            ) : filteredPitches.length === 0 ? (
              <p className={styles.emptyText}>No pitches yet.</p>
            ) : (
              <div className={styles.cardGrid}>
                {filteredPitches.map((p, index) => {
                  const pStat = statsByPitchId.get(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/app/owner/pitches/${p.id}`)}
                      className={styles.pitchCard}
                      style={{ "--i": index } as React.CSSProperties}
                    >
                      <CardImage pitch={p} />

                      <div className={styles.cardBody}>
                        <div>
                          <div className={styles.pitchName}>{p.name}</div>
                          <div className={styles.pitchAddress}>
                            <Icon name="pin" size={13} />
                            {p.address || "No address on file"}
                          </div>
                        </div>

                        {pStat && (
                          <>
                            <div className={styles.cardStatsRow}>
                              <div className={styles.cardStat}>
                                <Icon name="cash" size={15} />
                                <div>
                                  <div className={styles.cardStatValue}>
                                    {formatBirr(pStat.revenue)}
                                  </div>
                                  <div className={styles.cardStatLabel}>Earned</div>
                                </div>
                              </div>
                              <div className={styles.cardStat}>
                                <Icon name="calendarCheck" size={15} />
                                <div>
                                  <div className={styles.cardStatValue}>
                                    {pStat.bookings_count}
                                  </div>
                                  <div className={styles.cardStatLabel}>Booked</div>
                                </div>
                              </div>
                            </div>
                            <PitchRevenueBar
                              value={Number(pStat.revenue) || 0}
                              max={maxPitchRevenue}
                            />
                          </>
                        )}

                        <PitchHours pitch={p} />
                        <AmenityTags pitch={p} />

                        {p.other_services && (
                          <div className={styles.otherServices}>
                            <b>Other services:</b> {p.other_services}
                          </div>
                        )}
                      </div>

                      <button
                        className={styles.bookCornerBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/app/pitches/${p.id}`);
                        }}
                      >
                        <Icon name="calendarCheck" size={13} />
                        Book
                      </button>

                      <button
                        className={styles.editCornerBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMsg("");
                          setEditingPitch(p);
                        }}
                      >
                        <Icon name="pencil" size={13} />
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}