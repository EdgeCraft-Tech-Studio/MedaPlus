import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import styles from "./css/FormPage.module.css";
import { BackArrowIcon, UsersIcon } from "./Icons";
import {
  FieldWrap, TextField, TextAreaField, SelectField, ChipGroup, SegmentedControl, LogoUpload,
} from "../components/FormControls";
import { createTeam } from "../lib/team";
import { api } from "../lib/api";

const SPORTS = [
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
  { value: "other", label: "Other" },
];

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const DAYS = [
  { value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" }, { value: "fri", label: "Fri" }, { value: "sat", label: "Sat" }, { value: "sun", label: "Sun" },
];

const PLAY_TIMES = [
  { value: "morning", label: "Morning (6–11)" },
  { value: "afternoon", label: "Afternoon (11–5)" },
  { value: "evening", label: "Evening (5–10)" },
];

const AGE_CATEGORIES = [
  { value: "open", label: "Open" },
  { value: "u18", label: "Under 18" },
  { value: "u21", label: "Under 21" },
  { value: "adult", label: "Adult" },
  { value: "other", label: "Other" },
];

const VISIBILITY = [
  { value: "public", label: "Public", hint: "Anyone can join" },
  { value: "private", label: "Private", hint: "Invite only" },
];

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 };

/* ---------------- icons ---------------- */

function MapPinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IdentityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
      <circle cx="12" cy="7.5" r="4" />
    </svg>
  );
}

function LocationStepIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </svg>
  );
}

function ScheduleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </svg>
  );
}

function MembershipIcon(props: React.SVGProps<SVGSVGElement>) {
  return <UsersIcon {...(props as any)} />;
}

/* ---------------- pin icon ---------------- */

function buildPinIcon() {
  const html = `
    <div class="team-pin">
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 1C7.8 1 1.2 7.4 1.2 15.4c0 9.8 14.8 23.6 14.8 23.6s14.8-13.8 14.8-23.6C30.8 7.4 24.2 1 16 1z"
          fill="var(--accent)" stroke="rgba(0,0,0,0.25)" stroke-width="1.2"/>
        <circle cx="16" cy="15.4" r="6.2" fill="#fff"/>
        <circle cx="16" cy="15.4" r="2.6" fill="var(--accent)"/>
      </svg>
    </div>`;
  return L.divIcon({ html, className: "team-pin-marker", iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -36] });
}

/* ---------------- reverse geocode ----------------
 * Tries the backend proxy first (keeps traffic off Nominatim directly
 * where possible). If that fails, doesn't return a usable name, or
 * the request errors for any reason, falls back to a direct client-side
 * Nominatim lookup — reading the structured `address` breakdown and
 * picking ONE clean local name, same working approach already used
 * elsewhere in this app, rather than the full comma-joined display_name.
 * As a last resort (both fail), returns null and the caller falls back
 * to showing raw coordinates so the field is never silently left blank.
 */
async function reverseGeocodeViaBackend(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await api.get("/geocode/reverse/", { params: { lat, lon: lng } });
    const area = res?.data?.area;
    return typeof area === "string" && area.trim() ? area.trim() : null;
  } catch (err) {
    console.error("Backend reverse geocode failed:", err);
    return null;
  }
}

