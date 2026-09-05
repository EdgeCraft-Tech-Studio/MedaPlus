import { useMemo, useState } from "react";
import styles from "./css/TimeRangePicker.module.css";

export type TimeRange = { startHour: number; endHour: number };

function label(hour: number) {
  const h = hour % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

function rangesOverlap(a: TimeRange, b: TimeRange) {
  return a.startHour < b.endHour && b.startHour < a.endHour;
}

/**
 * Pick one or more non-overlapping hour ranges within [dayStartHour, dayEndHour).
 * Rather than letting the user type a start/end and rejecting bad combinations
 * after submission, every hour already covered by a chosen range — or that
 * would create an overlap — is simply not selectable. There is no invalid
 * state to submit.
 */
export default function TimeRangePicker({
  dayStartHour = 6,
  dayEndHour = 23,
  ranges,
  onChange,
}: {
  dayStartHour?: number;
  dayEndHour?: number;
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
}) {
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const hours = useMemo(
    () => Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i),
    [dayStartHour, dayEndHour]
  );

  function isHourTaken(hour: number) {
    return ranges.some((r) => hour >= r.startHour && hour < r.endHour);
  }

  function isHourSelectableAsEnd(hour: number) {
    if (pendingStart === null) return false;
    // End must be after start, and the whole span from start..end must be free.
    if (hour <= pendingStart) return false;
    const candidate = { startHour: pendingStart, endHour: hour };
    for (const r of ranges) {
      if (rangesOverlap(candidate, r)) return false;
    }
    return true;
  }

  function isHourSelectableAsStart(hour: number) {
    if (isHourTaken(hour)) return false;
    // Must have at least one valid end hour after it that doesn't cross into a taken range.
    for (let h = hour + 1; h <= dayEndHour; h++) {
      const candidate = { startHour: hour, endHour: h };
      const blocked = ranges.some((r) => rangesOverlap(candidate, r));
      if (blocked) break;
      return true;
    }
    return false;
  }

  function handleHourClick(hour: number) {
    if (pendingStart === null) {
      if (isHourSelectableAsStart(hour)) setPendingStart(hour);
      return;
    }
    if (hour === pendingStart) {
      setPendingStart(null);
      return;
    }
    if (isHourSelectableAsEnd(hour)) {
      onChange([...ranges, { startHour: pendingStart, endHour: hour }].sort((a, b) => a.startHour - b.startHour));
      setPendingStart(null);
    }
  }

  function removeRange(index: number) {
    onChange(ranges.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.hint}>
        {pendingStart === null
          ? "Tap a start time"
          : `Start: ${label(pendingStart)} — now tap an end time`}
      </div>

      <div className={styles.hourGrid}>
        {hours.map((h) => {
          const taken = isHourTaken(h);
          const isPending = h === pendingStart;
          const selectable =
            pendingStart === null ? isHourSelectableAsStart(h) : isHourSelectableAsEnd(h) || isPending;

          return (
            <button
              key={h}
              type="button"
              className={`${styles.hourBtn} ${taken ? styles.hourBtnTaken : ""} ${isPending ? styles.hourBtnPending : ""}`}
              onClick={() => handleHourClick(h)}
              disabled={taken || (!selectable && !isPending)}
            >
              {label(h)}
            </button>
          );
        })}
      </div>

      {ranges.length > 0 && (
        <div className={styles.chipRow}>
          {ranges.map((r, i) => (
            <span key={i} className={styles.chip}>
              {label(r.startHour)} – {label(r.endHour)}
              <button type="button" onClick={() => removeRange(i)} aria-label="Remove">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}