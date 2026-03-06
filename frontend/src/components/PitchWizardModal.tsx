import { useMemo, useState } from "react";
import Modal from "./Modal";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";

type OwnerOption = { id: string; username: string; is_approved?: boolean };

type Props = {
  open: boolean;
  onClose: () => void;

  // If admin creates pitch for someone, pass owners list
  isAdmin?: boolean;
  owners?: OwnerOption[];

  // Called after user finishes step2
  onSubmit: (payload: any) => Promise<void> | void;
};

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 }; // Addis Ababa

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

  return <Marker position={[lat, lng]} draggable={true} eventHandlers={{
    dragend: (e) => {
      const m = e.target;
      const pos = m.getLatLng();
      onChange(pos.lat, pos.lng);
    }
  }} />;
}

export default function PitchWizardModal({ open, onClose, onSubmit, isAdmin, owners }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");

  // Step 1 fields
  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

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

  const [slotDate, setSlotDate] = useState(""); // YYYY-MM-DD
  const [slotHours, setSlotHours] = useState("8,9,10,11");

  // Step 2 location
  const [lat, setLat] = useState(ADDIS_ABABA.lat);
  const [lng, setLng] = useState(ADDIS_ABABA.lng);

  const approvedOwners = useMemo(() => {
    if (!owners) return [];
    return owners.filter((o) => o.is_approved !== false); // show approved by default
  }, [owners]);

  function resetAll() {
    setStep(1);
    setError("");
    setOwnerId("");
    setName("");
    setAddress("");
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
    setLat(ADDIS_ABABA.lat);
    setLng(ADDIS_ABABA.lng);
  }

  function close() {
    onClose();
    resetAll();
  }

  function validateStep1() {
    setError("");

    if (isAdmin && !ownerId) return setError("Please select an owner."), false;
    if (!name.trim()) return setError("Pitch name is required."), false;

    const h = Number(hourly);
    const w = Number(weekly);
    const m = Number(monthly);
    if ([h, w, m].some((x) => Number.isNaN(x) || x < 0)) return setError("Prices must be valid numbers."), false;

    const mh = Number(minHours);
    if (Number.isNaN(mh) || mh < 1) return setError("Minimum hours must be >= 1"), false;

    return true;
  }

  async function finish() {
    setError("");

    const hours = slotHours
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 23);

    const payload: any = {
      name,
      address,
      latitude: lat,
      longitude: lng,

      min_hours: Number(minHours),
      allow_hourly: allowHourly,
      allow_weekly: allowWeekly,
      allow_monthly: allowMonthly,

      hourly_price: hourly,
      weekly_price: weekly,
      monthly_price: monthly,

      has_dressing_room: dressing,
      has_showers: showers,
      has_parking: parking,
      has_lighting: lighting,
      other_services: services,

      slot_date: slotDate || undefined,
      slot_hours: hours,
    };

    // IMPORTANT:
    // If your backend expects tenant_id instead of owner_id, rename this field.
    if (isAdmin) payload.owner_id = ownerId;

    try {
      await onSubmit(payload);
      close();
    } catch (e: any) {
      setError("Failed to create pitch. Check server logs / API response.");
    }
  }

  return (
    <Modal open={open} onClose={close} title={step === 1 ? "Add Pitch Details" : "Pick Pitch Location"}>
      {error && <div style={{ marginBottom: 12, color: "#b00020" }}>{error}</div>}

      {/* Step indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ padding: "6px 10px", borderRadius: 999, background: step === 1 ? "#111" : "#eee", color: step === 1 ? "#fff" : "#333" }}>
          1. Details
        </div>
        <div style={{ padding: "6px 10px", borderRadius: 999, background: step === 2 ? "#111" : "#eee", color: step === 2 ? "#fff" : "#333" }}>
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
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
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
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Address (optional)</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Hourly price</label>
              <input value={hourly} onChange={(e) => setHourly(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Weekly (1x/week)</label>
              <input value={weekly} onChange={(e) => setWeekly(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Monthly (4x/month)</label>
              <input value={monthly} onChange={(e) => setMonthly(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Minimum hours</label>
              <input value={minHours} onChange={(e) => setMinHours(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Slots (one day)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
                <input value={slotHours} onChange={(e) => setSlotHours(e.target.value)} placeholder="8,9,10,11" style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>Hours: comma separated (0–23)</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={allowHourly} onChange={(e) => setAllowHourly(e.target.checked)} /> Hourly</label>
            <label><input type="checkbox" checked={allowWeekly} onChange={(e) => setAllowWeekly(e.target.checked)} /> Weekly</label>
            <label><input type="checkbox" checked={allowMonthly} onChange={(e) => setAllowMonthly(e.target.checked)} /> Monthly</label>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label><input type="checkbox" checked={dressing} onChange={(e) => setDressing(e.target.checked)} /> Dressing room</label>
            <label><input type="checkbox" checked={showers} onChange={(e) => setShowers(e.target.checked)} /> Showers</label>
            <label><input type="checkbox" checked={parking} onChange={(e) => setParking(e.target.checked)} /> Parking</label>
            <label><input type="checkbox" checked={lighting} onChange={(e) => setLighting(e.target.checked)} /> Lighting</label>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Other services</label>
            <input value={services} onChange={(e) => setServices(e.target.value)} placeholder="referee, water, ball rental..." style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={close} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white" }}>
              Cancel
            </button>
            <button type="submit" style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "white" }}>
              Next
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "#666", fontSize: 13 }}>
            Click on the map to place the marker. You can also drag the marker.
          </div>

          <div style={{ height: 420, borderRadius: 14, overflow: "hidden", border: "1px solid #eee" }}>
            <MapContainer center={[ADDIS_ABABA.lat, ADDIS_ABABA.lng]} zoom={12} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationPicker lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b); }} />
            </MapContainer>
          </div>

          <div style={{ fontSize: 13, color: "#444" }}>
            Selected: <b>{lat.toFixed(6)}</b>, <b>{lng.toFixed(6)}</b>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
            <button onClick={() => setStep(1)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white" }}>
              Back
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={close} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white" }}>
                Cancel
              </button>
              <button onClick={finish} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#111", color: "white" }}>
                Create pitch
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
