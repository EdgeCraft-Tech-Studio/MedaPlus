import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Pitch } from "../lib/pitches";
import { listPitches } from "../lib/pitches";
import styles from "./css/Dashboard.module.css";
import LoadingBall from "./LoadingBall";

type TabKey = "map" | "nearby" | "best";
type SportType = "FOOTBALL" | "BASKETBALL";
type SportFilter = "ALL" | SportType;

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 };

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

function matchesSport(p: Pitch, filter: SportFilter) {
  if (filter === "ALL") return true;
  return (p as Pitch & { sport_type?: SportType }).sport_type === filter;
}

/* ---------- small inline icons (purely presentational) ---------- */

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
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

function FootballIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path
        d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8 12 7.2z"
        fill="currentColor"
        stroke="none"
      />
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

/* ---------- tab icons ---------- */

function MapTabIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2z" strokeLinejoin="round" />
      <path d="M9 4.5v13M15 6.5v13" />
    </svg>
  );
}

function NearbyTabIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 105 9.5C5 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  );
}

function TopRatedTabIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...props}>
      <path d="M12 3.5l2.47 5.13 5.53.8-4 4 .94 5.57L12 16.4l-4.94 2.6.94-5.57-4-4 5.53-.8L12 3.5z" />
    </svg>
  );
}

/* ---------- map pin icons (per sport) ----------
   Real-looking ball renders (not line icons) sit inside the pin head's
   circular cutout — a white pentagon-paneled football, and a textured
   orange basketball with seams — so they're distinguishable at a glance. */

