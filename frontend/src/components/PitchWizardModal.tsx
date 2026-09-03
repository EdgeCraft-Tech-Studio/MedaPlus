import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import styles from "../pages/css/PitchWizardModal.module.css";
import type { SportType } from "../lib/pitches";

type OwnerOption = {
  id: string;
  username: string;
  is_approved?: boolean;
};

type InitialPitchData = {
  id?: string;
  owner_id?: string;
  name?: string;
  sport_type?: SportType;
  address?: string;
  latitude?: number;
  longitude?: number;
  opening_time?: string;
  closing_time?: string;
  hourly_price?: string;
  weekly_price?: string;
  monthly_price?: string;
  min_hours?: number;
  allow_hourly?: boolean;
  allow_weekly?: boolean;
  allow_monthly?: boolean;
  has_dressing_room?: boolean;
  has_showers?: boolean;
  has_parking?: boolean;
  has_lighting?: boolean;
  other_services?: string;
  images?: { id: string; url: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  owners?: OwnerOption[];
  onSubmit: (payload: FormData) => Promise<void> | void;
  mode?: "create" | "edit";
  initialData?: InitialPitchData | null;
};

type StepNum = 1 | 2 | 3 | 4;

type ImageItem =
  | { id: string; kind: "new"; file: File; url: string }
  | { id: string; kind: "existing"; imageId: string; url: string };

type PersistedImage = {
  name: string;
  type: string;
  dataUrl: string;
};

type TimeRange = { id: string; start: string; end: string };
type SlotDateEntry = { id: string; date: string; ranges: TimeRange[] };

function newRange(start = "08:00", end = "10:00"): TimeRange {
  return { id: Math.random().toString(36).slice(2), start, end };
}
function newDateEntry(): SlotDateEntry {
  return { id: Math.random().toString(36).slice(2), date: "", ranges: [newRange()] };
}

function meaningfulSlotEntries(entries: SlotDateEntry[]): SlotDateEntry[] {
  return entries
    .map((e) => ({
      ...e,
      ranges: e.ranges.filter((r) => r.start && r.end),
    }))
    .filter((e) => e.date && e.ranges.length > 0);
}

function serializeSlots(entries: SlotDateEntry[]): string {
  const trimmed = meaningfulSlotEntries(entries).map((e) => ({
    date: e.date,
    ranges: e.ranges.map((r) => ({ start: r.start, end: r.end })),
  }));
  return JSON.stringify(trimmed);
}

type DraftShape = {
  savedAt: number;
  step: StepNum;
  maxStepReached: StepNum;
  ownerId: string;
  name: string;
  sportType: SportType;
  address: string;
  openingTime: string;
  closingTime: string;
  hourly: string;
  weekly: string;
  monthly: string;
  minHours: string;
  allowHourly: boolean;
  allowWeekly: boolean;
  allowMonthly: boolean;
  dressing: boolean;
  showers: boolean;
  parking: boolean;
  lighting: boolean;
  services: string;
  slotEntries: SlotDateEntry[];
  lat: number;
  lng: number;
  images: PersistedImage[];
  removedImageIds: string[];
};

type FieldSnapshot = Omit<DraftShape, "savedAt" | "step" | "maxStepReached" | "images" | "slotEntries"> & {
  newImageCount: number;
  slotsSignature: string;
};

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 };

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, "0")}:00`;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { value, label: `${hour12}:00 ${suffix}` };
});

function normalizeTime(value?: string) {
  if (!value) return "";
  return value.slice(0, 5);
}

function draftKey(mode: "create" | "edit", initialData?: InitialPitchData | null) {
  return `pitchWizardDraft:${mode}:${initialData?.id ?? "new"}`;
}

function buildBaseline(
  mode: "create" | "edit",
  data?: InitialPitchData | null
): FieldSnapshot {
  const shared = {
    slotsSignature: "[]",
    newImageCount: 0,
    removedImageIds: [] as string[],
  };

  if (mode === "edit") {
    return {
      ownerId: data?.owner_id || "",
      name: data?.name || "",
      sportType: data?.sport_type ?? "FOOTBALL",
      address: data?.address || "",
      openingTime: normalizeTime(data?.opening_time) || "08:00",
      closingTime: normalizeTime(data?.closing_time) || "22:00",
      hourly: data?.hourly_price ?? "0",
      weekly: data?.weekly_price ?? "0",
      monthly: data?.monthly_price ?? "0",
      minHours: String(data?.min_hours ?? 1),
      allowHourly: data?.allow_hourly ?? true,
      allowWeekly: data?.allow_weekly ?? false,
      allowMonthly: data?.allow_monthly ?? false,
      dressing: data?.has_dressing_room ?? false,
      showers: data?.has_showers ?? false,
      parking: data?.has_parking ?? false,
      lighting: data?.has_lighting ?? false,
      services: data?.other_services || "",
      lat: data?.latitude ?? ADDIS_ABABA.lat,
      lng: data?.longitude ?? ADDIS_ABABA.lng,
      ...shared,
    };
  }

  return {
    ownerId: "",
    name: "",
    sportType: "FOOTBALL",
    address: "",
    openingTime: "08:00",
    closingTime: "22:00",
    hourly: "0",
    weekly: "0",
    monthly: "0",
    minHours: "1",
    allowHourly: true,
    allowWeekly: false,
    allowMonthly: false,
    dressing: false,
    showers: false,
    parking: false,
    lighting: false,
    services: "",
    lat: ADDIS_ABABA.lat,
    lng: ADDIS_ABABA.lng,
    ...shared,
  };
}

function isMeaningfulSnapshot(snapshot: FieldSnapshot, baseline: FieldSnapshot) {
  return (
    snapshot.ownerId !== baseline.ownerId ||
    snapshot.name !== baseline.name ||
    snapshot.sportType !== baseline.sportType ||
    snapshot.address !== baseline.address ||
    snapshot.openingTime !== baseline.openingTime ||
    snapshot.closingTime !== baseline.closingTime ||
    snapshot.hourly !== baseline.hourly ||
    snapshot.weekly !== baseline.weekly ||
    snapshot.monthly !== baseline.monthly ||
    snapshot.minHours !== baseline.minHours ||
    snapshot.allowHourly !== baseline.allowHourly ||
    snapshot.allowWeekly !== baseline.allowWeekly ||
    snapshot.allowMonthly !== baseline.allowMonthly ||
    snapshot.dressing !== baseline.dressing ||
    snapshot.showers !== baseline.showers ||
    snapshot.parking !== baseline.parking ||
    snapshot.lighting !== baseline.lighting ||
    snapshot.services !== baseline.services ||
    snapshot.lat !== baseline.lat ||
    snapshot.lng !== baseline.lng ||
    snapshot.removedImageIds.length > 0 ||
    snapshot.newImageCount > 0 ||
    snapshot.slotsSignature !== baseline.slotsSignature
  );
}

function buildExistingImages(
  data?: InitialPitchData | null,
  excludeIds: string[] = []
): ImageItem[] {
  const imgs = data?.images || [];
  return imgs
    .filter((img) => Boolean(img?.url) && !excludeIds.includes(img.id))
    .map((img) => ({
      id: `existing-${img.id}`,
      kind: "existing" as const,
      imageId: img.id,
      url: img.url,
    }));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(persisted: PersistedImage): Promise<ImageItem> {
  const res = await fetch(persisted.dataUrl);
  const blob = await res.blob();
  const file = new File([blob], persisted.name, { type: persisted.type });
  return {
    id: `${persisted.name}-${Math.random().toString(36).slice(2)}`,
    kind: "new",
    file,
    url: URL.createObjectURL(file),
  };
}

/**
 * Returns ONE short place name (e.g. "Bole"), not a full comma-separated
 * address string. Nominatim's `display_name` is the full formatted
 * address on purpose — reading it directly is what produced the
 * "Bole, Addis Ababa, Addis Ababa, Ethiopia" style output. Instead this
 * reads the structured `address` breakdown (addressdetails=1) and picks
 * the single most locally-meaningful component, falling back down the
 * chain toward broader area names only if nothing granular exists.
 */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
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
      a.neighbourhood ||
      a.suburb ||
      a.quarter ||
      a.road ||
      a.city_district ||
      a.town ||
      a.village ||
      a.city ||
      null
    );
  } catch {
    return null;
  }
}

function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return (
    <Marker
      position={[lat, lng]}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          onChange(pos.lat, pos.lng);
        },
      }}
    />
  );
}

/* ---------- icons ---------- */

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M11 12h1v5h1" />
    </svg>
  );
}
function TagIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M20.59 13.41 12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.3" />
    </svg>
  );
}
function SparkleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </svg>
  );
}
function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.3" />
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
function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PhotoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5" strokeLinecap="round" />
      <path d="M4 17l4.5-4.5a2 2 0 0 1 2.8 0L15 16l1.7-1.7a2 2 0 0 1 2.8 0L21 16.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M3 19h18" strokeLinecap="round" />
    </svg>
  );
}

const STEP_META: Array<{
  num: StepNum;
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}> = [
  { num: 1, label: "Basics", Icon: InfoIcon },
  { num: 2, label: "Pricing", Icon: TagIcon },
  { num: 3, label: "Amenities", Icon: SparkleIcon },
  { num: 4, label: "Location", Icon: PinIcon },
];

export default function PitchWizardModal({
  open,
  onClose,
  onSubmit,
  isAdmin = false,
  owners = [],
  mode = "create",
  initialData = null,
}: Props) {
  const [step, setStep] = useState<StepNum>(1);
  const [maxStepReached, setMaxStepReached] = useState<StepNum>(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [sportType, setSportType] = useState<SportType>("FOOTBALL");

  const [openingTime, setOpeningTime] = useState("08:00");
  const [closingTime, setClosingTime] = useState("22:00");

  const [hourly, setHourly] = useState("0");
  const [weekly, setWeekly] = useState("0");
  const [monthly, setMonthly] = useState("0");

  const [minHours, setMinHours] = useState("1");
  const [allowHourly, setAllowHourly] = useState(true);
  const [allowWeekly, setAllowWeekly] = useState(false);
  const [allowMonthly, setAllowMonthly] = useState(false);

  const [dressing, setDressing] = useState(false);
  const [showers, setShowers] = useState(false);
  const [parking, setParking] = useState(false);
  const [lighting, setLighting] = useState(false);
  const [services, setServices] = useState("");

  const [slotEntries, setSlotEntries] = useState<SlotDateEntry[]>([newDateEntry()]);
  const [geocoding, setGeocoding] = useState(false);
  const [addressTouchedManually, setAddressTouchedManually] = useState(false);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const [lat, setLat] = useState(ADDIS_ABABA.lat);
  const [lng, setLng] = useState(ADDIS_ABABA.lng);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodePromiseRef = useRef<Promise<void> | null>(null);

  const approvedOwners = useMemo(() => {
    return owners.filter((o) => o.is_approved !== false);
  }, [owners]);

  function revokeAllPreviews() {
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
  }

  function applyCreateDefaults() {
    skipNextSave.current = true;
    setStep(1);
    setMaxStepReached(1);
    setError("");
    setDraftRestored(false);
    setOwnerId("");
    setName("");
    setSportType("FOOTBALL");
    setAddress("");
    setAddressTouchedManually(false);
    setOpeningTime("08:00");
    setClosingTime("22:00");
    setHourly("0");
    setWeekly("0");
    setMonthly("0");
    setMinHours("1");
    setAllowHourly(true);
    setAllowWeekly(false);
    setAllowMonthly(false);
    setDressing(false);
    setShowers(false);
    setParking(false);
    setLighting(false);
    setServices("");
    setSlotEntries([newDateEntry()]);
    revokeAllPreviews();
    setImages([]);
    setRemovedImageIds([]);
    setLat(ADDIS_ABABA.lat);
    setLng(ADDIS_ABABA.lng);
  }

  function applyInitialData(data?: InitialPitchData | null) {
    skipNextSave.current = true;
    setStep(1);
    setMaxStepReached(1);
    setError("");
    setDraftRestored(false);
    setOwnerId(data?.owner_id || "");
    setName(data?.name || "");
    setSportType(data?.sport_type ?? "FOOTBALL");
    setAddress(data?.address || "");
    setAddressTouchedManually(Boolean(data?.address));
    setOpeningTime(normalizeTime(data?.opening_time) || "08:00");
    setClosingTime(normalizeTime(data?.closing_time) || "22:00");
    setHourly(data?.hourly_price ?? "0");
    setWeekly(data?.weekly_price ?? "0");
    setMonthly(data?.monthly_price ?? "0");
    setMinHours(String(data?.min_hours ?? 1));
    setAllowHourly(data?.allow_hourly ?? true);
    setAllowWeekly(data?.allow_weekly ?? false);
    setAllowMonthly(data?.allow_monthly ?? false);
    setDressing(data?.has_dressing_room ?? false);
    setShowers(data?.has_showers ?? false);
    setParking(data?.has_parking ?? false);
    setLighting(data?.has_lighting ?? false);
    setServices(data?.other_services || "");
    setSlotEntries([newDateEntry()]);
    revokeAllPreviews();
    setImages(buildExistingImages(data));
    setRemovedImageIds([]);
    setLat(data?.latitude ?? ADDIS_ABABA.lat);
    setLng(data?.longitude ?? ADDIS_ABABA.lng);
  }

  function applyDraft(draft: DraftShape, restoredImages: ImageItem[]) {
    skipNextSave.current = true;
    setStep(draft.step ?? 1);
    setMaxStepReached(draft.maxStepReached ?? draft.step ?? 1);
    setOwnerId(draft.ownerId ?? "");
    setName(draft.name ?? "");
    setSportType(draft.sportType ?? "FOOTBALL");
    setAddress(draft.address ?? "");
    setAddressTouchedManually(Boolean(draft.address));
    setOpeningTime(draft.openingTime ?? "08:00");
    setClosingTime(draft.closingTime ?? "22:00");
    setHourly(draft.hourly ?? "0");
    setWeekly(draft.weekly ?? "0");
    setMonthly(draft.monthly ?? "0");
    setMinHours(draft.minHours ?? "1");
    setAllowHourly(draft.allowHourly ?? true);
    setAllowWeekly(draft.allowWeekly ?? false);
    setAllowMonthly(draft.allowMonthly ?? false);
    setDressing(draft.dressing ?? false);
    setShowers(draft.showers ?? false);
    setParking(draft.parking ?? false);
    setLighting(draft.lighting ?? false);
    setServices(draft.services ?? "");
    setSlotEntries(
      draft.slotEntries && draft.slotEntries.length > 0 ? draft.slotEntries : [newDateEntry()]
    );
    setLat(draft.lat ?? ADDIS_ABABA.lat);
    setLng(draft.lng ?? ADDIS_ABABA.lng);
    setRemovedImageIds(draft.removedImageIds ?? []);
    revokeAllPreviews();
    objectUrlsRef.current = restoredImages
      .filter((i): i is Extract<ImageItem, { kind: "new" }> => i.kind === "new")
      .map((i) => i.url);
    setImages(restoredImages);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      const key = draftKey(mode, initialData);
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        raw = null;
      }

      if (raw) {
        try {
          const draft: DraftShape = JSON.parse(raw);
          const baseline = buildBaseline(mode, initialData);
          const snapshot: FieldSnapshot = {
            ownerId: draft.ownerId ?? "",
            name: draft.name ?? "",
            sportType: draft.sportType ?? "FOOTBALL",
            address: draft.address ?? "",
            openingTime: draft.openingTime ?? "08:00",
            closingTime: draft.closingTime ?? "22:00",
            hourly: draft.hourly ?? "0",
            weekly: draft.weekly ?? "0",
            monthly: draft.monthly ?? "0",
            minHours: draft.minHours ?? "1",
            allowHourly: draft.allowHourly ?? true,
            allowWeekly: draft.allowWeekly ?? false,
            allowMonthly: draft.allowMonthly ?? false,
            dressing: draft.dressing ?? false,
            showers: draft.showers ?? false,
            parking: draft.parking ?? false,
            lighting: draft.lighting ?? false,
            services: draft.services ?? "",
            lat: draft.lat ?? ADDIS_ABABA.lat,
            lng: draft.lng ?? ADDIS_ABABA.lng,
            removedImageIds: draft.removedImageIds ?? [],
            newImageCount: (draft.images || []).length,
            slotsSignature: serializeSlots(draft.slotEntries ?? []),
          };

          if (!isMeaningfulSnapshot(snapshot, baseline)) {
            try {
              localStorage.removeItem(key);
            } catch {
              // ignore
            }
            if (mode === "edit") applyInitialData(initialData);
            else applyCreateDefaults();
            return;
          }

          const restoredNewImages = await Promise.all(
            (draft.images || []).map((img) => dataUrlToFile(img))
          );
          const existingImages = buildExistingImages(initialData, draft.removedImageIds || []);
          if (!cancelled) {
            applyDraft(draft, [...existingImages, ...restoredNewImages]);
            setDraftRestored(true);
          }
          return;
        } catch {
          // fall through to defaults if the draft is corrupted
        }
      }

      if (mode === "edit") applyInitialData(initialData);
      else applyCreateDefaults();
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialData]);

  useEffect(() => {
    if (!open) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      const key = draftKey(mode, initialData);
      const baseline = buildBaseline(mode, initialData);
      const newImages = images.filter(
        (img): img is Extract<ImageItem, { kind: "new" }> => img.kind === "new"
      );

      const snapshot: FieldSnapshot = {
        ownerId,
        name,
        sportType,
        address,
        openingTime,
        closingTime,
        hourly,
        weekly,
        monthly,
        minHours,
        allowHourly,
        allowWeekly,
        allowMonthly,
        dressing,
        showers,
        parking,
        lighting,
        services,
        lat,
        lng,
        removedImageIds,
        newImageCount: newImages.length,
        slotsSignature: serializeSlots(slotEntries),
      };

      if (!isMeaningfulSnapshot(snapshot, baseline)) {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
        return;
      }

      try {
        const persistedImages: PersistedImage[] = await Promise.all(
          newImages.map(async (img) => ({
            name: img.file.name,
            type: img.file.type,
            dataUrl: await fileToDataUrl(img.file),
          }))
        );

        const draft: DraftShape = {
          savedAt: Date.now(),
          step,
          maxStepReached,
          ownerId,
          name,
          sportType,
          address,
          openingTime,
          closingTime,
          hourly,
          weekly,
          monthly,
          minHours,
          allowHourly,
          allowWeekly,
          allowMonthly,
          dressing,
          showers,
          parking,
          lighting,
          services,
          slotEntries,
          lat,
          lng,
          images: persistedImages,
          removedImageIds,
        };

        try {
          localStorage.setItem(key, JSON.stringify(draft));
        } catch {
          try {
            localStorage.setItem(key, JSON.stringify({ ...draft, images: [] }));
          } catch {
            // give up silently
          }
        }
      } catch {
        // ignore transient conversion errors
      }
    }, 500);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    step,
    maxStepReached,
    ownerId,
    name,
    sportType,
    address,
    openingTime,
    closingTime,
    hourly,
    weekly,
    monthly,
    minHours,
    allowHourly,
    allowWeekly,
    allowMonthly,
    dressing,
    showers,
    parking,
    lighting,
    services,
    slotEntries,
    lat,
    lng,
    images,
    removedImageIds,
  ]);

  useEffect(() => {
    return () => revokeAllPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey(mode, initialData));
    } catch {
      // ignore
    }
  }

  function handleClose() {
    onClose();
    if (mode === "edit") applyInitialData(initialData);
    else applyCreateDefaults();
  }

  function discardDraft() {
    clearDraft();
    setDraftRestored(false);
    if (mode === "edit") applyInitialData(initialData);
    else applyCreateDefaults();
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const newItems: ImageItem[] = Array.from(fileList).map((file) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        kind: "new",
        file,
        url,
      };
    });
    setImages((prev) => [...prev, ...newItems]);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target && target.kind === "new") {
        URL.revokeObjectURL(target.url);
        objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== target.url);
      }
      if (target && target.kind === "existing") {
        setRemovedImageIds((prevIds) =>
          prevIds.includes(target.imageId) ? prevIds : [...prevIds, target.imageId]
        );
      }
      return prev.filter((i) => i.id !== id);
    });
    setLightboxId((cur) => (cur === id ? null : cur));
  }

  function toggleLightbox(id: string) {
    setLightboxId((cur) => (cur === id ? null : id));
  }

  useEffect(() => {
    if (!lightboxId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxId]);

  function handleAddressInput(value: string) {
    setAddress(value);
    setAddressTouchedManually(true);
  }

  function handleLocationSelected(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);

    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);

    const promise = new Promise<void>((resolve) => {
      geocodeTimer.current = setTimeout(async () => {
        setGeocoding(true);
        const result = await reverseGeocode(newLat, newLng);
        setGeocoding(false);

        if (result) {
          setAddress((prev) => (addressTouchedManually && prev ? prev : result));
        } else if (!addressTouchedManually) {
          setAddress((prev) => prev || `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);
        }
        resolve();
      }, 400);
    });

    geocodePromiseRef.current = promise;
  }

  function addDateEntry() {
    setSlotEntries((prev) => [...prev, newDateEntry()]);
  }
  function removeDateEntry(id: string) {
    setSlotEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)));
  }
  function updateDateEntry(id: string, date: string) {
    setSlotEntries((prev) => prev.map((e) => (e.id === id ? { ...e, date } : e)));
  }
  function addRange(dateId: string) {
    setSlotEntries((prev) =>
      prev.map((e) => (e.id === dateId ? { ...e, ranges: [...e.ranges, newRange()] } : e))
    );
  }
  function removeRange(dateId: string, rangeId: string) {
    setSlotEntries((prev) =>
      prev.map((e) =>
        e.id === dateId
          ? { ...e, ranges: e.ranges.length <= 1 ? e.ranges : e.ranges.filter((r) => r.id !== rangeId) }
          : e
      )
    );
  }
  function updateRange(dateId: string, rangeId: string, field: "start" | "end", value: string) {
    setSlotEntries((prev) =>
      prev.map((e) =>
        e.id === dateId
          ? {
              ...e,
              ranges: e.ranges.map((r) => (r.id === rangeId ? { ...r, [field]: value } : r)),
            }
          : e
      )
    );
  }

  function validateStep(target: StepNum): boolean {
    setError("");

    if (target === 1) {
      if (mode === "create" && isAdmin && !ownerId) {
        setError("Please select an owner.");
        return false;
      }
      if (!name.trim()) {
        setError("Pitch name is required.");
        return false;
      }
      if (images.length < 1) {
        setError("At least one pitch image is required.");
        return false;
      }
      if (openingTime >= closingTime) {
        setError("Closing time must be later than opening time.");
        return false;
      }
      return true;
    }

    if (target === 2) {
      const h = Number(hourly);
      const w = Number(weekly);
      const m = Number(monthly);
      if ([h, w, m].some((x) => Number.isNaN(x) || x < 0)) {
        setError("Prices must be valid numbers.");
        return false;
      }
      const mh = Number(minHours);
      if (Number.isNaN(mh) || mh < 1) {
        setError("Minimum hours must be at least 1.");
        return false;
      }
      for (const entry of slotEntries) {
        if (!entry.date) continue;
        for (const r of entry.ranges) {
          if (r.start && r.end && r.start >= r.end) {
            setError(`On ${entry.date}, each time range's end must be after its start.`);
            return false;
          }
        }
      }
      return true;
    }

    if (target === 4) {
      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        setError("Please set the pitch location on the map.");
        return false;
      }
      if (!address.trim()) {
        setError("Address is required — pick a spot on the map or type one in.");
        return false;
      }
      return true;
    }

    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    const next = Math.min(4, step + 1) as StepNum;
    setStep(next);
    setMaxStepReached((m) => (m >= next ? m : next));
  }

  function goBack() {
    if (step === 1) {
      handleClose();
      return;
    }
    setError("");
    setStep((s) => (s - 1) as StepNum);
  }

  function goToStep(target: StepNum) {
    if (target > maxStepReached || target === step) return;
    setError("");
    setStep(target);
  }

  async function finish() {
    if (geocodePromiseRef.current) {
      await geocodePromiseRef.current;
    }

    if (!validateStep(4)) return;

    setError("");
    setSubmitting(true);

    const formData = new FormData();

    if (mode === "create" && isAdmin) {
      formData.append("owner_id", ownerId);
    }

    formData.append("name", name);
    formData.append("sport_type", sportType);
    formData.append("address", address.trim());
    formData.append("latitude", String(lat));
    formData.append("longitude", String(lng));
    formData.append("opening_time", openingTime);
    formData.append("closing_time", closingTime);

    formData.append("min_hours", minHours);
    formData.append("allow_hourly", String(allowHourly));
    formData.append("allow_weekly", String(allowWeekly));
    formData.append("allow_monthly", String(allowMonthly));

    formData.append("hourly_price", hourly);
    formData.append("weekly_price", weekly);
    formData.append("monthly_price", monthly);

    formData.append("has_dressing_room", String(dressing));
    formData.append("has_showers", String(showers));
    formData.append("has_parking", String(parking));
    formData.append("has_lighting", String(lighting));
    formData.append("other_services", services);

    if (mode === "create") {
      const payload = meaningfulSlotEntries(slotEntries).map((e) => ({
        date: e.date,
        ranges: e.ranges.map((r) => ({ start: r.start, end: r.end })),
      }));
      if (payload.length > 0) {
        formData.append("initial_slots", JSON.stringify(payload));
      }
    }

    for (const image of images) {
      if (image.kind === "new") {
        formData.append("images", image.file);
      }
    }

    if (mode === "edit") {
      for (const removedId of removedImageIds) {
        formData.append("removed_image_ids", removedId);
      }
    }

    try {
      await onSubmit(formData);
      clearDraft();
      onClose();
      if (mode === "edit") applyInitialData(initialData);
      else applyCreateDefaults();
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.images?.[0] ||
        e?.response?.data?.closing_time?.[0] ||
        e?.response?.data?.initial_slots?.[0] ||
        e?.response?.data?.address?.[0] ||
        "Failed to save pitch. Your entries are still here — please try again.";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  const lightboxImage = images.find((i) => i.id === lightboxId);

  const heroCopy: Record<StepNum, { title: string; subtitle: string }> = {
    1: {
      title: mode === "edit" ? "Edit pitch details" : "Add a new pitch",
      subtitle: "Name, hours, and photos people will see first.",
    },
    2: {
      title: "Pricing & availability",
      subtitle: "Set your rates and how people can book.",
    },
    3: {
      title: "Amenities & services",
      subtitle: "Let players know what's on offer.",
    },
    4: {
      title: mode === "edit" ? "Update pitch location" : "Pin the location",
      subtitle: "Click the map to set it precisely.",
    },
  };

  if (!open) return null;

  return (
    <div className={styles.drawerOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={styles.drawerPanel} role="dialog" aria-modal="true" aria-label={heroCopy[step].title}>
        {/* ---------- gradient hero ---------- */}
        <div className={styles.hero}>
          <span className={styles.heroIcon}>
            <PinIcon width={20} height={20} />
          </span>
          <div className={styles.heroText}>
            <div className={styles.heroTitle}>{heroCopy[step].title}</div>
            <div className={styles.heroSubtitle}>{heroCopy[step].subtitle}</div>
          </div>
          <button type="button" className={styles.heroCloseBtn} aria-label="Close" onClick={handleClose}>
            ×
          </button>
        </div>

        {/* ---------- horizontal step progress ---------- */}
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
                <span className={styles.stepTabDot}>{isDone ? <CheckIcon width={11} height={11} /> : <meta.Icon width={13} height={13} />}</span>
                <span className={styles.stepTabLabel}>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {draftRestored && (
          <div className={styles.draftBar}>
            <span>Draft restored from your last visit</span>
            <button type="button" className={styles.draftClearBtn} onClick={discardDraft}>Start over</button>
          </div>
        )}

        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* ---------- scrollable body ---------- */}
        <div className={styles.body}>
          {step === 1 && (
            <div className={styles.stepContent}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardHeadIcon}><InfoIcon width={15} height={15} /></span>
                  Basics
                </div>

                {isAdmin && mode === "create" && (
                  <div className={styles.field}>
                    <label className={styles.label}>Owner</label>
                    <select className={styles.select} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                      <option value="">Select owner</option>
                      {approvedOwners.map((o) => (
                        <option key={o.id} value={o.id}>{o.username}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.field}>
                  <label className={styles.label}>Pitch name</label>
                  <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bole, Semit, Megenagna" />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Sport</label>
                  <select className={styles.select} value={sportType} onChange={(e) => setSportType(e.target.value as SportType)}>
                    <option value="FOOTBALL">Football</option>
                    <option value="BASKETBALL">Basketball</option>
                  </select>
                </div>

                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Opening at (GMT+3)</label>
                    <select className={styles.select} value={openingTime} onChange={(e) => setOpeningTime(e.target.value)}>
                      {TIME_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Closes at (GMT+3)</label>
                    <select className={styles.select} value={closingTime} onChange={(e) => setClosingTime(e.target.value)}>
                      {TIME_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardHeadIcon}><PhotoIcon width={15} height={15} /></span>
                  Photos
                </div>

                <label className={styles.dropZone}>
                  <input type="file" accept="image/*" multiple onChange={(e) => handleFilesSelected(e.target.files)} />
                  <PhotoIcon className={styles.dropZoneIcon} width={32} height={32} />
                  <div className={styles.dropZoneText}>Click to choose photos</div>
                  <div className={styles.dropZoneSub}>
                    {mode === "create"
                      ? "At least one image is required. You can select several at once."
                      : "Remove the ones you don't want and add new ones — everything else stays untouched."}
                  </div>
                </label>

                {images.length > 0 && (
                  <div className={styles.thumbGrid}>
                    {images.map((img) => (
                      <div key={img.id} className={styles.thumb} onClick={() => toggleLightbox(img.id)}>
                        <img src={img.url} alt={img.kind === "new" ? img.file.name : "Pitch photo"} />
                        <button
                          type="button"
                          className={styles.thumbRemove}
                          aria-label="Remove image"
                          onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepContent}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardHeadIcon}><TagIcon width={15} height={15} /></span>
                  Pricing
                </div>

                <div className={styles.row3}>
                  <div className={styles.field}>
                    <label className={styles.label}>Hourly price</label>
                    <input className={styles.input} value={hourly} onChange={(e) => setHourly(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Weekly (1x/week)</label>
                    <input className={styles.input} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Monthly (4x/month)</label>
                    <input className={styles.input} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Minimum hours per booking</label>
                  <input className={styles.input} value={minHours} onChange={(e) => setMinHours(e.target.value)} style={{ maxWidth: 160 }} />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Available booking types</label>
                  <div className={styles.chipRow}>
                    <label className={`${styles.chip} ${allowHourly ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={allowHourly} onChange={(e) => setAllowHourly(e.target.checked)} />
                      <span className={styles.chipDot} />Hourly
                    </label>
                    <label className={`${styles.chip} ${allowWeekly ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={allowWeekly} onChange={(e) => setAllowWeekly(e.target.checked)} />
                      <span className={styles.chipDot} />Weekly
                    </label>
                    <label className={`${styles.chip} ${allowMonthly ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={allowMonthly} onChange={(e) => setAllowMonthly(e.target.checked)} />
                      <span className={styles.chipDot} />Monthly
                    </label>
                  </div>
                </div>
              </div>

              {mode === "create" && (
                <div className={styles.card}>
                  <div className={styles.cardHead}>Already-booked slots (optional)</div>
                  <div className={styles.hint} style={{ marginBottom: 4 }}>
                    If this pitch already has bookings from before you registered it, add them here
                    so they show as taken from day one.
                  </div>

                  {slotEntries.map((entry) => (
                    <div key={entry.id} className={styles.slotDateCard}>
                      <div className={styles.slotDateHeader}>
                        <div className={styles.field} style={{ marginBottom: 0, flex: 1 }}>
                          <label className={styles.label}>Date</label>
                          <input type="date" className={styles.input} value={entry.date} onChange={(e) => updateDateEntry(entry.id, e.target.value)} />
                        </div>
                        {slotEntries.length > 1 && (
                          <button type="button" className={styles.slotRemoveBtn} aria-label="Remove this date" onClick={() => removeDateEntry(entry.id)}>
                            <TrashIcon width={16} height={16} />
                          </button>
                        )}
                      </div>

                      {entry.ranges.map((r) => (
                        <div key={r.id} className={styles.slotRangeRow}>
                          <div className={styles.field} style={{ marginBottom: 0 }}>
                            <label className={styles.label}>From</label>
                            <select className={styles.select} value={r.start} onChange={(e) => updateRange(entry.id, r.id, "start", e.target.value)}>
                              {TIME_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                          <div className={styles.field} style={{ marginBottom: 0 }}>
                            <label className={styles.label}>To</label>
                            <select className={styles.select} value={r.end} onChange={(e) => updateRange(entry.id, r.id, "end", e.target.value)}>
                              {TIME_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                          {entry.ranges.length > 1 && (
                            <button type="button" className={styles.slotRemoveBtn} aria-label="Remove this time range" onClick={() => removeRange(entry.id, r.id)}>
                              <TrashIcon width={14} height={14} />
                            </button>
                          )}
                        </div>
                      ))}

                      <button type="button" className={styles.slotAddBtn} onClick={() => addRange(entry.id)}>
                        <PlusIcon width={14} height={14} /> Add time on this date
                      </button>
                    </div>
                  ))}

                  <button type="button" className={styles.slotAddBtn} onClick={addDateEntry}>
                    <PlusIcon width={14} height={14} /> Add another date
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepContent}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardHeadIcon}><SparkleIcon width={15} height={15} /></span>
                  Amenities
                </div>
                <div className={styles.chipRow}>
                  <label className={`${styles.chip} ${dressing ? styles.chipOn : ""}`}>
                    <input type="checkbox" checked={dressing} onChange={(e) => setDressing(e.target.checked)} />
                    <span className={styles.chipDot} />Dressing room
                  </label>
                  <label className={`${styles.chip} ${showers ? styles.chipOn : ""}`}>
                    <input type="checkbox" checked={showers} onChange={(e) => setShowers(e.target.checked)} />
                    <span className={styles.chipDot} />Showers
                  </label>
                  <label className={`${styles.chip} ${parking ? styles.chipOn : ""}`}>
                    <input type="checkbox" checked={parking} onChange={(e) => setParking(e.target.checked)} />
                    <span className={styles.chipDot} />Parking
                  </label>
                  <label className={`${styles.chip} ${lighting ? styles.chipOn : ""}`}>
                    <input type="checkbox" checked={lighting} onChange={(e) => setLighting(e.target.checked)} />
                    <span className={styles.chipDot} />Lighting
                  </label>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Other services</label>
                  <input className={styles.input} value={services} onChange={(e) => setServices(e.target.value)} placeholder="Referee, water, ball rental" />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className={styles.stepContent}>
              <div className={styles.hint} style={{ marginBottom: 12 }}>
                Click on the map or drag the marker to set the exact pitch location.
              </div>

              {/* Map + address attached as ONE unit — map on top, address
                  band directly underneath, no gap between them. */}
              <div className={styles.locationUnit}>
                <div className={styles.mapFrame}>
                  <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
                    <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <LocationPicker lat={lat} lng={lng} onChange={handleLocationSelected} />
                  </MapContainer>
                </div>

                <div className={styles.addressBand}>
                  <span className={styles.addressBandIcon}><PinIcon width={15} height={15} /></span>
                  <input
                    className={styles.addressBandInput}
                    value={address}
                    onChange={(e) => handleAddressInput(e.target.value)}
                    placeholder={geocoding ? "Looking up address…" : "Click the map to auto-fill"}
                  />
                  {geocoding && <span className={styles.addressBandSpinner} />}
                </div>
              </div>

              <div className={styles.coordsPill}>📍 {lat.toFixed(6)}, {lng.toFixed(6)}</div>
            </div>
          )}
        </div>

        {/* ---------- sticky footer ---------- */}
        <div className={styles.footer}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={goBack}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <span className={styles.footerProgress}>Step {step} of 4</span>
          {step < 4 ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goNext}>Next</button>
          ) : (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={finish} disabled={submitting}>
              {submitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Pitch"}
            </button>
          )}
        </div>
      </div>

      {lightboxImage && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxId(null)}>
          <button type="button" className={styles.lightboxClose} aria-label="Close preview" onClick={(e) => { e.stopPropagation(); setLightboxId(null); }}>×</button>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.kind === "new" ? lightboxImage.file.name : "Pitch photo"}
            className={styles.lightboxImg}
            onClick={(e) => { e.stopPropagation(); setLightboxId(null); }}
          />
        </div>
      )}
    </div>
  );
}