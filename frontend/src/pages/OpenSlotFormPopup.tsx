import { useState } from "react";
import styles from "./css/OpenSlotFormPopup.module.css";
import { openSlotsForDeclinedMembers } from "../lib/teamBooking";

interface Props {
  requestId: string;
  pitchName: string;
  teamName: string;
  slotsNeeded: number;
  pricePerSlot: number;
  onClose: () => void;
  onCreated: () => void;
  onUnavailable?: (pitchId: string) => void;
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.2 2.9-5.5 6.5-5.5s6.5 2.3 6.5 5.5" />
    </svg>
  );
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" />
    </svg>
  );
}

export default function OpenSlotFormPopup({
  requestId, pitchName, teamName, slotsNeeded, pricePerSlot, onClose, onCreated, onUnavailable,
}: Props) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await openSlotsForDeclinedMembers(requestId, description.trim());
      if (result.unavailable && result.pitch_id) {
        onUnavailable?.(result.pitch_id);
        onClose();
        return;
      }
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Couldn't open slots — check the details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true">
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className={styles.iconWrap}>
          <UsersIcon className={styles.icon} />
        </div>
        <div className={styles.title}>Open the remaining slots</div>
        <div className={styles.subtitle}>
          {teamName} at {pitchName}. Outside players will be able to book this exact time.
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.fixedGrid}>
            <div className={styles.fixedField}>
              <span className={styles.fixedLabel}>Slots to open</span>
              <span className={styles.fixedValue}>{slotsNeeded}</span>
              <span className={styles.fixedHint}>Matches the number who didn't confirm — fixed</span>
            </div>
            <div className={styles.fixedField}>
              <span className={styles.fixedLabel}>Price per player</span>
              <span className={styles.fixedValue}>{pricePerSlot} Br</span>
              <span className={styles.fixedHint}>Same as each team member's share — fixed</span>
            </div>
          </div>

          <label className={styles.field} style={{ marginTop: 16 }}>
            <span className={styles.fieldLabel}>Notes (optional)</span>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Bring your own bibs"
            />
          </label>

          {error && <div className={styles.errorMsg}>{error}</div>}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? <SpinnerIcon className={styles.spinner} /> : "Open Slot"}
          </button>
        </form>
      </div>
    </div>
  );
}