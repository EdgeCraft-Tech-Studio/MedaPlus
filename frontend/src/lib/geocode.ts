// src/lib/geocode.ts
import { api } from "./api";

/**
 * Reverse-geocode a lat/lng into a short, human-readable area name.
 * Tries the backend proxy first; falls back to a direct client-side
 * Nominatim lookup if the backend fails or returns nothing usable.
 */
export async function reverseGeocodeViaBackend(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await api.get("/geocode/reverse/", { params: { lat, lon: lng } });
    const area = res?.data?.area;
    return typeof area === "string" && area.trim() ? area.trim() : null;
  } catch (err) {
    console.error("Backend reverse geocode failed:", err);
    return null;
  }
}

export async function reverseGeocodeViaNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address;
    if (!a) {
      const first = data?.display_name?.split(",")[0]?.trim();
      return first || null;
    }
    return (
      a.neighbourhood || a.suburb || a.quarter || a.road ||
      a.city_district || a.town || a.village || a.city || null
    );
  } catch (err) {
    console.error("Nominatim reverse geocode failed:", err);
    return null;
  }
}

export async function getAreaName(lat: number, lng: number): Promise<string | null> {
  const fromBackend = await reverseGeocodeViaBackend(lat, lng);
  if (fromBackend) return fromBackend;
  return reverseGeocodeViaNominatim(lat, lng);
}