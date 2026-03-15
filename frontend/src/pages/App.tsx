import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { Pitch } from "../lib/pitches";
import { listPitches } from "../lib/pitches";

type TabKey = "map" | "nearby" | "best";

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

function PitchCard({
  pitch,
  onClick,
}: {
  pitch: Pitch;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "1px solid #ddd",
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        background: "#fff",
        boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
        transition: "transform 0.15s ease",
      }}
    >
      <div style={{ height: 180, background: "#f1f3f5" }}>
        {pitch.cover_image_url ? (
          <img
            src={pitch.cover_image_url}
            alt={pitch.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "#666",
              fontWeight: 600,
            }}
          >
            No image
          </div>
        )}
      </div>

      <div style={{ padding: 14, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{pitch.name}</div>
        <div style={{ color: "#555" }}>{pitch.address || "No address provided"}</div>
        <div style={{ fontSize: 14, color: "#222", lineHeight: 1.5 }}>
          Hourly: {pitch.hourly_price} | Weekly: {pitch.weekly_price} | Monthly:{" "}
          {pitch.monthly_price}
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
    <div style={{ minHeight: "100vh", background: "#f7f7f8", padding: 24 }}>
      <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
        <div
          style={{
            width: 430,
            minWidth: 430,
            background: "#fff",
            borderRadius: 20,
            boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: 18, borderBottom: "1px solid #eee" }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>Player Dashboard</div>
            <div style={{ color: "#666", marginTop: 4 }}>Find available football pitches</div>
          </div>

          <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {(["map", "nearby", "best"] as TabKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: tab === key ? "#111" : "#fff",
                    color: tab === key ? "#fff" : "#222",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {key === "map" ? "Map" : key === "nearby" ? "Nearby" : "Best"}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by pitch name or address"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max price"
                style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
              <button
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
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14 }}>
              <label>
                <input
                  type="checkbox"
                  checked={amenities.dressing}
                  onChange={(e) =>
                    setAmenities((prev) => ({ ...prev, dressing: e.target.checked }))
                  }
                />{" "}
                Dressing room
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={amenities.showers}
                  onChange={(e) =>
                    setAmenities((prev) => ({ ...prev, showers: e.target.checked }))
                  }
                />{" "}
                Showers
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={amenities.parking}
                  onChange={(e) =>
                    setAmenities((prev) => ({ ...prev, parking: e.target.checked }))
                  }
                />{" "}
                Parking
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={amenities.lighting}
                  onChange={(e) =>
                    setAmenities((prev) => ({ ...prev, lighting: e.target.checked }))
                  }
                />{" "}
                Lighting
              </label>
            </div>
          </div>

          <div style={{ padding: 14, overflowY: "auto", maxHeight: "calc(100vh - 150px)" }}>
            {loading ? (
              <div style={{ color: "#666" }}>Loading pitches...</div>
            ) : error ? (
              <div style={{ color: "#b00020" }}>{error}</div>
            ) : (
              <>
                {tab === "map" && (
                  <>
                    <div
                      style={{
                        height: 560,
                        borderRadius: 16,
                        overflow: "hidden",
                        border: "1px solid #ddd",
                      }}
                    >
                      <MapContainer
                        center={[mapCenter.lat, mapCenter.lng]}
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
                    <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
                      Click any map marker to open the pitch detail page.
                    </div>
                  </>
                )}

                {tab === "nearby" && (
                  <div style={{ display: "grid", gap: 14 }}>
                    {nearbyPitches.length === 0 ? (
                      <p>No matching pitches found.</p>
                    ) : (
                      nearbyPitches.map((pitch) => (
                        <PitchCard
                          key={pitch.id}
                          pitch={pitch}
                          onClick={() => goToPitch(pitch.id)}
                        />
                      ))
                    )}
                  </div>
                )}

                {tab === "best" && (
                  <div style={{ display: "grid", gap: 14 }}>
                    {bestPitches.length === 0 ? (
                      <p>No matching pitches found.</p>
                    ) : (
                      bestPitches.map((pitch) => (
                        <PitchCard
                          key={pitch.id}
                          pitch={pitch}
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

        <div
          style={{
            flex: 1,
            background: "#fff",
            borderRadius: 20,
            boxShadow: "0 6px 24px rgba(0,0,0,0.07)",
            padding: 24,
            display: "grid",
            alignContent: "start",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800 }}>Explore pitches</div>
          <div style={{ color: "#555", maxWidth: 680, lineHeight: 1.6 }}>
            Use the filters on the left to narrow pitches by name, address, price, and amenities.
            The Map tab shows matching locations, Nearby sorts by your location, and Best ranks by
            temporary quality score until ratings are added later.
          </div>

          <div style={{ marginTop: 10, color: "#333", fontSize: 15 }}>
            Matching pitches: <b>{filteredPitches.length}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
