import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { Pitch } from "../lib/pitches";
import { listPitches } from "../lib/pitches";
import styles from "./css/Dashboard.module.css";
import LoadingBall from "./LoadingBall";
import AppHeader from "./AppHeader";

type TabKey = "map" | "nearby" | "best";

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 };


function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;

  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(a));
}

function scorePitch(pitch: Pitch) {
  let score = 0;

  if (pitch.has_lighting) score += 2;
  if (pitch.has_parking) score += 1;
  if (pitch.has_showers) score += 1;
  if (pitch.has_dressing_room) score += 1;

  const hourly = Number(pitch.hourly_price || 0);
  if (!Number.isNaN(hourly) && hourly > 0) {
    score += Math.max(0, 200 / hourly);
  }

  return score;
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

/* ---------- small inline icons (purely presentational) ---------- */

function LogoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ShirtIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M8 4L4 6.5 5.5 10l2-1V20h9V9l2 1L20 6.5 16 4l-2 1.5h-4L8 4z" />
    </svg>
  );
}

function ShowerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 9h12M8 13v.01M12 13v.01M16 13v.01M8 17v.01M12 17v.01M16 17v.01" />
      <path d="M17 6a5 5 0 00-10 0" />
    </svg>
  );
}

function ParkingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 17V7h3.5a2.75 2.75 0 010 5.5H9" />
    </svg>
  );
}

function LightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6h5.4c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function TagIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.3" />
    </svg>
  );
}

function EmptyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function formatPrice(value: string | number) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 105 9.5C5 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  );
}

/* ---------- short-description card: photo + hours/prices grid + amenity tags,
   same listing mechanism used on the Admin/Owner pages ---------- */