async function reverseGeocodeViaNominatim(lat: number, lng: number): Promise<string | null> {
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

async function getAreaName(lat: number, lng: number): Promise<string | null> {
  const fromBackend = await reverseGeocodeViaBackend(lat, lng);
  if (fromBackend) return fromBackend;
  return reverseGeocodeViaNominatim(lat, lng);
}

/* ---------------- map internals ---------------- */

function LocationClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function MapFlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

/* ---------------- team location field ---------------- */

function TeamLocationField({
  latitude, longitude, area, onLocationChange,
}: {
  latitude: number | null;
  longitude: number | null;
  area: string;
  onLocationChange: (lat: number, lng: number, area: string) => void;
}) {
  const [geocoding, setGeocoding] = useState(false);
  const center = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : ADDIS_ABABA;

  async function handlePick(lat: number, lng: number) {
    setGeocoding(true);
    const name = await getAreaName(lat, lng);
    setGeocoding(false);
    // Always commit the pin, even if BOTH geocode attempts failed — the
    // user should never lose their pin placement. Fall back to raw
    // coordinates rather than leaving the area name blank with no clue.
    onLocationChange(lat, lng, name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }

  return (
    <div className={styles.mapField}>
      <div className={styles.mapBox}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={latitude != null ? 15 : 12}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <LocationClickHandler onPick={handlePick} />
          <MapFlyTo lat={latitude} lng={longitude} />
          {latitude != null && longitude != null && (
            <Marker
              position={[latitude, longitude]}
              icon={buildPinIcon()}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = (e.target as L.Marker).getLatLng();
                  handlePick(m.lat, m.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {latitude != null && longitude != null ? (
        <div className={styles.mapConfirm}>
          <span className={styles.mapConfirmIcon}><MapPinIcon size={15} /></span>
          <div className={styles.mapConfirmInfo}>
            <div className={styles.mapConfirmLabel}>Home ground</div>
            <div className={styles.mapConfirmValue}>
              {geocoding ? "Finding the area name…" : (area || "Pin dropped — name it below")}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.mapEmpty}>
          <MapPinIcon size={14} />
          Tap the map to drop a pin on your home ground — drag it to fine-tune
        </div>
      )}
    </div>
  );
}

/* ---------------- form state ---------------- */

interface FormState {
  name: string;
  logo: string | null;
  logoFile: File | null;
  description: string;
  sport: string;
  sportOther: string;
  homeArea: string;
  latitude: number | null;
  longitude: number | null;
  skillLevel: string;
  preferredDays: string[];
  playTime: string;
  ageCategory: string;
  capacity: string;
  visibility: string;
}

const initialState: FormState = {
  name: "", logo: null, logoFile: null, description: "", sport: "", sportOther: "",
  homeArea: "", latitude: null, longitude: null, skillLevel: "", preferredDays: [], playTime: "",
  ageCategory: "open", capacity: "", visibility: "public",
};

type StepNum = 1 | 2 | 3 | 4;

const STEP_META: Array<{ num: StepNum; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement }> = [
  { num: 1, label: "Identity", Icon: IdentityIcon },
  { num: 2, label: "Sport & ground", Icon: LocationStepIcon },
  { num: 3, label: "Schedule", Icon: ScheduleIcon },
  { num: 4, label: "Membership", Icon: MembershipIcon },
];

export default function CreateTeam() {
  const nav = useNavigate();
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitErr, setSubmitErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<StepNum>(1);
  const [maxStepReached, setMaxStepReached] = useState<StepNum>(1);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function handleLocationChange(lat: number, lng: number, areaName: string) {
    setForm((f) => ({ ...f, latitude: lat, longitude: lng, homeArea: areaName || f.homeArea }));
    if (errors.homeArea) setErrors((e) => ({ ...e, homeArea: undefined }));
  }

  function validateStep(target: StepNum): Partial<Record<keyof FormState, string>> {
    const e: Partial<Record<keyof FormState, string>> = {};

    if (target === 1) {
      if (!form.name.trim()) e.name = "Team name is required.";
      else if (form.name.trim().length < 3) e.name = "Team name must be at least 3 characters.";
      else if (form.name.trim().length > 40) e.name = "Team name must be under 40 characters.";
      if (form.description.length > 220) e.description = "Keep the description under 220 characters.";
    }

    if (target === 2) {
      if (!form.sport) e.sport = "Choose a sport.";
      if (form.sport === "other" && !form.sportOther.trim()) e.sportOther = "Tell us which sport.";
      if (form.latitude == null || form.longitude == null || !form.homeArea.trim()) {
        e.homeArea = "Select your team's home ground on the map, then confirm the area name.";
      }
    }

    if (target === 3) {
      if (!form.skillLevel) e.skillLevel = "Choose a skill level.";
    }

    if (target === 4) {
      if (!form.capacity) e.capacity = "Capacity is required.";
      else if (!/^\d+$/.test(form.capacity)) e.capacity = "Capacity must be a whole number.";
      else if (Number(form.capacity) < 2) e.capacity = "A team needs at least 2 members.";
      else if (Number(form.capacity) > 100) e.capacity = "Capacity can't exceed 100.";
      if (!form.visibility) e.visibility = "Choose a visibility mode.";
    }

    return e;
  }

  function goNext() {
    const v = validateStep(step);
    setErrors((prev) => ({ ...prev, ...v }));
    if (Object.keys(v).length > 0) return;
    const next = Math.min(4, step + 1) as StepNum;
    setStep(next);
    setMaxStepReached((m) => (m >= next ? m : next));
  }

  function goBack() {
    if (step === 1) return;
    setStep((s) => (s - 1) as StepNum);
  }

  function goToStep(target: StepNum) {
    if (target > maxStepReached || target === step) return;
    setStep(target);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr("");

    const allErrors = {
      ...validateStep(1), ...validateStep(2), ...validateStep(3), ...validateStep(4),
    };
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      const firstBadStep = STEP_META.find((_, i) => {
        const stepNum = (i + 1) as StepNum;
        return Object.keys(validateStep(stepNum)).length > 0;
      });
      if (firstBadStep) setStep(firstBadStep.num);
      return;
    }

    setLoading(true);
    try {
      const { slug } = await createTeam({
        name: form.name.trim(),
        description: form.description.trim(),
        sport: form.sport === "other" ? form.sportOther.trim() : form.sport,
        area: form.homeArea.trim(),
        latitude: form.latitude as number,
        longitude: form.longitude as number,
        skill_level: form.skillLevel,
        preferred_days: form.preferredDays,
        play_time: form.playTime,
        age_category: form.ageCategory,
        max_roster_size: Number(form.capacity),
        visibility: form.visibility,
        logoFile: form.logoFile,
      });
      nav(`/teams/${slug}`);
    } catch (err: any) {
      if (err.response?.status === 400) {
        const raw = err.response.data as Record<string, string[]>;
        const flat: Partial<Record<keyof FormState, string>> = {};
        Object.entries(raw).forEach(([key, msgs]) => {
          const k = (key === "latitude" || key === "longitude") ? "homeArea" : (key as keyof FormState);
          flat[k] = Array.isArray(msgs) ? msgs[0] : String(msgs);
        });
        setErrors(flat);
      } else {
        setSubmitErr("Couldn't create the team. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} data-accent="team">
      <header className={styles.hero}>
        <svg className={styles.heroArt} viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <line x1="300" y1="0" x2="300" y2="200" stroke="white" strokeWidth="1.5" opacity="0.14" />
          <circle cx="300" cy="100" r="56" fill="none" stroke="white" strokeWidth="1.5" opacity="0.14" />
        </svg>

        <Link to="/home" className={styles.backLink}>
          <BackArrowIcon width={14} height={14} />
          Back to menu
        </Link>

        <div className={styles.heroIconBadge}>
          <UsersIcon width={24} height={24} />
        </div>
        <span className={styles.eyebrow}>New team</span>
        <h1 className={styles.heroTitle}>Build your squad</h1>
        <p className={styles.heroSubtitle}>
          Give your team an identity, set who can join, and start inviting players.
        </p>
      </header>

      <main className={styles.main}>
        <form className={styles.formCard} onSubmit={onSubmit} noValidate>
          {submitErr && <div className={styles.errorBanner}>{submitErr}</div>}

          {/* ---------------- step progress ---------------- */}
          <div className={styles.stepTabs}>
            {STEP_META.map((meta) => {
              const isActive = meta.num === step;
              const isDone = meta.num < step || (meta.num < maxStepReached && meta.num !== step);
              const isClickable = meta.num <= maxStepReached && meta.num !== step;
              return (
                <button
                  key={meta.num}
                  type="button"
                  onClick={() => goToStep(meta.num)}
                  disabled={!isClickable}
                  className={`${styles.stepTab} ${isActive ? styles.stepTabActive : ""} ${isDone ? styles.stepTabDone : ""}`}
                >
                  <span className={styles.stepTabDot}>
                    {isDone ? <CheckIcon width={11} height={11} /> : <meta.Icon width={13} height={13} />}
                  </span>
                  <span className={styles.stepTabLabel}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* ---------------- step 1: identity ---------------- */}
          {step === 1 && (
            <div className={styles.stepContent}>
              <FieldWrap label="Team name" htmlFor="t-name" required error={errors.name}>
                <TextField id="t-name" value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Bole United" error={errors.name} disabled={loading} />
              </FieldWrap>

              <FieldWrap label="Team logo">
                <LogoUpload value={form.logo} onChange={(v) => set("logo", v)} onFileChange={(f) => set("logoFile", f)} />
              </FieldWrap>

              <FieldWrap label="Short description" htmlFor="t-desc" error={errors.description} hint="Optional — what makes your team, your team?">
                <TextAreaField id="t-desc" value={form.description} onChange={(v) => set("description", v)} placeholder="Weekend 7-a-side crew, big on passing, low on drama." maxLength={220} disabled={loading} error={errors.description} />
              </FieldWrap>
            </div>
          )}

          {/* ---------------- step 2: sport & home ground ---------------- */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <FieldWrap label="Sport" htmlFor="t-sport" required error={errors.sport}>
                <SelectField id="t-sport" value={form.sport} onChange={(v) => set("sport", v)} options={SPORTS} placeholder="Select sport" error={errors.sport} disabled={loading} />
              </FieldWrap>

              {form.sport === "other" && (
                <FieldWrap label="Which sport?" htmlFor="t-sport-other" required error={errors.sportOther}>
                  <TextField id="t-sport-other" value={form.sportOther} onChange={(v) => set("sportOther", v)} placeholder="e.g. Futsal" error={errors.sportOther} disabled={loading} />
                </FieldWrap>
              )}

              <FieldWrap label="Home ground" required hint="Tap the map to drop a pin where your team plays.">
                <TeamLocationField
                  latitude={form.latitude}
                  longitude={form.longitude}
                  area={form.homeArea}
                  onLocationChange={handleLocationChange}
                />
              </FieldWrap>

              <FieldWrap label="Area name" htmlFor="t-area" required error={errors.homeArea} hint="Auto-filled from the map — edit if it's not quite right.">
                <TextField id="t-area" value={form.homeArea} onChange={(v) => set("homeArea", v)} placeholder="e.g. Bole" error={errors.homeArea} disabled={loading} />
              </FieldWrap>
            </div>
          )}

          {/* ---------------- step 3: level & schedule ---------------- */}
          {step === 3 && (
            <div className={styles.stepContent}>
              <FieldWrap label="Skill level" required error={errors.skillLevel}>
                <ChipGroup options={SKILL_LEVELS} value={form.skillLevel} onChange={(v) => set("skillLevel", v)} disabled={loading} />
              </FieldWrap>

              <FieldWrap label="Preferred days" hint="Optional — helps teammates know when you usually play.">
                <ChipGroup options={DAYS} value={form.preferredDays} onChange={(v) => set("preferredDays", v)} multi disabled={loading} />
              </FieldWrap>

              <div className={styles.row2}>
                <FieldWrap label="Usual playing time" htmlFor="t-time">
                  <SelectField id="t-time" value={form.playTime} onChange={(v) => set("playTime", v)} options={PLAY_TIMES} placeholder="Optional" disabled={loading} />
                </FieldWrap>
                <FieldWrap label="Age category" htmlFor="t-age">
                  <SelectField id="t-age" value={form.ageCategory} onChange={(v) => set("ageCategory", v)} options={AGE_CATEGORIES} disabled={loading} />
                </FieldWrap>
              </div>
            </div>
          )}

          {/* ---------------- step 4: membership ---------------- */}
          {step === 4 && (
            <div className={styles.stepContent}>
              <FieldWrap label="Capacity" htmlFor="t-cap" required error={errors.capacity} hint="Maximum number of active members.">
                <TextField id="t-cap" type="number" min={2} max={100} value={form.capacity} onChange={(v) => set("capacity", v)} placeholder="e.g. 18" error={errors.capacity} disabled={loading} />
              </FieldWrap>

              <FieldWrap label="Visibility" required error={errors.visibility}>
                <SegmentedControl options={VISIBILITY} value={form.visibility} onChange={(v) => set("visibility", v)} disabled={loading} />
              </FieldWrap>
            </div>
          )}

          {/* ---------------- footer nav ---------------- */}
          <div className={styles.wizardFooter}>
            <button type="button" className={styles.footerBtnGhost} onClick={goBack} disabled={step === 1}>
              Back
            </button>
            <span className={styles.footerProgress}>Step {step} of 4</span>
            {step < 4 ? (
              <button type="button" className={styles.footerBtnPrimary} onClick={goNext}>Next</button>
            ) : (
              <button type="submit" className={styles.footerBtnPrimary} disabled={loading}>
                {loading ? "Creating team..." : "Create team"}
              </button>
            )}
          </div>

          <p className={styles.footerNote}>You'll be the team owner and can change any of this later.</p>
        </form>
      </main>
    </div>
  );
}