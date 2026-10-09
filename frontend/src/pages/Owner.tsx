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
import TourGuide from "../tours/TourGuide";
import OwnerInsights from "./OwnerInsights";

type IconName =
  | "clock"
  | "pin"
  | "tag"
  | "shirt"
  | "droplet"
  | "car"
  | "bulb"
  | "imageOff"
  | "search"
  | "x"
  | "cash"
  | "calendarCheck"
  | "pencil";

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
    pencil: <path d="m14.5 3.5 3 3L7 17l-4 1 1-4 10.5-10.5z" />,
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

/* ---------------------------------------------------------------------- */
/* Shimmer skeleton pieces                                                 */
/* ---------------------------------------------------------------------- */

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`${styles.shimmer} ${className}`} />;
}

function PitchCardSkeleton() {
  return (
    <div className={styles.pitchCard}>
      <SkeletonBlock className={styles.skelCardImage} />
      <div className={styles.cardBody}>
        <div>
          <SkeletonBlock className={styles.skelPitchName} />
          <SkeletonBlock className={styles.skelPitchAddress} />
        </div>
        <div className={styles.cardStatsRow}>
          <div className={styles.cardStat}>
            <SkeletonBlock className={styles.skelStatIcon} />
            <div style={{ flex: 1 }}>
              <SkeletonBlock className={styles.skelStatValue} />
              <SkeletonBlock className={styles.skelStatLabel} />
            </div>
          </div>
          <div className={styles.cardStat}>
            <SkeletonBlock className={styles.skelStatIcon} />
            <div style={{ flex: 1 }}>
              <SkeletonBlock className={styles.skelStatValue} />
              <SkeletonBlock className={styles.skelStatLabel} />
            </div>
          </div>
        </div>
        <SkeletonBlock className={styles.skelMetaGrid} />
        <div className={styles.tagRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} className={styles.skelTag} />
          ))}
        </div>
      </div>
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
      <TourGuide page="owner" waitForPage="appshell" />

      <div className={styles.page}>
        <ToastContainer />
        <div className={styles.container}>
          {/* ---------- Welcome header (plain, no background) ---------- */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "clamp(22px, 2.8vw, 28px)",
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                {user
                  ? `Welcome back, ${user.first_name || user.username}`
                  : "Welcome back"}
              </div>
              <div style={{ marginTop: 4, fontSize: 14, color: "#64748b" }}>
                Here's how your pitches are doing
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

          <OwnerInsights stats={stats} loading={loading} />

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
          <hr className={styles.divider} />

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

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleWrap} data-tour="tour-my-pitches">
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
              <div className={styles.cardGrid} aria-busy="true" aria-live="polite">
                {Array.from({ length: 6 }).map((_, i) => (
                  <PitchCardSkeleton key={i} />
                ))}
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
                          navigate(`/app/owner/pitches/${p.id}`);
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
