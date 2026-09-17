import { useEffect, useMemo, useState } from "react";
import type { Pitch } from "../lib/pitches";
import { getPitchWeeklyGrid, bookGridSlot, closeGridSlot } from "../lib/pitches";
import type { GridCell, GridHour } from "../lib/pitches";
import {
  gregorianToEthiopian,
  ethiopianToGregorian,
  daysInEthiopianMonth,
  ETHIOPIAN_MONTH_NAMES,
  amharicWeekday,
  formatEthiopianDateShort,
  formatEthiopianHourRange,
  currentEthiopianDate,
  formatEthiopianHourLabel,
} from "../lib/ethiopianCalendar";
import styles from "./css/BookingGrid.module.css";
import TourGuide from "../tours/TourGuide";

type CalendarType = "ethiopian" | "gregorian";
type DateGroupKey = "from" | "to";
type Nullable<T> = T | "";
type PopupTab = "book" | "close";

function formatBirr(value: string | number | undefined | null) {
  const num = Number(value) || 0;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;
}

/** Local-safe ISO date string — deliberately NOT using toISOString(),
 * which converts through UTC and can shift the date back a day for
 * timezones ahead of UTC (e.g. Addis Ababa, UTC+3) at local midnight. */
function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Validates + normalizes an Ethiopian phone number to the canonical
 * stored form ("+2519XXXXXXXX" / "+2517XXXXXXXX"). Accepts:
 * 09XXXXXXXX, 07XXXXXXXX, +2519XXXXXXXX, +2517XXXXXXXX,
 * 2519XXXXXXXX, 2517XXXXXXXX. Returns null if invalid. */
function normalizeEthiopianPhone(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, "");
  if (/^09\d{8}$/.test(text)) return "+251" + text.slice(1);
  if (/^07\d{8}$/.test(text)) return "+251" + text.slice(1);
  if (/^\+2519\d{8}$/.test(text)) return text;
  if (/^\+2517\d{8}$/.test(text)) return text;
  if (/^2519\d{8}$/.test(text)) return "+" + text;
  if (/^2517\d{8}$/.test(text)) return "+" + text;
  return null;
}

const GREGORIAN_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInGregorianMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

function formatGregorianHourLabel(hour24: number): string {
  const h = hour24 === 24 ? 0 : hour24;
  const period = h < 12 ? "AM" : "PM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12.toString().padStart(2, "0")}:00 ${period}`;
}

type PopupState =
  | { kind: "info"; cell: GridCell; x: number; y: number }
  | { kind: "book"; date: string; start_hour: number; label: string; x: number; y: number }
  | null;

type DateGroupProps = {
  label: string;
  calendarType: CalendarType;
  year: Nullable<number>;
  month: Nullable<number>;
  day: Nullable<number>;
  onYear: (v: Nullable<number>) => void;
  onMonth: (v: Nullable<number>) => void;
  onDay: (v: Nullable<number>) => void;
  yearOptions: number[];
  dayOptions: number[];
};