function PitchCard({
  pitch,
  index,
  onClick,
}: {
  pitch: Pitch;
  index: number;
  onClick: () => void;
}) {
  const hours =
    pitch.opening_time_label && pitch.closing_time_label
      ? `${pitch.opening_time_label} - ${pitch.closing_time_label}`
      : `${pitch.opening_time} - ${pitch.closing_time}`;

  const amenityItems: Array<{ label: string; on: boolean; icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement }> = [
    { label: "Dressing room", on: pitch.has_dressing_room, icon: ShirtIcon },
    { label: "Showers", on: pitch.has_showers, icon: ShowerIcon },
    { label: "Parking", on: pitch.has_parking, icon: ParkingIcon },
    { label: "Lighting", on: pitch.has_lighting, icon: LightIcon },
  ];

  return (
    <div
      className={styles.card}
      style={{ "--i": index } as React.CSSProperties}
      onClick={onClick}
    >
      <div className={styles.cardImage}>
        {pitch.cover_image_url ? (
          <img src={pitch.cover_image_url} alt={pitch.name} />
        ) : (
          <div className={styles.cardImagePlaceholder}>No photo yet</div>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardName}>{pitch.name}</div>

        <div className={styles.cardAddress}>
          <PinIcon className={styles.cardAddressIcon} />
          <span>{pitch.address || "Address not listed"}</span>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <ClockIcon />
            {hours}
          </div>
          <div className={styles.metaItem}>
            <TagIcon />
            Hourly <b>{formatPrice(pitch.hourly_price)}</b>
          </div>
          <div className={styles.metaItem}>
            <TagIcon />
            Weekly <b>{formatPrice(pitch.weekly_price)}</b>
          </div>
          <div className={styles.metaItem}>
            <TagIcon />
            Monthly <b>{formatPrice(pitch.monthly_price)}</b>
          </div>
        </div>

        <div className={styles.tagRow}>
          {amenityItems.map((item) => {
            const ItemIcon = item.icon;
            return (
              <span
                key={item.label}
                className={`${styles.tag} ${item.on ? styles.tagYes : styles.tagNo}`}
              >
                <ItemIcon />
                {item.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("map");
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>(
    ADDIS_ABABA
  );

  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [amenities, setAmenities] = useState({
    dressing: false,
    showers: false,
    parking: false,
    lighting: false,
  });

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await listPitches();
        setPitches(data);
      } catch {
        setPitches([]);
        setError("Failed to load pitches.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setUserLocation(ADDIS_ABABA);
      }
    );
  }, []);

  const filteredPitches = useMemo(() => {
    return pitches.filter(
      (p) =>
        matchesSearch(p, search) &&
        matchesPrice(p, maxPrice) &&
        matchesAmenities(p, amenities)
    );
  }, [pitches, search, maxPrice, amenities]);

  const nearbyPitches = useMemo(() => {
    return [...filteredPitches].sort((a, b) => {
      const da = distanceKm(userLocation.lat, userLocation.lng, a.latitude, a.longitude);
      const db = distanceKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
      return da - db;
    });
  }, [filteredPitches, userLocation]);

  const bestPitches = useMemo(() => {
    return [...filteredPitches].sort((a, b) => scorePitch(b) - scorePitch(a));
  }, [filteredPitches]);

  const mapCenter =
    nearbyPitches.length > 0
      ? { lat: nearbyPitches[0].latitude, lng: nearbyPitches[0].longitude }
      : userLocation;

  function goToPitch(pitchId: string) {
    navigate(`/app/pitches/${pitchId}`);
  }

  return (
    <div>
    <AppHeader variant="logout" />
      <br />
        <Link to="/home" className={styles.backLink}>
          <ArrowLeftIcon width={15} height={15} />
          Back home
        </Link> 
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.brandMark}>
              <LogoIcon />
            </div>
            <div>
              <div className={styles.title}>Pitch Finder</div>
              <div className={styles.subtitle}>
                Search, compare, and book a game near you
              </div>
            </div>
          </div>

          <div className={styles.statPill}>
            <span className={styles.statValue}>{filteredPitches.length}</span>
            <span className={styles.statLabel}>pitches found</span>
          </div>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.tabRow}>
            {(["map", "nearby", "best"] as TabKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
              >
                {key === "map" ? "Map" : key === "nearby" ? "Nearby" : "Top rated"}
              </button>
            ))}
          </div>

          <div className={styles.searchWrap}>
            <SearchIcon className={styles.searchIcon} />
            <input
              className={`${styles.input} ${styles.searchInput}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by pitch name or address"
            />
          </div>

          <input
            className={`${styles.input} ${styles.priceInput}`}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max price"
          />

          <div className={styles.amenities}>
            <label className={styles.amenityChip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.dressing}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, dressing: e.target.checked }))
                }
              />
              <ShirtIcon className={styles.amenityIcon} />
              Dressing room
            </label>
            <label className={styles.amenityChip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.showers}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, showers: e.target.checked }))
                }
              />
              <ShowerIcon className={styles.amenityIcon} />
              Showers
            </label>
            <label className={styles.amenityChip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.parking}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, parking: e.target.checked }))
                }
              />
              <ParkingIcon className={styles.amenityIcon} />
              Parking
            </label>
            <label className={styles.amenityChip}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={amenities.lighting}
                onChange={(e) =>
                  setAmenities((prev) => ({ ...prev, lighting: e.target.checked }))
                }
              />
              <LightIcon className={styles.amenityIcon} />
              Lighting
            </label>
          </div>

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

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loadingWrap}>
              <LoadingBall label="Loading pitches..." />
            </div>
          ) : error ? (
            <div className={styles.errorText}>{error}</div>
          ) : (
            <>
              {tab === "map" && (
                <>
                  <div className={styles.mapWrap}>
                    <MapContainer
                      center={[mapCenter.lat, mapCenter.lng] as [number, number]}
                      zoom={13}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {filteredPitches.map((pitch) => (
                        <Marker
                          key={pitch.id}
                          position={[pitch.latitude, pitch.longitude]}
                          eventHandlers={{
                            click: () => goToPitch(pitch.id),
                          }}
                        />
                      ))}
                    </MapContainer>
                  </div>
                  <div className={styles.mapHint}>Tap any marker to open that pitch.</div>
                </>
              )}

              {tab === "nearby" && (
                <div className={styles.cardGrid}>
                  {nearbyPitches.length === 0 ? (
                    <div className={styles.emptyState}>
                      <EmptyIcon className={styles.emptyIcon} />
                      <div className={styles.emptyTitle}>No pitches match these filters</div>
                      <div className={styles.emptyText}>Try loosening one and search again.</div>
                    </div>
                  ) : (
                    nearbyPitches.map((pitch, index) => (
                      <PitchCard
                        key={pitch.id}
                        pitch={pitch}
                        index={index}
                        onClick={() => goToPitch(pitch.id)}
                      />
                    ))
                  )}
                </div>
              )}

              {tab === "best" && (
                <div className={styles.cardGrid}>
                  {bestPitches.length === 0 ? (
                    <div className={styles.emptyState}>
                      <EmptyIcon className={styles.emptyIcon} />
                      <div className={styles.emptyTitle}>No pitches match these filters</div>
                      <div className={styles.emptyText}>Try loosening one and search again.</div>
                    </div>
                  ) : (
                    bestPitches.map((pitch, index) => (
                      <PitchCard
                        key={pitch.id}
                        pitch={pitch}
                        index={index}
                        onClick={() => goToPitch(pitch.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
