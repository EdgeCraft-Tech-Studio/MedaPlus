import { MapContainer, TileLayer, Marker } from "react-leaflet";
import Modal from "./Modal";
import styles from "../pages/css/PitchWizardModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  pitchId?: string;
  pitchName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export default function PitchLocationModal({
  open,
  onClose,
  pitchId,
  pitchName,
  address,
  latitude,
  longitude,
}: Props) {
  const hasCoords = typeof latitude === "number" && typeof longitude === "number";
  const lat = hasCoords ? (latitude as number) : 8.9806;
  const lng = hasCoords ? (longitude as number) : 38.7578;

  // react-leaflet's MapContainer only reads "center" on first mount - it does
  // NOT recenter itself when the prop changes later. Since Modal keeps its
  // contents mounted (hidden, not destroyed) between opens, the same map
  // instance was being reused for every pitch, always showing wherever the
  // very first pitch was.
  //
  // Giving MapContainer a "key" tied to the pitch/coords forces React to
  // throw away the old map and build a brand new one every time a different
  // pitch is opened, so it always centers on the correct location.
  const mapKey = `${pitchId ?? "none"}-${lat}-${lng}`;

  return (
    <Modal open={open} onClose={onClose} title={pitchName ? `${pitchName} — Location` : "Pitch Location"}>
      <div className={styles.wizard}>
        <div className={styles.body}>
          <div className={`${styles.form} ${styles.stepContent}`}>
            <div className={styles.mapHint}>
              {address ? `Address on file: ${address}` : "No address on file"} — confirm the pin matches.
            </div>

            {!hasCoords ? (
              <div className={styles.errorBanner}>This pitch has no location set.</div>
            ) : (
              <>
                <div className={styles.mapFrame}>
                  <MapContainer
                    key={mapKey}
                    center={[lat, lng]}
                    zoom={15}
                    style={{ height: "100%", width: "100%" }}
                    dragging={true}
                    scrollWheelZoom={true}
                    doubleClickZoom={false}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[lat, lng]} />
                  </MapContainer>
                </div>

                <div className={styles.coordsPill}>
                  📍 {lat.toFixed(6)}, {lng.toFixed(6)}
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