function DateGroup({
  label, calendarType, year, month, day, onYear, onMonth, onDay, yearOptions, dayOptions,
}: DateGroupProps) {
  return (
    <div className={styles.dateGroup}>
      <span className={styles.dateGroupLabel}>{label}</span>
      <div className={styles.dateGroupSelects}>
        <select
          className={styles.filterSelect}
          value={year}
          onChange={(e) => onYear(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Year</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={month}
          onChange={(e) => onMonth(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Month</option>
          {calendarType === "ethiopian"
            ? ETHIOPIAN_MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))
            : GREGORIAN_MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
        </select>
        <select
          className={styles.filterSelect}
          value={day}
          onChange={(e) => onDay(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Day</option>
          {dayOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function BookingGrid({ pitch }: { pitch: Pitch }) {
  const [calendarType, setCalendarType] = useState<CalendarType>("ethiopian");

  const [fromYear, setFromYear] = useState<Nullable<number>>("");
  const [fromMonth, setFromMonth] = useState<Nullable<number>>("");
  const [fromDay, setFromDay] = useState<Nullable<number>>("");

  const [toYear, setToYear] = useState<Nullable<number>>("");
  const [toMonth, setToMonth] = useState<Nullable<number>>("");
  const [toDay, setToDay] = useState<Nullable<number>>("");

  const [nameFilter, setNameFilter] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [hourRange, setHourRange] = useState<{ start?: number; end?: number }>({});

  const [data, setData] = useState<{ date_from: string; date_to: string; days: { date: string; weekday: string; weekday_short: string; display_date: string }[]; hours: GridHour[]; cells: Record<string, GridCell> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<PopupState>(null);
  const [popupTab, setPopupTab] = useState<PopupTab>("book");
  const [bookForm, setBookForm] = useState({ name: "", phone: "", price: "" });
  const [bookPhoneError, setBookPhoneError] = useState("");
  const [closeForm, setCloseForm] = useState({ reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(nameFilter.trim()), 350);
    return () => clearTimeout(t);
  }, [nameFilter]);

  const currentEthYear = useMemo(() => currentEthiopianDate().year, []);
  const currentGregYear = useMemo(() => new Date().getFullYear(), []);

  const ethYearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => currentEthYear - 4 + i), [currentEthYear]);
  const gregYearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => currentGregYear - 4 + i), [currentGregYear]);
  const yearOptions = calendarType === "ethiopian" ? ethYearOptions : gregYearOptions;

  function dayOptionsFor(year: Nullable<number>, month: Nullable<number>) {
    if (calendarType === "ethiopian") {
      if (month === "") return Array.from({ length: 30 }, (_, i) => i + 1);
      const count = month === 13 ? daysInEthiopianMonth(year === "" ? currentEthYear : year, 13) : 30;
      return Array.from({ length: count }, (_, i) => i + 1);
    }
    if (month === "") return Array.from({ length: 31 }, (_, i) => i + 1);
    const count = daysInGregorianMonth(year === "" ? currentGregYear : year, month);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  const fromDayOptions = useMemo(() => dayOptionsFor(fromYear, fromMonth), [calendarType, fromYear, fromMonth]);
  const toDayOptions = useMemo(() => dayOptionsFor(toYear, toMonth), [calendarType, toYear, toMonth]);

  // Clamp an out-of-range day when year/month changes — never touches
  // year or month, so this can't cause the "picking month changes year" bug.
  useEffect(() => {
    if (fromDay !== "" && !fromDayOptions.includes(fromDay)) {
      setFromDay(fromDayOptions[fromDayOptions.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDayOptions]);

  useEffect(() => {
    if (toDay !== "" && !toDayOptions.includes(toDay)) {
      setToDay(toDayOptions[toDayOptions.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toDayOptions]);

  function toGregorianDate(year: Nullable<number>, month: Nullable<number>, day: Nullable<number>): Date | null {
    if (year === "" || month === "" || day === "") return null;
    return calendarType === "ethiopian" ? ethiopianToGregorian(year, month, day) : new Date(year, month - 1, day);
  }

  const fromDate = useMemo(() => toGregorianDate(fromYear, fromMonth, fromDay), [calendarType, fromYear, fromMonth, fromDay]);
  const toDate = useMemo(() => toGregorianDate(toYear, toMonth, toDay), [calendarType, toYear, toMonth, toDay]);

  const effectiveRange = useMemo(() => {
    if (fromDate && toDate) {
      const start = fromDate <= toDate ? fromDate : toDate;
      const end = fromDate <= toDate ? toDate : fromDate;
      return { date_from: toIsoDateLocal(start), date_to: toIsoDateLocal(end) };
    }
    if (fromDate && !toDate) {
      const iso = toIsoDateLocal(fromDate);
      return { date_from: iso, date_to: iso };
    }
    const monday = mondayOf(new Date());
    const sunday = addDays(monday, 6);
    return { date_from: toIsoDateLocal(monday), date_to: toIsoDateLocal(sunday) };
  }, [fromDate, toDate]);

  async function load() {
    setLoading(true);
    try {
      const res = await getPitchWeeklyGrid(pitch.id, {
        date_from: effectiveRange.date_from,
        date_to: effectiveRange.date_to,
        name: debouncedName || undefined,
        start_hour: hourRange.start,
        end_hour: hourRange.end,
      });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch.id, effectiveRange.date_from, effectiveRange.date_to, debouncedName, hourRange.start, hourRange.end]);

    const openingHour = pitch.opening_time ? Number(pitch.opening_time.split(":")[0]) : 8;
  const closingHour = pitch.closing_time ? Number(pitch.closing_time.split(":")[0]) : 22;
  const hourOptions = useMemo(
    () => Array.from({ length: closingHour - openingHour }, (_, i) => openingHour + i),
    [openingHour, closingHour]
  );

  function formatHourLabel(hour24: number): string {
    return calendarType === "ethiopian" ? formatEthiopianHourLabel(hour24) : formatGregorianHourLabel(hour24);
  }

  // "To" options are hours strictly after the selected "From" hour, so
  // e.g. From = 07:00 excludes 08:00 and earlier from "To" — wait, keeps
  // 08:00 onward. Nothing before/equal to From is selectable.
  const toHourOptions = useMemo(
    () => (hourRange.start !== undefined ? hourOptions.filter((h) => h + 1 > hourRange.start!) : []),
    [hourOptions, hourRange.start]
  );

  function handleCalendarTypeChange(next: CalendarType) {
    setCalendarType(next);
    setFromYear(""); setFromMonth(""); setFromDay("");
    setToYear(""); setToMonth(""); setToDay("");
  }

  function handleClear() {
    setCalendarType("ethiopian");
    setFromYear(""); setFromMonth(""); setFromDay("");
    setToYear(""); setToMonth(""); setToDay("");
    setNameFilter("");
    setHourRange({});
  }

  function popupAnchor(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = rect.right;
    let y = rect.top;
    const popupWidth = 280;
    if (rect.right + popupWidth > window.innerWidth) {
      x = rect.left - popupWidth + rect.width;
    }
    return { x, y };
  }

    function isPastSlot(dateStr: string, startHour: number): boolean {
    const slotStart = new Date(dateStr + "T00:00:00");
    slotStart.setHours(startHour, 0, 0, 0);
    return slotStart.getTime() <= Date.now();
  }

  function onCellClick(e: React.MouseEvent, day: { date: string }, hour: GridHour, cell: GridCell | undefined) {
    const { x, y } = popupAnchor(e);
    // Booked or closed cells: show the read-only info popup.
    if (cell && (cell.status === "booked" || cell.status === "closed")) {
      setPopup({ kind: "info", cell, x, y });
      return;
    }
    if (isPastSlot(day.date, hour.start_hour)) {
      return; // past + free -> not bookable, do nothing
    }
    setBookForm({ name: "", phone: "", price: "" });
    setBookPhoneError("");
    setCloseForm({ reason: "" });
    setPopupTab("book");
    setPopup({ kind: "book", date: day.date, start_hour: hour.start_hour, label: hour.label, x, y });
  }

  async function submitBooking() {
    if (popup?.kind !== "book" || !bookForm.name.trim()) return;

    const normalizedPhone = normalizeEthiopianPhone(bookForm.phone);
    if (!normalizedPhone) {
      setBookPhoneError("Enter a valid phone: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.");
      return;
    }
    setBookPhoneError("");

    setSaving(true);
    try {
      const res = await bookGridSlot(pitch.id, {
        date: popup.date,
        start_hour: popup.start_hour,
        name: bookForm.name.trim(),
        phone: normalizedPhone,
        price: bookForm.price.trim() || undefined,
      });
      const key = `${popup.date}_${popup.start_hour}`;
      setData((prev) => (prev ? { ...prev, cells: { ...prev.cells, [key]: res.cell } } : prev));
      setPopup(null);
    } catch {
      // keep the popup open so the owner can retry
    } finally {
      setSaving(false);
    }
  }

  async function submitClose() {
    if (popup?.kind !== "book" || !closeForm.reason.trim()) return;

    setSaving(true);
    try {
      const res = await closeGridSlot(pitch.id, {
        date: popup.date,
        start_hour: popup.start_hour,
        reason: closeForm.reason.trim(),
      });
      const key = `${popup.date}_${popup.start_hour}`;
      setData((prev) => (prev ? { ...prev, cells: { ...prev.cells, [key]: res.cell } } : prev));
      setPopup(null);
    } catch {
      // keep the popup open so the owner can retry
    } finally {
      setSaving(false);
    }
  }

  function dayColumnLabel(day: { date: string }) {
    const gDate = new Date(day.date + "T00:00:00");
    const weekdayAm = amharicWeekday(gDate);
    const dateSub =
      calendarType === "ethiopian"
        ? formatEthiopianDateShort(gregorianToEthiopian(gDate))
        : gDate.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    return { weekdayAm, dateSub };
  }

  function hourRowLabel(hour: GridHour) {
    return calendarType === "ethiopian" ? formatEthiopianHourRange(hour.start_hour, hour.end_hour) : hour.label;
  }

  function rangeSummary() {
    if (!data) return "";
    const start = new Date(data.date_from + "T00:00:00");
    const end = new Date(data.date_to + "T00:00:00");
    const label = (d: Date) =>
      calendarType === "ethiopian"
        ? formatEthiopianDateShort(gregorianToEthiopian(d))
        : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
    return start.getTime() === end.getTime() ? label(start) : `${label(start)} – ${label(end)}`;
  }

  return (
    <div className={styles.wrap}>
      {/* ready=!!data: the grid's cells (the tour's actual targets) don't
          exist until the first load finishes, so the tour waits for that
          instead of racing the initial fetch. */}
      <TourGuide page="bookingGrid" waitForPage="appshell" ready={!!data} />

      <div className={styles.sectionLabel}>Booking grid</div>

      <div className={styles.calendarToggle}>
        <button
          className={`${styles.calToggleBtn} ${calendarType === "ethiopian" ? styles.calToggleBtnActive : ""}`}
          onClick={() => handleCalendarTypeChange("ethiopian")}
          data-tour="tour-cal-ethiopian"
        >
          የኢትዮጵያ ቀን መቁጠሪያ
        </button>
        <button
          className={`${styles.calToggleBtn} ${calendarType === "gregorian" ? styles.calToggleBtnActive : ""}`}
          onClick={() => handleCalendarTypeChange("gregorian")}
          data-tour="tour-cal-gregorian"
        >
          Gregorian
        </button>
      </div>

      {/* ---------- filters ---------- */}
      <div className={styles.filterBar}>
        <div className={styles.filterRow}>
          <input
            className={styles.filterInput}
            placeholder="Search by name…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>

        <div className={styles.filterRow}>
          <DateGroup
            label="From"
            calendarType={calendarType}
            year={fromYear} month={fromMonth} day={fromDay}
            onYear={setFromYear} onMonth={setFromMonth} onDay={setFromDay}
            yearOptions={yearOptions} dayOptions={fromDayOptions}
          />
          <span className={styles.toDivider}>to</span>
          <DateGroup
            label="To"
            calendarType={calendarType}
            year={toYear} month={toMonth} day={toDay}
            onYear={setToYear} onMonth={setToMonth} onDay={setToDay}
            yearOptions={yearOptions} dayOptions={toDayOptions}
          />
        </div>

               <div className={styles.filterRow}>
          <div className={styles.timeFilterGroup}>
            <span className={styles.dateGroupLabel}>Time</span>
            <div className={styles.timeFilterSelects}>
              <span className={styles.clockWrap}>
                <ClockIcon />
                <select
                  className={styles.filterSelect}
                  value={hourRange.start ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    setHourRange((r) => ({
                      start: val,
                      // if the old "To" is no longer after the new "From", clear it
                      end: val !== undefined && r.end !== undefined && r.end > val ? r.end : undefined,
                    }));
                  }}
                >
                  <option value="">From</option>
                  {hourOptions.map((h) => (
                    <option key={h} value={h}>{formatHourLabel(h)}</option>
                  ))}
                </select>
              </span>
              <span className={styles.toDivider}>to</span>
              <span className={`${styles.clockWrap} ${hourRange.start === undefined ? styles.clockWrapDisabled : ""}`}>
                <ClockIcon />
                <select
                  className={styles.filterSelect}
                  value={hourRange.end ?? ""}
                  disabled={hourRange.start === undefined}
                  onChange={(e) => setHourRange((r) => ({ ...r, end: e.target.value ? Number(e.target.value) : undefined }))}
                >
                  <option value="">To</option>
                  {toHourOptions.map((h) => (
                    <option key={h} value={h + 1}>{formatHourLabel(h + 1)}</option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.filterRow}>
          <button className={styles.clearBtn} onClick={handleClear}>Clear</button>
        </div>
      </div>

      {data && <div className={styles.rangeSummary}>Showing: {rangeSummary()}</div>}

      {/* ---------- grid: hours = rows, days = columns ---------- */}
      <div className={`${styles.gridScroller} ${loading ? styles.shimmerActive : ""}`}>
        <table className={styles.gridTable}>
          <colgroup>
            <col className={styles.timeCol} />
            {data?.days.map((day) => <col key={day.date} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={styles.timeHeaderCorner}>Time</th>
              {data?.days.map((day) => {
                const { weekdayAm, dateSub } = dayColumnLabel(day);
                return (
                  <th key={day.date} className={styles.dayHeader}>
                    <span className={styles.dayHeaderWeekday}>{weekdayAm}</span>
                    <span className={styles.dayHeaderDate}>{dateSub}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data?.hours.map((h, rowIdx) => (
              <tr key={h.start_hour} className={rowIdx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                <th className={styles.timeLabel}>{hourRowLabel(h)}</th>
                                {data.days.map((day, dayIdx) => {
                  const key = `${day.date}_${h.start_hour}`;
                  const cell = data.cells[key];
                  const booked = cell?.status === "booked";
                  const closed = cell?.status === "closed";
                  const past = !booked && !closed && isPastSlot(day.date, h.start_hour);
                  const cellClass = booked
                    ? styles.gridCellBooked
                    : closed
                    ? styles.gridCellPast
                    : past
                    ? styles.gridCellPast
                    : styles.gridCellFree;

                  // Tour anchors: 2nd row (rowIdx 1), 3rd column (dayIdx 2)
                  // explains a passed/unbookable slot; 2nd row, 6th column
                  // (dayIdx 5) explains a free/bookable slot. Position-based
                  // on purpose — the grid is always 14 rows x 7 columns and
                  // "today" always falls early in the visible week, so these
                  // two cells are reliably past/free respectively.
                  const tourTarget =
                    rowIdx === 1 && dayIdx === 2
                      ? "tour-cell-past"
                      : rowIdx === 1 && dayIdx === 5
                      ? "tour-cell-free"
                      : undefined;

                  return (
                    <td
                      key={key}
                      className={`${styles.gridCell} ${cellClass}`}
                      onClick={(e) => onCellClick(e, day, h, cell)}
                      data-tour={tourTarget}
                    >
                      {booked ? (
                        <span className={styles.cellName} title={cell?.name}>{cell?.name}</span>
                      ) : closed ? (
                        <span className={styles.cellName} title={cell?.reason || "Closed"}>Closed</span>
                      ) : past ? (
                        <span className={styles.cellPastDot} />
                      ) : (
                        <span className={styles.cellFreeDot} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- info popup (booked or closed cell) ---------- */}
      {popup?.kind === "info" && (
        <>
          <div className={styles.popupBackdrop} onClick={() => setPopup(null)} />
          <div className={styles.popupCard} style={{ left: popup.x, top: popup.y }}>
            <div className={styles.popupArrow} />
            <div className={styles.popupHead}>
              <span className={`${styles.popupTag} ${popup.cell.kind === "manual" || popup.cell.kind === "closed" ? styles.popupTagManual : styles.popupTagIndividual}`}>
                {popup.cell.kind === "team"
                  ? "Team booking"
                  : popup.cell.kind === "closed"
                  ? "Closed by owner"
                  : popup.cell.kind === "manual"
                  ? "Entered by owner"
                  : "Booked in-app"}
              </span>
            </div>
            <div className={styles.popupName}>
              {popup.cell.kind === "closed" ? "Closed" : popup.cell.name}
            </div>
            <div className={styles.popupRow}><span>Time</span><b>{popup.cell.time_label}</b></div>

            {popup.cell.kind === "closed" ? (
              <div className={styles.popupRow}><span>Reason</span><b>{popup.cell.reason || "—"}</b></div>
            ) : (
              <>
                {popup.cell.amount && <div className={styles.popupRow}><span>Paid</span><b>{formatBirr(popup.cell.amount)}</b></div>}
                {popup.cell.phone && <div className={styles.popupRow}><span>Phone</span><b>{popup.cell.phone}</b></div>}
                {popup.cell.email && <div className={styles.popupRow}><span>Email</span><b>{popup.cell.email}</b></div>}
              </>
            )}
          </div>
        </>
      )}

      {/* ---------- free-cell popup: Book / Close tabs ---------- */}
      {popup?.kind === "book" && (
        <>
          <div className={styles.popupBackdrop} onClick={() => setPopup(null)} />
          <div className={styles.popupCard} style={{ left: popup.x, top: popup.y }}>
            <div className={styles.popupArrow} />

            <div className={styles.calendarToggle} style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`${styles.calToggleBtn} ${popupTab === "book" ? styles.calToggleBtnActive : ""}`}
                onClick={() => setPopupTab("book")}
              >
                Book
              </button>
              <button
                type="button"
                className={`${styles.calToggleBtn} ${popupTab === "close" ? styles.calToggleBtnActive : ""}`}
                onClick={() => setPopupTab("close")}
              >
                Close
              </button>
            </div>

            <div className={styles.popupHead}>
              <span className={styles.popupTagFree}>Free — {popup.label}</span>
            </div>

            {popupTab === "book" ? (
              <>
                <div className={styles.bookFormGrid}>
                  <input
                    className={styles.bookInput}
                    placeholder="Name *"
                    value={bookForm.name}
                    onChange={(e) => setBookForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                  <input
                    className={styles.bookInput}
                    placeholder="Phone (09xxxxxxxx) *"
                    value={bookForm.phone}
                    onChange={(e) => {
                      setBookForm((f) => ({ ...f, phone: e.target.value }));
                      if (bookPhoneError) setBookPhoneError("");
                    }}
                  />
                  <input
                    className={styles.bookInput}
                    placeholder="Price (Br)"
                    value={bookForm.price}
                    onChange={(e) => setBookForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </div>
                {bookPhoneError && (
                  <div className={styles.popupErrorText}>{bookPhoneError}</div>
                )}
                <button
                  className={styles.bookBtn}
                  disabled={!bookForm.name.trim() || !bookForm.phone.trim() || saving}
                  onClick={submitBooking}
                >
                  {saving ? "Booking…" : "Book"}
                </button>
              </>
            ) : (
              <>
                <div className={styles.bookFormGrid}>
                  <input
                    className={styles.bookInput}
                    placeholder="Reason *"
                    value={closeForm.reason}
                    onChange={(e) => setCloseForm({ reason: e.target.value })}
                    autoFocus
                  />
                </div>
                <button
                  className={styles.closeSlotBtn}
                  disabled={!closeForm.reason.trim() || saving}
                  onClick={submitClose}
                >
                  {saving ? "Closing…" : "Close"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
