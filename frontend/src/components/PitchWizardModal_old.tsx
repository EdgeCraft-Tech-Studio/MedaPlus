import { useMemo, useState } from "react";
import Modal from "./Modal";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";

type OwnerOption = {
  id: string;
  username: string;
  is_approved?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  owners?: OwnerOption[];
  onSubmit: (payload: FormData) => Promise<void> | void;
};

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 };

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, "0")}:00`;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return {
    value,
    label: `${hour12}:00 ${suffix}`,
  };
});

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

export default function PitchWizardModal({
  open,
  onClose,
  onSubmit,
  isAdmin = false,
  owners = [],
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");

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

  const [images, setImages] = useState<File[]>([]);

  const [lat, setLat] = useState(ADDIS_ABABA.lat);
  const [lng, setLng] = useState(ADDIS_ABABA.lng);

  const approvedOwners = useMemo(() => {
    return owners.filter((o) => o.is_approved !== false);
  }, [owners]);

  function resetAll() {
    setStep(1);
    setError("");
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
    setImages([]);
    setLat(ADDIS_ABABA.lat);
    setLng(ADDIS_ABABA.lng);
  }

  function handleClose() {
    onClose();
    resetAll();
  }

  function validateStep1() {
    setError("");

    if (isAdmin && !ownerId) {
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

  async function finish() {
    setError("");

    const parsedHours = slotHours
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 23);

    const formData = new FormData();

    if (isAdmin) {
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

    if (slotDate) {
      formData.append("slot_date", slotDate);
    }

    for (const hour of parsedHours) {
      formData.append("slot_hours", String(hour));
    }

    for (const image of images) {
      formData.append("images", image);
    }

    try {
      await onSubmit(formData);
      handleClose();
    } catch (e: any) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.images?.[0] ||
        "Failed to create pitch.";
      setError(detail);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 1 ? "Add Pitch Details" : "Pick Pitch Location"}
    >
      {error && (
        <div
          style={{
            marginBottom: 12,
            color: "#b00020",
            background: "#fff4f4",
            border: "1px solid #f0c9c9",
            padding: 10,
            borderRadius: 10,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: step === 1 ? "#111" : "#eee",
            color: step === 1 ? "#fff" : "#333",
            fontWeight: 600,
          }}
        >
          1. Details
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: step === 2 ? "#111" : "#eee",
            color: step === 2 ? "#fff" : "#333",
            fontWeight: 600,
          }}
        >
          2. Location
        </div>
      </div>

      {step === 1 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (validateStep1()) setStep(2);
          }}
          style={{ display: "grid", gap: 10 }}
        >
          {isAdmin && (
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Owner</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
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

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Pitch name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Opening at (GMT+3)</label>
              <select
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Closes at (GMT+3)</label>
              <select
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Pitch images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImages(Array.from(e.target.files || []))}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
            <div style={{ fontSize: 12, color: "#666" }}>
              At least one image is required.
            </div>
            {images.length > 0 && (
              <div style={{ fontSize: 13, color: "#333" }}>
                Selected: {images.map((img) => img.name).join(", ")}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Hourly price</label>
              <input
                value={hourly}
                onChange={(e) => setHourly(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Weekly (1x/week)</label>
              <input
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Monthly (4x/month)</label>
              <input
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Minimum hours</label>
              <input
                value={minHours}
                onChange={(e) => setMinHours(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Initial slots (optional, one day)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <input
                  value={slotHours}
                  onChange={(e) => setSlotHours(e.target.value)}
                  placeholder="8,9,10,11"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                Hours: comma separated, 0 to 23
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label>
              <input
                type="checkbox"
                checked={allowHourly}
                onChange={(e) => setAllowHourly(e.target.checked)}
              />{" "}
              Hourly
            </label>
            <label>
              <input
                type="checkbox"
                checked={allowWeekly}
                onChange={(e) => setAllowWeekly(e.target.checked)}
              />{" "}
              Weekly
            </label>
            <label>
              <input
                type="checkbox"
                checked={allowMonthly}
                onChange={(e) => setAllowMonthly(e.target.checked)}
              />{" "}
              Monthly
            </label>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label>
              <input
                type="checkbox"
                checked={dressing}
                onChange={(e) => setDressing(e.target.checked)}
              />{" "}
              Dressing room
            </label>
            <label>
              <input
                type="checkbox"
                checked={showers}
                onChange={(e) => setShowers(e.target.checked)}
              />{" "}
              Showers
            </label>
            <label>
              <input
                type="checkbox"
                checked={parking}
                onChange={(e) => setParking(e.target.checked)}
              />{" "}
              Parking
            </label>
            <label>
              <input
                type="checkbox"
                checked={lighting}
                onChange={(e) => setLighting(e.target.checked)}
              />{" "}
              Lighting
            </label>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Other services</label>
            <input
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder="Referee, water, ball rental"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit">Next</button>
          </div>
        </form>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 14, color: "#555" }}>
            Click on the map or drag the marker to set the exact pitch location.
          </div>

          <div
            style={{
              height: 360,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #ddd",
            }}
          >
            <MapContainer
              center={[lat, lng]}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
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

          <div style={{ fontSize: 14, color: "#444" }}>
            Selected location: {lat.toFixed(6)}, {lng.toFixed(6)}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" onClick={finish}>
              Create Pitch
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