function buildPitchDivIcon(sport: SportType) {
  const isBasketball = sport === "BASKETBALL";
  const pinColor = isBasketball ? "#c9942a" : "#0f7a52";
  const ballId = isBasketball ? "bball" : "fball";

  const ballSvg = isBasketball
    ? `
      <defs>
        <radialGradient id="${ballId}-shade" cx="32%" cy="25%" r="78%">
          <stop offset="0%" stop-color="#ffbd70"/>
          <stop offset="28%" stop-color="#f79432"/>
          <stop offset="68%" stop-color="#d96816"/>
          <stop offset="100%" stop-color="#8f3508"/>
        </radialGradient>

        <filter id="${ballId}-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.5" dy="1" stdDeviation="0.8" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>

      <!-- Realistic basketball -->
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="url(#${ballId}-shade)"
        filter="url(#${ballId}-shadow)"
      />

      <!-- Outer ball texture -->
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="none"
        stroke="#4a1d08"
        stroke-width="0.8"
      />

      <!-- Vertical seam -->
      <path
        d="M12 1.5 C8.8 5.2 8.8 18.8 12 22.5"
        fill="none"
        stroke="#4a1d08"
        stroke-width="1"
      />

      <!-- Opposite vertical seam -->
      <path
        d="M12 1.5 C15.2 5.2 15.2 18.8 12 22.5"
        fill="none"
        stroke="#4a1d08"
        stroke-width="1"
      />

      <!-- Horizontal seam -->
      <path
        d="M1.5 12 C6 10.2 18 10.2 22.5 12"
        fill="none"
        stroke="#4a1d08"
        stroke-width="1"
      />

      <!-- Curved basketball seams -->
      <path
        d="M3.5 6.2 C7.5 9 16.5 15 20.5 17.8"
        fill="none"
        stroke="#4a1d08"
        stroke-width="1"
      />

      <path
        d="M20.5 6.2 C16.5 9 7.5 15 3.5 17.8"
        fill="none"
        stroke="#4a1d08"
        stroke-width="1"
      />

      <!-- Realistic light reflection -->
      <ellipse
        cx="7.5"
        cy="6.5"
        rx="3.2"
        ry="2"
        fill="#ffffff"
        opacity="0.28"
        transform="rotate(-30 7.5 6.5)"
      />
    `
    : `
      <defs>
        <radialGradient id="${ballId}-shade" cx="32%" cy="25%" r="80%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="45%" stop-color="#f4f4f2"/>
          <stop offset="78%" stop-color="#d5d5d1"/>
          <stop offset="100%" stop-color="#9e9e99"/>
        </radialGradient>

        <filter id="${ballId}-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.5" dy="1" stdDeviation="0.8" flood-color="#000000" flood-opacity="0.3"/>
        </filter>
      </defs>

      <!-- Realistic football -->
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="url(#${ballId}-shade)"
        stroke="#222222"
        stroke-width="0.75"
        filter="url(#${ballId}-shadow)"
      />

      <!-- Center pentagon -->
      <polygon
        points="12,8.3 15.3,10.6 14.05,14.4 9.95,14.4 8.7,10.6"
        fill="#181818"
      />

      <!-- Top pentagon -->
      <polygon
        points="12,2.2 14.8,4.2 13.75,7.4 10.25,7.4 9.2,4.2"
        fill="#202020"
      />

      <!-- Left pentagon -->
      <polygon
        points="3.1,9.4 6.1,8.3 8.4,10.4 7.35,13.7 4.1,13.9"
        fill="#202020"
      />

      <!-- Right pentagon -->
      <polygon
        points="20.9,9.4 17.9,8.3 15.6,10.4 16.65,13.7 19.9,13.9"
        fill="#202020"
      />

      <!-- Bottom pentagon - moved DOWN so it does not touch center -->
      <polygon
        points="8.7,17.5 10.7,15.3 13.3,15.3 15.3,17.5 13.9,20.3 10.1,20.3"
        fill="#202020"
      />

      <!-- Panel connection lines -->
      <path
        d="
          M12 8.3 L12 7.4
          M8.7 10.6 L6.1 8.3
          M15.3 10.6 L17.9 8.3
          M9.95 14.4 L8.7 17.5
          M14.05 14.4 L15.3 17.5
          M10.25 7.4 L9.2 4.2
          M13.75 7.4 L14.8 4.2
        "
        fill="none"
        stroke="#3b3b3b"
        stroke-width="0.55"
      />

      <!-- Football shine -->
      <ellipse
        cx="7.2"
        cy="6.3"
        rx="3.5"
        ry="2.1"
        fill="#ffffff"
        opacity="0.55"
        transform="rotate(-30 7.2 6.3)"
      />

      <!-- Slight bottom shading -->
      <ellipse
        cx="14"
        cy="19.5"
        rx="5"
        ry="1.5"
        fill="#777777"
        opacity="0.15"
      />
    `;

  const html = `
    <div class="pitch-marker">
      <svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M17 1C8.4 1 1.5 7.8 1.5 16c0 10.8 15.5 24 15.5 24s15.5-13.2 15.5-24C32.5 7.8 25.6 1 17 1z"
          fill="${pinColor}"
          stroke="white"
          stroke-width="1.6"
        />
        <circle cx="17" cy="16" r="11.5" fill="white"/>
        <g transform="translate(5,4)">
          ${ballSvg}
        </g>
      </svg>
    </div>`;

  return L.divIcon({
    html,
    className: "pitch-marker-icon",
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  });
}

const FOOTBALL_ICON = buildPitchDivIcon("FOOTBALL");
const BASKETBALL_ICON = buildPitchDivIcon("BASKETBALL");

function iconForPitch(pitch: Pitch) {
  const sport = (pitch as Pitch & { sport_type?: SportType }).sport_type;
  return sport === "BASKETBALL" ? BASKETBALL_ICON : FOOTBALL_ICON;
}

/* ---------- short-description card ---------- */

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

  const sport = (pitch as Pitch & { sport_type?: SportType }).sport_type;
  const SportIcon = sport === "BASKETBALL" ? BasketballIcon : FootballIcon;
  const sportLabel = sport === "BASKETBALL" ? "Basketball" : "Football";

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
        <span className={`${styles.sportBadge} ${sport === "BASKETBALL" ? styles.sportBadgeBasketball : styles.sportBadgeFootball}`}>
          <SportIcon />
          {sportLabel}
        </span>
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

const AMENITY_DEFS: Array<{
  key: "dressing" | "showers" | "parking" | "lighting";
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}> = [
  { key: "dressing", label: "Dressing room", icon: ShirtIcon },
  { key: "showers", label: "Showers", icon: ShowerIcon },
  { key: "parking", label: "Parking", icon: ParkingIcon },
  { key: "lighting", label: "Lighting", icon: LightIcon },
];

