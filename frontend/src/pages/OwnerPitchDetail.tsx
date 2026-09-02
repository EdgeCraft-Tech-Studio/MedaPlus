import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { OwnerPitchDetailStats } from "../lib/pitches";
import { getOwnerPitchStats, updatePitch } from "../lib/pitches";
import PitchWizardModal from "../components/PitchWizardModal";
import styles from "./css/OwnerPitchDetail.module.css";

type IconName =
  | "arrowLeft"
  | "cash"
  | "calendarCheck"
  | "pin"
  | "clock"
  | "tag"
  | "shirt"
  | "droplet"
  | "car"
  | "bulb"
  | "imageOff"
  | "pencil";

function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrowLeft: (
      <>
        <path d="M19 12H5" />
        <path d="m11 6-6 6 6 6" />
      </>
    ),
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

function sportLabel(sport: string) {
  return sport === "BASKETBALL" ? "Basketball" : "Football";
}

/* ---------------------------------------------------------------------- */
/* Skeleton loading state — mirrors gallery, scoreboard, bookings,         */
/* details grid, and amenities so the layout doesn't jump on load.         */
/* ---------------------------------------------------------------------- */

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`${styles.shimmer} ${className}`} />;
}

function OwnerPitchDetailSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.container} aria-busy="true" aria-live="polite">
        <SkeletonBlock className={styles.skelBackBtn} />

        <div className={styles.headRow}>
          <div style={{ flex: 1 }}>
            <div className={styles.titleRow}>
              <SkeletonBlock className={styles.skelTitle} />
              <SkeletonBlock className={styles.skelPill} />
              <SkeletonBlock className={styles.skelPill} />
            </div>
            <SkeletonBlock className={styles.skelAddress} />
          </div>
          <SkeletonBlock className={styles.skelEditBtn} />
        </div>

        <SkeletonBlock className={styles.skelGalleryMain} />
        <div className={styles.galleryThumbs}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className={styles.skelThumb} />
          ))}
        </div>

        <SkeletonBlock className={styles.skelSectionLabel} />
        <div className={styles.scoreRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={styles.scoreCard} key={i}>
              <SkeletonBlock className={styles.skelIconDot} />
              <div style={{ flex: 1 }}>
                <SkeletonBlock className={styles.skelScoreValue} />
                <SkeletonBlock className={styles.skelScoreLabel} />
              </div>
            </div>
          ))}
        </div>

        <SkeletonBlock className={styles.skelSectionLabel} />
        <div className={styles.bookingRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div className={styles.bookingCard} key={i}>
              <SkeletonBlock className={styles.skelBookingValue} />
              <SkeletonBlock className={styles.skelBookingLabel} />
            </div>
          ))}
        </div>

        <SkeletonBlock className={styles.skelSectionLabel} />
        <div className={styles.detailsGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={styles.detailItem} key={i}>
              <SkeletonBlock className={styles.skelIconDot} />
              <div style={{ flex: 1 }}>
                <SkeletonBlock className={styles.skelDetailValue} />
                <SkeletonBlock className={styles.skelDetailLabel} />
              </div>
            </div>
          ))}
        </div>

        <div className={styles.amenityRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className={styles.skelAmenityChip} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OwnerPitchDetail() {
  const { pitchId } = useParams<{ pitchId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<OwnerPitchDetailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  async function refresh() {
    if (!pitchId) return;
    try {
      setLoading(true);
      const res = await getOwnerPitchStats(pitchId);
      setData(res);
      setActivePhoto(0);
    } catch {
      setMsg("Failed to load pitch details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId]);

  const pitch = data?.pitch;
  const photos = pitch?.images && pitch.images.length > 0 ? pitch.images : [];

  if (loading) {
    return <OwnerPitchDetailSkeleton />;
  }

  if (!pitch) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <Icon name="arrowLeft" size={16} />
            Back
          </button>
          <p className={styles.emptyText}>{msg || "Pitch not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}> 
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" size={16} />
          Back to my pitches
        </button>

        {msg && <p className={styles.message}>{msg}</p>}

        <div className={styles.headRow}>
          <div>
            <div className={styles.titleRow}>
              <h1 className={styles.pitchTitle}>{pitch.name}</h1>
              <span
                className={`${styles.sportPill} ${
                  pitch.sport_type === "BASKETBALL" ? styles.sportPillBasketball : styles.sportPillFootball
                }`}
              >
                {sportLabel(pitch.sport_type)}
              </span>
              <span
                className={`${styles.statusPill} ${
                  pitch.is_approved ? styles.statusApproved : styles.statusPending
                }`}
              >
                {pitch.is_approved ? "Approved" : "Pending approval"}
              </span>
            </div>
            <div className={styles.pitchAddress}>
              <Icon name="pin" size={14} />
              {pitch.address || "No address on file"}
            </div>
          </div>

          <button className={styles.editBtn} onClick={() => setEditOpen(true)}>
            <Icon name="pencil" size={14} />
            Edit pitch
          </button>
        </div>

        {/* ---------- Photos ---------- */}
        <div className={styles.gallery}>
          <div className={styles.galleryMain}>
            {photos.length > 0 ? (
              <img src={photos[activePhoto]?.url} alt={pitch.name} />
            ) : (
              <div className={styles.galleryEmpty}>
                <Icon name="imageOff" size={34} />
                No photos yet
              </div>
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

        {/* ---------- Earnings scoreboard ---------- */}
        <div className={styles.sectionLabel}>Earnings</div>
        <div className={styles.scoreRow}>
          <div className={styles.scoreCard}>
            <Icon name="cash" size={18} />
            <div>
              <div className={styles.scoreValue}>{formatBirr(data?.earnings_week)}</div>
              <div className={styles.scoreLabel}>This week</div>
            </div>
          </div>
          <div className={styles.scoreCard}>
            <Icon name="cash" size={18} />
            <div>
              <div className={styles.scoreValue}>{formatBirr(data?.earnings_month)}</div>
              <div className={styles.scoreLabel}>This month</div>
            </div>
          </div>
          <div className={styles.scoreCard}>
            <Icon name="cash" size={18} />
            <div>
              <div className={styles.scoreValue}>{formatBirr(data?.earnings_year)}</div>
              <div className={styles.scoreLabel}>This year</div>
            </div>
          </div>
          <div className={`${styles.scoreCard} ${styles.scoreCardGold}`}>
            <Icon name="cash" size={18} />
            <div>
              <div className={styles.scoreValue}>{formatBirr(data?.total_earnings)}</div>
              <div className={styles.scoreLabel}>All-time</div>
            </div>
          </div>
        </div>

        {/* ---------- Bookings breakdown ---------- */}
        <div className={styles.sectionLabel}>Bookings over time</div>
        <div className={styles.bookingRow}>
          <div className={styles.bookingCard}>
            <div className={styles.bookingValue}>{data?.bookings_1m ?? 0}</div>
            <div className={styles.bookingLabel}>Last month</div>
          </div>
          <div className={styles.bookingCard}>
            <div className={styles.bookingValue}>{data?.bookings_3m ?? 0}</div>
            <div className={styles.bookingLabel}>Last 3 months</div>
          </div>
          <div className={styles.bookingCard}>
            <div className={styles.bookingValue}>{data?.bookings_6m ?? 0}</div>
            <div className={styles.bookingLabel}>Last 6 months</div>
          </div>
          <div className={styles.bookingCard}>
            <div className={styles.bookingValue}>{data?.bookings_1y ?? 0}</div>
            <div className={styles.bookingLabel}>Last 12 months</div>
          </div>
          <div className={`${styles.bookingCard} ${styles.bookingCardGold}`}>
            <div className={styles.bookingValue}>{data?.total_bookings ?? 0}</div>
            <div className={styles.bookingLabel}>All-time</div>
          </div>
        </div>

        {/* ---------- Pitch details ---------- */}
        <div className={styles.sectionLabel}>Pitch details</div>
        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <Icon name="clock" />
            <div>
              <div className={styles.detailValue}>
                {pitch.opening_time_label && pitch.closing_time_label
                  ? `${pitch.opening_time_label} - ${pitch.closing_time_label}`
                  : `${pitch.opening_time} - ${pitch.closing_time}`}
              </div>
              <div className={styles.detailLabel}>Open hours</div>
            </div>
          </div>
          <div className={styles.detailItem}>
            <Icon name="tag" />
            <div>
              <div className={styles.detailValue}>{pitch.hourly_price} Br / hr</div>
              <div className={styles.detailLabel}>Hourly price</div>
            </div>
          </div>
          <div className={styles.detailItem}>
            <Icon name="tag" />
            <div>
              <div className={styles.detailValue}>{pitch.weekly_price} Br / wk</div>
              <div className={styles.detailLabel}>Weekly price</div>
            </div>
          </div>
          <div className={styles.detailItem}>
            <Icon name="tag" />
            <div>
              <div className={styles.detailValue}>{pitch.monthly_price} Br / mo</div>
              <div className={styles.detailLabel}>Monthly price</div>
            </div>
          </div>
        </div>

        <div className={styles.amenityRow}>
          {[
            { label: "Dressing room", on: pitch.has_dressing_room, icon: "shirt" as const },
            { label: "Showers", on: pitch.has_showers, icon: "droplet" as const },
            { label: "Parking", on: pitch.has_parking, icon: "car" as const },
            { label: "Lighting", on: pitch.has_lighting, icon: "bulb" as const },
          ].map((item) => (
            <span
              key={item.label}
              className={`${styles.amenityChip} ${item.on ? styles.amenityChipOn : styles.amenityChipOff}`}
            >
              <Icon name={item.icon} size={13} />
              {item.label}
            </span>
          ))}
        </div>

        {pitch.other_services && (
          <div className={styles.otherServices}>
            <b>Other services:</b> {pitch.other_services}
          </div>
        )}
      </div>

      <PitchWizardModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initialData={{
          id: pitch.id,
          name: pitch.name,
          sport_type: pitch.sport_type,
          address: pitch.address,
          latitude: pitch.latitude,
          longitude: pitch.longitude,
          opening_time: pitch.opening_time,
          closing_time: pitch.closing_time,
          hourly_price: pitch.hourly_price,
          weekly_price: pitch.weekly_price,
          monthly_price: pitch.monthly_price,
          min_hours: pitch.min_hours,
          allow_hourly: pitch.allow_hourly,
          allow_weekly: pitch.allow_weekly,
          allow_monthly: pitch.allow_monthly,
          has_dressing_room: pitch.has_dressing_room,
          has_showers: pitch.has_showers,
          has_parking: pitch.has_parking,
          has_lighting: pitch.has_lighting,
          other_services: pitch.other_services,
          images: pitch.images,
        }}
        onSubmit={async (payload) => {
          await updatePitch(pitch.id, payload);
          setMsg("Pitch updated successfully.");
          setEditOpen(false);
          await refresh();
        }}
      />
    </div>
  );
}