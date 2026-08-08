import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Pitch } from "../lib/pitches";
import AddButton from "../components/AddButton";
import PitchWizardModal from "../components/PitchWizardModal";
import PitchLocationModal from "../components/PitchLocationModal";
import LoadingBall from "../pages/LoadingBall";
import styles from "./css/Admin.module.css";
import ToastContainer, { showToast } from "../pages/Toast";

import {
  approveOwner,
  approvePitch,
  createPitch,
  listOwners,
  listPendingOwners,
  listPendingPitches,
  listPitches,
  updatePitch,
} from "../lib/pitches";
import AppHeader from "./AppHeader";
import { logout } from "../lib/auth";

type OwnerRow = {
  id: string;
  username: string;
  email: string;
  is_approved: boolean;
};

type ApprovalFilter = "all" | "approved" | "not_approved";

type IconName =
  | "clock"
  | "pin"
  | "tag"
  | "shirt"
  | "droplet"
  | "car"
  | "bulb"
  | "imageOff"
  | "mail";

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
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
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

function matchesApproval(p: Pitch, approval: ApprovalFilter) {
  if (approval === "all") return true;
  if (approval === "approved") return p.is_approved;
  return !p.is_approved;
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

// Edit + Location as ONE connected pill, positioned in the card corner.
//
// Why not two separate buttons each with the "editCornerBtn" class? Because
// that class is almost certainly position:absolute with a fixed top/right -
// applying it to BOTH buttons stacks them exactly on top of each other, and
// whichever renders last (Location) completely covers the other (Edit),
// making Edit look like it "disappeared". It never actually vanished, it
// was just hidden underneath.
//
// Fix: only the OUTER wrapper gets the absolute-positioning class. The two
// buttons inside are plain flex children with no gap between them, so they
// sit side-by-side inside that single positioned pill - same shape, zero
// gap, and both fully clickable.
function CardActions({
  onEdit,
  onLocation,
}: {
  onEdit: () => void;
  onLocation: () => void;
}) {
  return (
    <div
      className={styles.editCornerBtn}
      style={{
        display: "flex",
        alignItems: "stretch",
        padding: 0,
        overflow: "hidden",
        gap: 0,
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        style={{
          border: "none",
          borderRight: "1px solid rgba(255,255,255,0.35)",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          padding: "6px 12px",
          cursor: "pointer",
        }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onLocation();
        }}
        style={{
          border: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          padding: "6px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Icon name="pin" size={12} />
        Location
      </button>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();

  // Admin.tsx
const [pendingOwners, setPendingOwners] = useState
  <Array<{
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  }>
>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [pendingPitches, setPendingPitches] = useState<Pitch[]>([]);
  const [allPitches, setAllPitches] = useState<Pitch[]>([]);
  const [msg, setMsg] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editingPitch, setEditingPitch] = useState<Pitch | null>(null);
  const [locationPitch, setLocationPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
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

      const [po, o, pp, ap] = await Promise.all([
        listPendingOwners(),
        listOwners(),
        listPendingPitches(),
        listPitches(),
      ]);

      setPendingOwners(po);
      setOwners(o);
      setPendingPitches(pp);
      setAllPitches(ap);
    } catch {
      setMsg("Failed to load admin data. Check API / token.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onApproveOwner(id: string) {
    setMsg("");
    try {
      await approveOwner(id);
      setMsg("Owner approved.");
      showToast("Owner approved.", "update");
      await refresh();
    } catch {
      setMsg("Failed to approve owner.");
      showToast("Approve Failed.", "delete");
    }
  }

  async function onApprovePitch(id: string) {
    setMsg("");
    try {
      const res = await approvePitch(id);
      setMsg(res?.ok ? "Pitch approved." : "Could not approve pitch.");
      showToast("Pitch approved.", "create");
      await refresh();
    } catch {
      setMsg("Failed to approve pitch.");
      showToast("Pitch Approve Failed.", "delete");
    }
  }

  // Only approved pitches have a live detail/booking page worth opening.
  // Pending pitches are still being reviewed, so clicking the card does
  // nothing until an admin approves it.
  function goToPitch(pitch: Pitch) {
    if (!pitch.is_approved) return;
    navigate(`/app/pitches/${pitch.id}`);
  }

  const filteredPendingPitches = useMemo(() => {
    return pendingPitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities) &&
        matchesApproval(p, approvalFilter)
    );
  }, [pendingPitches, search, maxPrice, amenities, approvalFilter]);

  const filteredAllPitches = useMemo(() => {
    return allPitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities) &&
        matchesApproval(p, approvalFilter)
    );
  }, [allPitches, search, maxPrice, amenities, approvalFilter]);

  async function handleLogout() {
        await logout();
        navigate("/login", { replace: true });
      }

  return (
    <div>
      <AppHeader variant="logout" onLogout={handleLogout} />
    <div className={styles.page}>
      <ToastContainer />
      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.titleGroup}>
            <div className={styles.eyebrow}>Control panel</div>
            <h2 className={styles.title}>Admin</h2>
          </div>
          <AddButton onClick={() => setOpenAdd(true)} />
        </div>

        {msg && <p className={styles.message}>{msg}</p>}

        <PitchWizardModal
          open={openAdd}
          onClose={() => setOpenAdd(false)}
          isAdmin={true}
          owners={owners}
          onSubmit={async (payload) => {
            await createPitch(payload);
            setMsg("Pitch created (pending approval).");
            setOpenAdd(false);
            await refresh();
          }}
        />

        <PitchWizardModal
          open={!!editingPitch}
          onClose={() => setEditingPitch(null)}
          isAdmin={true}
          owners={owners}
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

        <PitchLocationModal
          open={!!locationPitch}
          onClose={() => setLocationPitch(null)}
          pitchId={locationPitch?.id}
          pitchName={locationPitch?.name}
          address={locationPitch?.address}
          latitude={locationPitch?.latitude}
          longitude={locationPitch?.longitude}
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

            <select
              className={styles.select}
              value={approvalFilter}
              onChange={(e) => setApprovalFilter(e.target.value as ApprovalFilter)}
            >
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="not_approved">Not approved</option>
            </select>

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
                setApprovalFilter("all");
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
            <div className={styles.sectionTitle}>Pending owners</div>
            {!loading && <span className={styles.countBadge}>{pendingOwners.length}</span>}
          </div>

          {loading ? (
            <div className={styles.loadingSlot}>
              <LoadingBall label="Loading admin data..." />
            </div>
          ) : (
            <>
              {pendingOwners.length === 0 ? (
                <p className={styles.emptyText}>No pending owners.</p>
              ) : (
                <ul className={styles.ownerList}>
                  {pendingOwners.map((o) => (
                    <li key={o.id} className={styles.ownerRow}>
                      <div className={styles.ownerInfo}>
                        <span className={styles.ownerEmail}>{o.first_name } {o.last_name }</span><br />
                        <span className={styles.ownerEmail}>{o.email }</span><br />
                        <span className={styles.ownerEmail}>
                          <Icon name="mail" size={12} />
                          {o.phone || "-"}
                        </span>
                      </div>
                      <button className={styles.approveBtn} onClick={() => onApproveOwner(o.id)}>
                        Approve
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <hr className={styles.divider} />

        {!loading && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Pending pitches</div>
              <span className={styles.countBadge}>{filteredPendingPitches.length}</span>
            </div>

            {filteredPendingPitches.length === 0 ? (
              <p className={styles.emptyText}>No pending pitches match these filters.</p>
            ) : (
              <div className={styles.cardGrid}>
                {filteredPendingPitches.map((p, index) => (
                  <div
                    key={p.id}
                    onClick={() => goToPitch(p)}
                    className={`${styles.pitchCard} ${!p.is_approved ? styles.pitchCardDisabled : ""}`}
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

                        <button
                          className={styles.approvePillBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            onApprovePitch(p.id);
                          }}
                        >
                          Approve
                        </button>
                      </div>

                      <PitchHours pitch={p} />
                    </div>

                    <CardActions
                      onEdit={() => {
                        setMsg("");
                        setEditingPitch(p);
                      }}
                      onLocation={() => setLocationPitch(p)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <hr className={styles.divider} />

        {!loading && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>All pitches</div>
              <span className={styles.countBadge}>{filteredAllPitches.length}</span>
            </div>

            {filteredAllPitches.length === 0 ? (
              <p className={styles.emptyText}>No pitches match these filters.</p>
            ) : (
              <div className={styles.cardGrid}>
                {filteredAllPitches.map((p, index) => (
                  <div
                    key={p.id}
                    onClick={() => goToPitch(p)}
                    className={`${styles.pitchCard} ${!p.is_approved ? styles.pitchCardDisabled : ""}`}
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
                    </div>

                    <CardActions
                      onEdit={() => {
                        setMsg("");
                        setEditingPitch(p);
                      }}
                      onLocation={() => setLocationPitch(p)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div> 
 );
}