const SPORT_DEFS: Array<{ key: SportFilter; label: string; icon?: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement }> = [
  { key: "ALL", label: "All sports" },
  { key: "FOOTBALL", label: "Football", icon: FootballIcon },
  { key: "BASKETBALL", label: "Basketball", icon: BasketballIcon },
];

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
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");
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
        matchesAmenities(p, amenities) &&
        matchesSport(p, sportFilter)
    );
  }, [pitches, search, maxPrice, amenities, sportFilter]);

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
   console.log("hello start");
  console.log(filteredPitches.map(p => ({ name: p.name, sport_type: (p as any).sport_type })));
  
   console.log("hello end");

  const TABS: { key: TabKey; label: string; icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement }[] = [
    { key: "map", label: "Map", icon: MapTabIcon },
    { key: "nearby", label: "Nearby", icon: NearbyTabIcon },
    { key: "best", label: "Top rated", icon: TopRatedTabIcon },
  ];

  const hasActiveFilters =
    search.trim() !== "" ||
    maxPrice.trim() !== "" ||
    sportFilter !== "ALL" ||
    Object.values(amenities).some(Boolean);

  function toggleAmenity(key: keyof typeof amenities) {
    setAmenities((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function clearFilters() {
    setSearch("");
    setMaxPrice("");
    setSportFilter("ALL");
    setAmenities({ dressing: false, showers: false, parking: false, lighting: false });
  }

  return (
    <div>
      <div className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div>
                <div className={styles.title}>Pitch Finder</div>
                <div className={styles.subtitle}>
                  compare and book a game near you
                </div>
              </div>
            </div>

            <div className={styles.tabRow}>
              {TABS.map(({ key, label, icon: TabIcon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
                >
                  <TabIcon className={styles.tabIcon} />
                  {label}
                </button>
              ))}
            </div>

            <div className={styles.statPill}>
              <span className={styles.statValue}>{filteredPitches.length}</span>
              <span className={styles.statLabel}>pitches found</span>
            </div>
          </div>

          <div className={styles.filterZone}>
            <div className={styles.filterBar}>
              <div className={styles.searchField}>
                <SearchIcon className={styles.searchIcon} />
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
                    <CloseIcon />
                  </button>
                )}
              </div>

              <div className={styles.divider} />

              <div className={styles.sportGroup}>
                {SPORT_DEFS.map(({ key, label, icon: SIcon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSportFilter(key)}
                    className={`${styles.sportToggle} ${sportFilter === key ? styles.sportToggleOn : ""}`}
                    title={label}
                    aria-pressed={sportFilter === key}
                  >
                    {SIcon && <SIcon className={styles.sportToggleIcon} />}
                    <span className={styles.sportToggleLabel}>{label}</span>
                  </button>
                ))}
              </div>

              <div className={styles.divider} />

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

              <div className={styles.divider} />

              <div className={styles.amenityGroup}>
                {AMENITY_DEFS.map(({ key, label, icon: AIcon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAmenity(key)}
                    className={`${styles.amenityToggle} ${amenities[key] ? styles.amenityToggleOn : ""}`}
                    title={label}
                    aria-pressed={amenities[key]}
                  >
                    <AIcon className={styles.amenityToggleIcon} />
                    <span className={styles.amenityToggleLabel}>{label}</span>
                  </button>
                ))}
              </div>

              {hasActiveFilters && (
                <>
                  <div className={styles.divider} />
                  <button className={styles.clearBtn} onClick={clearFilters}>
                    Clear
                  </button>
                </>
              )}
            </div>
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
                            icon={iconForPitch(pitch)}
                            eventHandlers={{
                              click: () => goToPitch(pitch.id),
                            }}
                          />
                        ))}
                      </MapContainer>
                    </div>
                    <div className={styles.mapLegend}>
                      <span className={styles.mapLegendItem}>
                        <FootballIcon className={styles.mapLegendIconFootball} />
                        Football
                      </span>
                      <span className={styles.mapLegendItem}>
                        <BasketballIcon className={styles.mapLegendIconBasketball} />
                        Basketball
                      </span>
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