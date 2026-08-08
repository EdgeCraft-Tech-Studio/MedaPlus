import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import styles from "../pages/css/PitchWizardModal.module.css";
import { showToast } from "../pages/Toast";

type OwnerOption = {
  id: string;
  username: string;
  is_approved?: boolean;
};

type InitialPitchData = {
  id?: string;
  owner_id?: string;
  name?: string;
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
  // The pitch's already-uploaded photos, each tagged with its PitchImage id
  // so we can tell the backend exactly which one to delete on edit.
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

// "new" = a File the user just picked, not uploaded yet (gets sent on submit).
// "existing" = a photo that's already saved on the pitch (edit mode only).
// imageId is the PitchImage.id on the server - if the user removes one of
// these, we record its imageId so the backend can delete just that row.
type ImageItem =
  | { id: string; kind: "new"; file: File; url: string }
  | { id: string; kind: "existing"; imageId: string; url: string };

type PersistedImage = {
  name: string;
  type: string;
  dataUrl: string;
};

type DraftShape = {
  savedAt: number;
  step: StepNum;
  maxStepReached: StepNum;
  ownerId: string;
  name: string;
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
  slotDate: string;
  slotHours: string;
  lat: number;
  lng: number;
  images: PersistedImage[];
  // ids of existing (already-saved) photos the user removed while editing
  removedImageIds: string[];
};

// Plain-value snapshot of every field a draft could hold, used to detect
// whether the current form actually differs from a blank/untouched one.
type FieldSnapshot = Omit<DraftShape, "savedAt" | "step" | "maxStepReached" | "images"> & {
  newImageCount: number;
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

// The "nothing has actually changed yet" baseline for the current mode -
// used to decide whether a draft is worth saving/restoring at all.
function buildBaseline(
  mode: "create" | "edit",
  data?: InitialPitchData | null
): FieldSnapshot {
  if (mode === "edit") {
    return {
      ownerId: data?.owner_id || "",
      name: data?.name || "",
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
      slotDate: "",
      slotHours: "8,9,10,11",
      lat: data?.latitude ?? ADDIS_ABABA.lat,
      lng: data?.longitude ?? ADDIS_ABABA.lng,
      removedImageIds: [],
      newImageCount: 0,
    };
  }

  return {
    ownerId: "",
    name: "",
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
    slotDate: "",
    slotHours: "8,9,10,11",
    lat: ADDIS_ABABA.lat,
    lng: ADDIS_ABABA.lng,
    removedImageIds: [],
    newImageCount: 0,
  };
}

// True if `snapshot` differs from the untouched baseline in any way that
// matters - i.e. there's actually something worth restoring or clearing.
function isMeaningfulSnapshot(snapshot: FieldSnapshot, baseline: FieldSnapshot) {
  return (
    snapshot.ownerId !== baseline.ownerId ||
    snapshot.name !== baseline.name ||
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
    snapshot.slotDate !== baseline.slotDate ||
    snapshot.slotHours !== baseline.slotHours ||
    snapshot.lat !== baseline.lat ||
    snapshot.lng !== baseline.lng ||
    snapshot.removedImageIds.length > 0 ||
    snapshot.newImageCount > 0
  );
}

// Turns the pitch's already-saved photos into displayable ImageItems,
// optionally excluding ones the user already marked for removal (used when
// restoring a draft so a previously-removed photo doesn't reappear).
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

/* ---------- step-rail icons ---------- */

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

const STEP_META: Array<{ num: StepNum; label: string; hint: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement }> = [
  { num: 1, label: "Basics", hint: "Name, hours & photos", Icon: InfoIcon },
  { num: 2, label: "Pricing", hint: "Rates & availability", Icon: TagIcon },
  { num: 3, label: "Amenities", hint: "Facilities & extras", Icon: SparkleIcon },
  { num: 4, label: "Location", hint: "Pin it on the map", Icon: PinIcon },
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

  const [slotDate, setSlotDate] = useState("");
  const [slotHours, setSlotHours] = useState("8,9,10,11");

  const [images, setImages] = useState<ImageItem[]>([]);
  // ids of existing (already-saved) photos the user removed - sent to the
  // backend on save so it deletes exactly those rows and nothing else.
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const [lat, setLat] = useState(ADDIS_ABABA.lat);
  const [lng, setLng] = useState(ADDIS_ABABA.lng);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);

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
    setAddress("");
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
    setSlotDate("");
    setSlotHours("8,9,10,11");
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
    setAddress(data?.address || "");
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
    setSlotDate("");
    setSlotHours("8,9,10,11");
    revokeAllPreviews();
    // Show the pitch's already-saved photos so edit mode isn't blank.
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
    setAddress(draft.address ?? "");
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
    setSlotDate(draft.slotDate ?? "");
    setSlotHours(draft.slotHours ?? "8,9,10,11");
    setLat(draft.lat ?? ADDIS_ABABA.lat);
    setLng(draft.lng ?? ADDIS_ABABA.lng);
    setRemovedImageIds(draft.removedImageIds ?? []);
    revokeAllPreviews();
    objectUrlsRef.current = restoredImages
      .filter((i): i is Extract<ImageItem, { kind: "new" }> => i.kind === "new")
      .map((i) => i.url);
    setImages(restoredImages);
  }

  // Load either a saved draft or the base data whenever the modal opens.
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
            slotDate: draft.slotDate ?? "",
            slotHours: draft.slotHours ?? "8,9,10,11",
            lat: draft.lat ?? ADDIS_ABABA.lat,
            lng: draft.lng ?? ADDIS_ABABA.lng,
            removedImageIds: draft.removedImageIds ?? [],
            newImageCount: (draft.images || []).length,
          };

          // A stale/blank draft (e.g. saved from a modal that was opened
          // and closed without any real input) should never trigger a
          // restore - that's what caused the "restored" text with an
          // empty form. Only restore when something actually changed.
          if (!isMeaningfulSnapshot(snapshot, baseline)) {
            try {
              localStorage.removeItem(key);
            } catch {
              // ignore
            }
            if (mode === "edit") {
              applyInitialData(initialData);
            } else {
              applyCreateDefaults();
            }
            return;
          }

          const restoredNewImages = await Promise.all(
            (draft.images || []).map((img) => dataUrlToFile(img))
          );
          // The pitch's existing photos always come from the live pitch data,
          // not from the draft, minus anything the draft says was removed.
          const existingImages = buildExistingImages(
            initialData,
            draft.removedImageIds || []
          );
          if (!cancelled) {
            applyDraft(draft, [...existingImages, ...restoredNewImages]);
            setDraftRestored(true);
          }
          return;
        } catch {
          // fall through to defaults if the draft is corrupted
        }
      }

      if (mode === "edit") {
        applyInitialData(initialData);
      } else {
        applyCreateDefaults();
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialData]);

  // Autosave the in-progress draft (debounced) so a refresh never loses input.
  // Only ever writes when the form actually differs from a blank one, and
  // cleans up any now-pointless draft the moment the user reverts to blank.
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
        slotDate,
        slotHours,
        lat,
        lng,
        removedImageIds,
        newImageCount: newImages.length,
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
          slotDate,
          slotHours,
          lat,
          lng,
          images: persistedImages,
          removedImageIds,
        };

        try {
          localStorage.setItem(key, JSON.stringify(draft));
        } catch {
          // Likely quota exceeded because of large images - retry without images
          // so text fields are still protected against refresh.
          try {
            localStorage.setItem(key, JSON.stringify({ ...draft, images: [] }));
          } catch {
            // give up silently, nothing more we can do
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
    slotDate,
    slotHours,
    lat,
    lng,
    images,
    removedImageIds,
  ]);

  useEffect(() => {
    return () => revokeAllPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey(mode, initialData));
    } catch {
      // ignore
    }
  }

  function handleClose() {
    onClose();
    if (mode === "edit") {
      applyInitialData(initialData);
    } else {
      applyCreateDefaults();
    }
  }

  function discardDraft() {
    clearDraft();
    setDraftRestored(false);
    if (mode === "edit") {
      applyInitialData(initialData);
    } else {
      applyCreateDefaults();
    }
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

      // Removing an already-saved photo doesn't delete it from the server
      // right away - it just marks it so the backend removes that exact
      // row when the form is saved. Everything else on the pitch is
      // untouched.
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
      return true;
    }

    // Step 3 (amenities) has no required fields.
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
    setError("");
    setSubmitting(true);

    const parsedHours =
      mode === "create"
        ? slotHours
            .split(",")
            .map((x) => parseInt(x.trim(), 10))
            .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 23)
        : [];

    const formData = new FormData();

    if (mode === "create" && isAdmin) {
      formData.append("owner_id", ownerId);
    }

    formData.append("name", name);
    formData.append("address", address);
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

    if (mode === "create" && slotDate) {
      formData.append("slot_date", slotDate);
    }

    if (mode === "create") {
      for (const hour of parsedHours) {
        formData.append("slot_hours", String(hour));
      }
    }

    // Only newly picked files get uploaded under "images".
    for (const image of images) {
      if (image.kind === "new") {
        formData.append("images", image.file);
      }
    }

    // Tell the backend exactly which existing photos to delete. Anything
    // not in this list, and not re-sent as a new file, is left alone.
    if (mode === "edit") {
      for (const removedId of removedImageIds) {
        formData.append("removed_image_ids", removedId);
      }
    }

    try {
      await onSubmit(formData);
      clearDraft();
      onClose();
      if (mode === "edit") {
        applyInitialData(initialData);
      } else {
        applyCreateDefaults();
      }
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.images?.[0] ||
        e?.response?.data?.closing_time?.[0] ||
        "Failed to save pitch. Your entries are still here — please try again.";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  }

  const lightboxImage = images.find((i) => i.id === lightboxId);

  const topBarCopy: Record<StepNum, { title: string; subtitle: string }> = {
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
      subtitle: "Click the map or drag the marker to place it precisely.",
    },
  };

  return (
    <Modal open={open} onClose={handleClose} title={topBarCopy[step].title}>
      <div className={styles.wizard}>
        {/* ---------- left rail: 4-step navigator ---------- */}
        <div className={styles.rail}>
          <div className={styles.railHead}>
            <div className={styles.railTitle}>{mode === "edit" ? "Edit pitch" : "New pitch"}</div>
            <div className={styles.railSubtitle}>Step {step} of 4</div>
          </div>

          {draftRestored && (
            <button type="button" className={styles.railClearBtn} onClick={discardDraft}>
              Clear form
            </button>
          )}

          {STEP_META.map((meta, index) => {
            const isActive = meta.num === step;
            const isDone = meta.num < step || (meta.num < maxStepReached && meta.num !== step);
            const isClickable = meta.num <= maxStepReached && meta.num !== step;

            return (
              <button
                key={meta.num}
                type="button"
                onClick={() => goToStep(meta.num)}
                className={`${styles.railStep} ${isActive ? styles.active : ""} ${
                  isDone ? styles.done : ""
                } ${isClickable ? styles.railStepClickable : ""}`}
                disabled={!isClickable}
                style={index > 0 ? ({ position: "relative" } as React.CSSProperties) : undefined}
              >
                {index > 0 && (
                  <span
                    className={styles.railConnector}
                    style={{ ["--fill" as any]: meta.num <= maxStepReached ? 1 : 0 }}
                  />
                )}
                <span className={styles.railDot}>
                  {isDone ? <CheckIcon /> : <meta.Icon />}
                </span>
                <span className={styles.railStepBody}>
                  <span className={styles.railStepLabel}>{meta.label}</span>
                  <span className={styles.railStepHint}>{meta.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ---------- main column ---------- */}
        <div className={styles.mainCol}>
          <div className={styles.topBar}>
            <div className={styles.topBarTitle}>{topBarCopy[step].title}</div>
            <div className={styles.topBarSubtitle}>{topBarCopy[step].subtitle}</div>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.body}>
            {step === 1 && (
              <div className={`${styles.form} ${styles.stepContent}`}>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Basics</div>

                  {isAdmin && mode === "create" && (
                    <div className={styles.field}>
                      <label className={styles.label}>Owner</label>
                      <select
                        className={styles.select}
                        value={ownerId}
                        onChange={(e) => setOwnerId(e.target.value)}
                      >
                        <option value="">Select owner</option>
                        {approvedOwners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.username}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={styles.field}>
                    <label className={styles.label}>Pitch name</label>
                    <input
                      className={styles.input}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Bole 5-a-side Arena"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Address</label>
                    <input
                      className={styles.input}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, area, landmark"
                    />
                  </div>

                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Opening at (GMT+3)</label>
                      <select
                        className={styles.select}
                        value={openingTime}
                        onChange={(e) => setOpeningTime(e.target.value)}
                      >
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Closes at (GMT+3)</label>
                      <select
                        className={styles.select}
                        value={closingTime}
                        onChange={(e) => setClosingTime(e.target.value)}
                      >
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Photos</div>

                  <div className={styles.field}>
                    <label className={styles.label}>Pitch images</label>

                    <label className={styles.dropZone}>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleFilesSelected(e.target.files)}
                      />
                      <svg className={styles.dropZoneIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5" strokeLinecap="round" />
                        <path d="M4 17l4.5-4.5a2 2 0 0 1 2.8 0L15 16l1.7-1.7a2 2 0 0 1 2.8 0L21 16.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M3 19h18" strokeLinecap="round" />
                      </svg>
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
                            <img
                              src={img.url}
                              alt={img.kind === "new" ? img.file.name : "Pitch photo"}
                            />
                            <button
                              type="button"
                              className={styles.thumbRemove}
                              aria-label="Remove image"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(img.id);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className={`${styles.form} ${styles.stepContent}`}>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Pricing</div>

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
                    <input
                      className={styles.input}
                      value={minHours}
                      onChange={(e) => setMinHours(e.target.value)}
                      style={{ maxWidth: 160 }}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Available booking types</label>
                    <div className={styles.chipRow}>
                      <label className={`${styles.chip} ${allowHourly ? styles.chipOn : ""}`}>
                        <input type="checkbox" checked={allowHourly} onChange={(e) => setAllowHourly(e.target.checked)} />
                        <span className={styles.chipDot} />
                        Hourly
                      </label>
                      <label className={`${styles.chip} ${allowWeekly ? styles.chipOn : ""}`}>
                        <input type="checkbox" checked={allowWeekly} onChange={(e) => setAllowWeekly(e.target.checked)} />
                        <span className={styles.chipDot} />
                        Weekly
                      </label>
                      <label className={`${styles.chip} ${allowMonthly ? styles.chipOn : ""}`}>
                        <input type="checkbox" checked={allowMonthly} onChange={(e) => setAllowMonthly(e.target.checked)} />
                        <span className={styles.chipDot} />
                        Monthly
                      </label>
                    </div>
                  </div>
                </div>

                {mode === "create" && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Initial slots (optional)</div>
                    <div className={styles.row2}>
                      <div className={styles.field}>
                        <label className={styles.label}>Date</label>
                        <input
                          type="date"
                          className={styles.input}
                          value={slotDate}
                          onChange={(e) => setSlotDate(e.target.value)}
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Hours</label>
                        <input
                          className={styles.input}
                          value={slotHours}
                          onChange={(e) => setSlotHours(e.target.value)}
                          placeholder="8,9,10,11"
                        />
                        <div className={styles.hint}>Comma separated, 0 to 23</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className={`${styles.form} ${styles.stepContent}`}>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Amenities</div>
                  <div className={styles.chipRow}>
                    <label className={`${styles.chip} ${dressing ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={dressing} onChange={(e) => setDressing(e.target.checked)} />
                      <span className={styles.chipDot} />
                      Dressing room
                    </label>
                    <label className={`${styles.chip} ${showers ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={showers} onChange={(e) => setShowers(e.target.checked)} />
                      <span className={styles.chipDot} />
                      Showers
                    </label>
                    <label className={`${styles.chip} ${parking ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={parking} onChange={(e) => setParking(e.target.checked)} />
                      <span className={styles.chipDot} />
                      Parking
                    </label>
                    <label className={`${styles.chip} ${lighting ? styles.chipOn : ""}`}>
                      <input type="checkbox" checked={lighting} onChange={(e) => setLighting(e.target.checked)} />
                      <span className={styles.chipDot} />
                      Lighting
                    </label>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Other services</label>
                    <input
                      className={styles.input}
                      value={services}
                      onChange={(e) => setServices(e.target.value)}
                      placeholder="Referee, water, ball rental"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className={`${styles.form} ${styles.stepContent}`}>
                <div className={styles.mapHint}>Click on the map or drag the marker to set the exact pitch location.</div>

                <div className={styles.mapFrame}>
                  <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPicker
                      lat={lat}
                      lng={lng}
                      onChange={(newLat, newLng) => {
                        setLat(newLat);
                        setLng(newLng);
                      }}
                    />
                  </MapContainer>
                </div>

                <div className={styles.coordsPill}>
                  📍 {lat.toFixed(6)}, {lng.toFixed(6)}
                </div>
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={goBack}>
              {step === 1 ? "Cancel" : "Back"}
            </button>

            <span className={styles.footerProgress}>Step {step} of 4</span>

            {step < 4 ? (
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goNext}>
                Next
              </button>
            ) : (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={finish}
                disabled={submitting}
              >
                {submitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Pitch"}
              </button>
            )}
          </div>
        </div>
      </div>

      {lightboxImage && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxId(null)}>
          <button
            type="button"
            className={styles.lightboxClose}
            aria-label="Close preview"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxId(null);
            }}
          >
            ×
          </button>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.kind === "new" ? lightboxImage.file.name : "Pitch photo"}
            className={styles.lightboxImg}
            onClick={(e) => {
              e.stopPropagation();
              setLightboxId(null);
            }}
          />
        </div>
      )}
    </Modal>
  );
}
