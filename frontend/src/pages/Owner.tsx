import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me } from "../lib/auth";
import type { Pitch } from "../lib/pitches";
import { createPitch, listPitches, updatePitch } from "../lib/pitches";
import AddButton from "../components/AddButton";
import PitchWizardModal from "../components/PitchWizardModal";
import ToastContainer, { showToast } from "./Toast";
import styles from "./css/Owner.module.css";
import AppHeader from "./AppHeader";

type IconName =
  | "clock"
  | "pin"
  | "tag"
  | "shirt"
  | "droplet"
  | "car"
  | "bulb"
  | "imageOff"
  | "shield";

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
    shield: (
      <path d="M12 2l8 3.5v5.3c0 5-3.4 8.9-8 11.2-4.6-2.3-8-6.2-8-11.2V5.5L12 2z" />
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

export default function Owner() {
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
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

  async function refresh() {
    try {
      setLoading(true);
      setMsg("");
      const u = await me();
      setUser(u);
      const data = await listPitches();
      setPitches(data);
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

  const filteredPitches = useMemo(() => {
    return pitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities)
    );
  }, [pitches, search, maxPrice, amenities]);

  return (
    <div>
      <AppHeader variant="logout" /> 
    <div className={styles.page}>
      <ToastContainer />
      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.titleGroup}>
            <div className={styles.eyebrow}>My pitches</div>
            <h2 className={styles.title}>Owner Dashboard</h2>
          </div>

          <div className={`${styles.addWrap} ${!isApproved ? styles.addWrapDisabled : ""}`}>
            <AddButton
              onClick={() => setOpenAdd(true)}
              title={isApproved ? "Add Pitch" : "Waiting for admin approval"}
            />
          </div>
        </div>

        {user && (
          <div className={styles.statusBanner}>
            <div className={styles.statusBannerLeft}>
              <div className={styles.statusIconWrap}>
                <Icon name="shield" size={18} />
              </div>
              <div className={styles.statusBannerText}>
                Account status:{" "}
                <b>{isApproved ? "Approved" : "Pending admin approval"}</b>
                {!isApproved && (
                  <div style={{ marginTop: 3 }}>
                    You can log in, but your pitches won't appear to players until
                    your account is approved.
                  </div>
                )}
              </div>
            </div>

            <span
              className={`${styles.statusPill} ${
                isApproved ? styles.statusApproved : styles.statusPending
              }`}
            >
              {isApproved ? "Approved" : "Pending"}
            </span>
          </div>
        )}

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

        <div className={styles.filtersCard}>
          <div className={styles.filtersHeading}>Pitch filters</div>
          <div className={styles.filtersGrid}>
            <input
              className={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by pitch name or address"
            />

            <input
              className={styles.input}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max price"
            />

            <button
              className={styles.clearBtn}
              onClick={() => {
                setSearch("");
                setMaxPrice("");
                setAmenities({
                  dressing: false,
                  showers: false,
                  parking: false,
                  lighting: false,
                });
              }}
            >
              Clear filters
            </button>
          </div>

          <div className={styles.amenityRow}>
            <label className={styles.chip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.dressing}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, dressing: e.target.checked }))
                }
              />
              <Icon name="shirt" size={13} />
              Dressing room
            </label>
            <label className={styles.chip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.showers}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, showers: e.target.checked }))
                }
              />
              <Icon name="droplet" size={13} />
              Showers
            </label>
            <label className={styles.chip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.parking}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, parking: e.target.checked }))
                }
              />
              <Icon name="car" size={13} />
              Parking
            </label>
            <label className={styles.chip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.lighting}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, lighting: e.target.checked }))
                }
              />
              <Icon name="bulb" size={13} />
              Lighting
            </label>
          </div>
        </div>

        <hr className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>My pitches</div>
            {!loading && <span className={styles.countBadge}>{filteredPitches.length}</span>}
          </div>

          {loading ? (
            <div className={styles.loadingSlot}>
              <p className={styles.emptyText}>Loading pitches...</p>
            </div>
          ) : filteredPitches.length === 0 ? (
            <p className={styles.emptyText}>No pitches yet.</p>
          ) : (
            <div className={styles.cardGrid}>
              {filteredPitches.map((p, index) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/app/pitches/${p.id}`)}
                  className={styles.pitchCard}
                  style={{ "--i": index } as React.CSSProperties}
                >
                  <CardImage pitch={p} />

                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <div>
                        <div className={styles.pitchName}>{p.name}</div>
                        <div className={styles.pitchAddress}>
                          <Icon name="pin" size={13} />
                          {p.address || "No address on file"}
                        </div>
                      </div>

                      <span
                        className={`${styles.statusPill} ${
                          p.is_approved ? styles.statusApproved : styles.statusPending
                        }`}
                      >
                        {p.is_approved ? "Approved" : "Pending"}
                      </span>
                    </div>

                    <PitchHours pitch={p} />
                    <AmenityTags pitch={p} />

                    {p.other_services && (
                      <div className={styles.otherServices}>
                        <b>Other services:</b> {p.other_services}
                      </div>
                    )}

                    <div className={styles.hintText}>
                      <Icon name="tag" size={12} />
                      Click card to manage
                    </div>
                  </div>

                  <button
                    className={styles.editCornerBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMsg("");
                      setEditingPitch(p);
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
    
  );
}
