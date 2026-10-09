import { useEffect, useMemo, useRef, useState } from "react";
import type { Pitch } from "../lib/pitches";
import {
  getPitchWeeklyGrid,
  bookGridSlot,
  closeGridSlot,
  bookGridSlotsBulk,
  closeGridSlotsBulk,
} from "../lib/pitches";
import type { GridCell, GridHour, GridSlotRef } from "../lib/pitches";
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
type Nullable<T> = T | "";
type PopupTab = "book" | "close";

type CellPos = { r: number; c: number };
type DragSource = "mouse" | "touch";
type DragState = {
  anchor: CellPos;
  current: CellPos;
  source: DragSource;
  startX: number;
  startY: number;
  moved: boolean;
};
type Selection = { anchor: CellPos; current: CellPos };

type GridData = {
  date_from: string;
  date_to: string;
  days: { date: string; weekday: string; weekday_short: string; display_date: string }[];
  hours: GridHour[];
  cells: Record<string, GridCell>;
};

type PopupState =
  | { kind: "info"; cell: GridCell; x: number; y: number }
  | { kind: "book"; slots: GridSlotRef[]; label: string; x: number; y: number }
  | null;

/* ---------- drag / layout tuning ---------- */
const LONG_PRESS_MS = 280;      // touch: press-and-hold time before drag starts
const TOUCH_SLOP_PX = 8;        // touch: finger movement that cancels a long-press (= user is scrolling)
const DRAG_START_PX = 6;        // movement before edge auto-scroll is allowed
const EDGE_ZONE_PX = 44;        // distance from scroller edge that triggers auto-scroll
const MAX_SCROLL_STEP = 18;     // max px per frame while auto-scrolling
const POPUP_WIDTH = 260;
const POPUP_HEIGHT = 330;
const PRICE_CALC_MS = 350;      // short shimmer while the popup works out the total price
const WINDOW_DAYS = 7;          // columns shown in the default view
const PAGE_STEP_DAYS = 6;       // arrow step: pages overlap by one day (e.g. 3–9, 9–15, 15–21)

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

function extractErrorMessage(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : "Something went wrong. Please try again.";
}

function isPastSlot(dateStr: string, startHour: number): boolean {
  const slotStart = new Date(dateStr + "T00:00:00");
  slotStart.setHours(startHour, 0, 0, 0);
  return slotStart.getTime() <= Date.now();
}

/** Which grid cell (row/col index) is under a screen point, if any. */
function cellFromPoint(x: number, y: number): CellPos | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const td = el?.closest<HTMLElement>("[data-r][data-c]");
  if (!td) return null;
  const r = Number(td.dataset.r);
  const c = Number(td.dataset.c);
  return Number.isNaN(r) || Number.isNaN(c) ? null : { r, c };
}

/** Fixed-position popup coordinates, kept fully inside the viewport. */
function popupPositionFor(el: HTMLElement | null) {
  if (!el) return { x: 12, y: 12 };
  const rect = el.getBoundingClientRect();
  let x = rect.right;
  if (rect.right + POPUP_WIDTH + 12 > window.innerWidth) {
    x = rect.left - POPUP_WIDTH + rect.width;
  }
  x = Math.max(8, Math.min(x, window.innerWidth - POPUP_WIDTH - 8));
  const y = Math.max(8, Math.min(rect.top, window.innerHeight - POPUP_HEIGHT));
  return { x, y };
}

function edgeStep(depth: number) {
  return Math.min(MAX_SCROLL_STEP, 4 + depth / 3);
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

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
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

  // Default view paging: -1 = earlier days, 0 = starts today, +1 = later days.
  const [pageOffset, setPageOffset] = useState(0);

  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<PopupState>(null);
  const [popupTab, setPopupTab] = useState<PopupTab>("book");
  const [bookForm, setBookForm] = useState({ name: "", phone: "", price: "" });
  const [closeForm, setCloseForm] = useState({ reason: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // drag-selection + scroller UI state
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [canScroll, setCanScroll] = useState(false);

  // refs used by the (non-React) drag machinery so handlers never see stale state
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<GridData | null>(null);
  dataRef.current = data;
  const dragRef = useRef<DragState | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

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
    // Default view: a 7-day window that starts TODAY, shifted by the arrows
    // (-1 / 0 / +1 pages; each page moves 6 days so the boundary day overlaps).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = addDays(today, pageOffset * PAGE_STEP_DAYS);
    const end = addDays(start, WINDOW_DAYS - 1);
    return { date_from: toIsoDateLocal(start), date_to: toIsoDateLocal(end) };
  }, [fromDate, toDate, pageOffset]);

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

  // "To" options are hours strictly after the selected "From" hour.
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
    setPageOffset(0);
  }

  // ---- Arrow paging (default view only; a custom From/To range disables the arrows) ----
  // Offsets are bounded to -1..+1, so each arrow works once in its direction.
  // From an end page, the opposite arrow therefore needs two clicks to reach the far side.
  const customDateRange = !!fromDate;
  const prevDisabled = customDateRange || loading || pageOffset <= -1;
  const nextDisabled = customDateRange || loading || pageOffset >= 1;

  function goPrevDays() {
    setPageOffset((o) => Math.max(-1, o - 1));
  }

  function goNextDays() {
    setPageOffset((o) => Math.min(1, o + 1));
  }

  // The tour's "passed slot" step needs a cell that really is in the past. The view now
  // starts today, so pick the first free-but-past cell instead of a fixed grid position.
  const pastTourKey = useMemo(() => {
    if (!data) return null;
    for (const day of data.days) {
      for (const h of data.hours) {
        const key = `${day.date}_${h.start_hour}`;
        const cell = data.cells[key];
        if ((!cell || cell.status === "free") && isPastSlot(day.date, h.start_hour)) return key;
      }
    }
    return null;
  }, [data]);

  /* =====================================================================
   * Horizontal scroller state (shadow on the sticky time column + hint)
   * ===================================================================== */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      setScrolled(el.scrollLeft > 2);
      setCanScroll(el.scrollWidth > el.clientWidth + 2);
    };
    update();

    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const table = el.querySelector("table");
    if (table) ro.observe(table);

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [data]);

  /* =====================================================================
   * Drag selection
   * ===================================================================== */

  /** A cell can be selected only if it is free (no booking / closure) and not in the past. */
  function isCellSelectable(r: number, c: number): boolean {
    const d = dataRef.current;
    if (!d) return false;
    const day = d.days[c];
    const hour = d.hours[r];
    if (!day || !hour) return false;
    const cell = d.cells[`${day.date}_${hour.start_hour}`];
    if (cell && cell.status !== "free") return false;
    return !isPastSlot(day.date, hour.start_hour);
  }

  /** Every selectable cell inside the rectangle spanned by two corner cells. */
  function collectSlots(a: CellPos, b: CellPos): GridSlotRef[] {
    const d = dataRef.current;
    if (!d) return [];
    const r1 = Math.min(a.r, b.r);
    const r2 = Math.max(a.r, b.r);
    const c1 = Math.min(a.c, b.c);
    const c2 = Math.max(a.c, b.c);
    const out: GridSlotRef[] = [];
    for (let c = c1; c <= c2; c++) {
      for (let r = r1; r <= r2; r++) {
        if (isCellSelectable(r, c)) {
          out.push({ date: d.days[c].date, start_hour: d.hours[r].start_hour });
        }
      }
    }
    return out;
  }

  function stopLoop() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // One frame of the drag: edge auto-scroll + "which cell is under the pointer now?"
  function tick() {
    const drag = dragRef.current;
    if (!drag) {
      rafRef.current = null;
      return;
    }
    const { x, y } = pointerRef.current;

    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > DRAG_START_PX) {
      drag.moved = true;
    }

    if (drag.moved) {
      const sc = scrollerRef.current;
      if (sc) {
        const rect = sc.getBoundingClientRect();
        const stickyW = sc.querySelector<HTMLElement>("th")?.offsetWidth ?? 0;
        const leftEdge = rect.left + stickyW + EDGE_ZONE_PX;
        const rightEdge = rect.right - EDGE_ZONE_PX;
        if (x > rightEdge) sc.scrollLeft += edgeStep(x - rightEdge);
        else if (x < leftEdge) sc.scrollLeft -= edgeStep(leftEdge - x);
      }
      if (y < 56) window.scrollBy(0, -12);
      else if (y > window.innerHeight - 56) window.scrollBy(0, 12);
    }

    const pos = cellFromPoint(x, y);
    if (pos && (pos.r !== drag.current.r || pos.c !== drag.current.c)) {
      drag.current = pos;
      setSelection({ anchor: drag.anchor, current: pos });
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function beginDrag(pos: CellPos, source: DragSource, x: number, y: number) {
    dragRef.current = { anchor: pos, current: pos, source, startX: x, startY: y, moved: false };
    pointerRef.current = { x, y };
    setSelection({ anchor: pos, current: pos });
    setIsDragging(true);
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancelDrag() {
    stopLoop();
    dragRef.current = null;
    setIsDragging(false);
    setSelection(null);
  }

  function finishDrag() {
    const drag = dragRef.current;
    if (!drag) return;

    stopLoop();
    dragRef.current = null;
    setIsDragging(false);

    const finalPos = cellFromPoint(pointerRef.current.x, pointerRef.current.y) ?? drag.current;
    const slots = collectSlots(drag.anchor, finalPos);
    if (slots.length === 0) {
      setSelection(null);
      return;
    }

    setSelection({ anchor: drag.anchor, current: finalPos });

    const d = dataRef.current;
    const label =
      slots.length === 1
        ? `Free — ${d?.hours.find((h) => h.start_hour === slots[0].start_hour)?.label ?? ""}`
        : `${slots.length} free slots selected`;

    const anchorEl = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-r="${finalPos.r}"][data-c="${finalPos.c}"]`
    );
    const { x, y } = popupPositionFor(anchorEl ?? null);

    setBookForm({ name: "", phone: "", price: "" });
    setCloseForm({ reason: "" });
    setFormError("");
    setPopupTab("book");
    setCalculating(true); // shimmer until the total price is filled in (see effect below)
    setPopup({ kind: "book", slots, label, x, y });
  }

  // Always-fresh handles so the long-lived listeners below never call stale closures.
  const actionsRef = useRef({ beginDrag, finishDrag, cancelDrag });
  actionsRef.current = { beginDrag, finishDrag, cancelDrag };

  // Mouse: window-level move/up so the drag survives leaving the grid; Esc cancels.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragRef.current?.source === "mouse") {
        pointerRef.current = { x: e.clientX, y: e.clientY };
      }
    }
    function onUp() {
      if (dragRef.current?.source === "mouse") actionsRef.current.finishDrag();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dragRef.current) actionsRef.current.cancelDrag();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Touch: press-and-hold starts the drag (a quick swipe still scrolls the grid).
  // A plain tap falls through to the browser's emulated mouse events, which open the popup.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let timer: number | null = null;
    let pending: CellPos | null = null;
    let startX = 0;
    let startY = 0;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      pending = null;
    };

    function onTouchStart(e: TouchEvent) {
      clearTimer();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const pos = cellFromPoint(t.clientX, t.clientY);
      if (!pos || !isCellSelectable(pos.r, pos.c)) return;

      startX = t.clientX;
      startY = t.clientY;
      pending = pos;
      timer = window.setTimeout(() => {
        timer = null;
        if (!pending) return;
        actionsRef.current.beginDrag(pending, "touch", startX, startY);
        pending = null;
        if (typeof navigator.vibrate === "function") navigator.vibrate(12);
      }, LONG_PRESS_MS);
    }

    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      if (dragRef.current?.source === "touch") {
        e.preventDefault(); // we own the gesture now: stop the page/grid from scrolling
        pointerRef.current = { x: t.clientX, y: t.clientY };
        return;
      }
      if (timer !== null && (Math.abs(t.clientX - startX) > TOUCH_SLOP_PX || Math.abs(t.clientY - startY) > TOUCH_SLOP_PX)) {
        clearTimer(); // finger moved before the long-press fired → the user is scrolling
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (dragRef.current?.source === "touch") {
        e.preventDefault(); // suppress the emulated mouse events after a drag
        actionsRef.current.finishDrag();
      }
      clearTimer();
    }

    function onTouchCancel() {
      if (dragRef.current?.source === "touch") actionsRef.current.cancelDrag();
      clearTimer();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      clearTimer();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  // Cells currently highlighted as part of the selection.
  const selectedKeys = useMemo(() => {
    const set = new Set<string>();
    if (!selection || !data) return set;
    const r1 = Math.min(selection.anchor.r, selection.current.r);
    const r2 = Math.max(selection.anchor.r, selection.current.r);
    const c1 = Math.min(selection.anchor.c, selection.current.c);
    const c2 = Math.max(selection.anchor.c, selection.current.c);
    for (let c = c1; c <= c2; c++) {
      const day = data.days[c];
      if (!day) continue;
      for (let r = r1; r <= r2; r++) {
        const hour = data.hours[r];
        if (!hour) continue;
        const key = `${day.date}_${hour.start_hour}`;
        const cell = data.cells[key];
        if (cell && cell.status !== "free") continue;
        if (isPastSlot(day.date, hour.start_hour)) continue;
        set.add(key);
      }
    }
    return set;
  }, [selection, data]);

  function onCellMouseDown(e: React.MouseEvent, r: number, c: number) {
    if (e.button !== 0) return;
    if (!isCellSelectable(r, c)) return;
    e.preventDefault(); // no text selection while dragging
    beginDrag({ r, c }, "mouse", e.clientX, e.clientY);
  }

  // Booked / closed cells keep the simple click → read-only info popup.
  function onInfoCellClick(e: React.MouseEvent, cell: GridCell) {
    const { x, y } = popupPositionFor(e.currentTarget as HTMLElement);
    setPopup({ kind: "info", cell, x, y });
  }

  function closePopup() {
    setPopup(null);
    setSelection(null);
    setFormError("");
  }

  // Pitch price per hour; every grid cell is exactly one hour.
  const hourlyRate = Number(pitch.hourly_price) || 0;

  // When the Book/Close popup opens: total = hourly price × number of selected cells,
  // written into the (still editable) price field once the shimmer finishes.
  useEffect(() => {
    if (popup?.kind !== "book") {
      setCalculating(false);
      return;
    }
    const count = popup.slots.length;
    const timer = window.setTimeout(() => {
      const total = Math.round(hourlyRate * count * 100) / 100;
      setBookForm((f) => ({ ...f, price: total > 0 ? String(total) : "" }));
      setCalculating(false);
    }, PRICE_CALC_MS);
    return () => window.clearTimeout(timer);
  }, [popup, hourlyRate]);

  /* =====================================================================
   * Submit: one slot → existing endpoints, several slots → bulk endpoints
   * ===================================================================== */
  async function submitBooking() {
    if (popup?.kind !== "book" || !bookForm.name.trim()) return;

    const normalizedPhone = normalizeEthiopianPhone(bookForm.phone);
    if (!normalizedPhone) {
      setFormError("Enter a valid phone: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.");
      return;
    }
    const priceText = bookForm.price.trim();
    if (priceText && !/^\d+(\.\d{1,2})?$/.test(priceText)) {
      setFormError("Enter a valid price, for example 1000 or 1000.50.");
      return;
    }
    setFormError("");

    setSaving(true);
    try {
      const name = bookForm.name.trim();
      const price = priceText || undefined;
      let cells: Record<string, GridCell>;

      if (popup.slots.length === 1) {
        const s = popup.slots[0];
        const res = await bookGridSlot(pitch.id, {
          date: s.date,
          start_hour: s.start_hour,
          name,
          phone: normalizedPhone,
          price,
        });
        cells = { [`${s.date}_${s.start_hour}`]: res.cell };
      } else {
        const res = await bookGridSlotsBulk(pitch.id, {
          slots: popup.slots,
          name,
          phone: normalizedPhone,
          total_price: price,
        });
        cells = res.cells;
      }

      setData((prev) => (prev ? { ...prev, cells: { ...prev.cells, ...cells } } : prev));
      closePopup();
    } catch (err) {
      setFormError(extractErrorMessage(err)); // popup stays open so the owner can retry
    } finally {
      setSaving(false);
    }
  }

  async function submitClose() {
    if (popup?.kind !== "book" || !closeForm.reason.trim()) return;

    setFormError("");
    setSaving(true);
    try {
      const reason = closeForm.reason.trim();
      let cells: Record<string, GridCell>;

      if (popup.slots.length === 1) {
        const s = popup.slots[0];
        const res = await closeGridSlot(pitch.id, {
          date: s.date,
          start_hour: s.start_hour,
          reason,
        });
        cells = { [`${s.date}_${s.start_hour}`]: res.cell };
      } else {
        const res = await closeGridSlotsBulk(pitch.id, { slots: popup.slots, reason });
        cells = res.cells;
      }

      setData((prev) => (prev ? { ...prev, cells: { ...prev.cells, ...cells } } : prev));
      closePopup();
    } catch (err) {
      setFormError(extractErrorMessage(err));
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

  const slotCount = popup?.kind === "book" ? popup.slots.length : 0;

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
      <div className={styles.gridHint}>
        Drag across free cells to select several at once (on a phone, press and hold first).
        {canScroll ? " Scroll sideways to see every day." : ""}
      </div>

      {/* ---------- grid: hours = rows, days = columns ---------- */}
      <div
        ref={scrollerRef}
        className={`${styles.gridScroller} ${loading ? styles.shimmerActive : ""} ${scrolled ? styles.gridScrolled : ""} ${isDragging ? styles.gridDragging : ""}`}
        style={{ "--day-count": data?.days.length ?? 7 } as React.CSSProperties}
        onContextMenu={(e) => {
          if (dragRef.current) e.preventDefault(); // long-press menu must not interrupt a touch drag
        }}
      >
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
                  const selected = !booked && !closed && !past && selectedKeys.has(key);
                  const cellClass = booked
                    ? styles.gridCellBooked
                    : closed
                    ? styles.gridCellPast
                    : past
                    ? styles.gridCellPast
                    : selected
                    ? styles.gridCellSelected
                    : styles.gridCellFree;

                  // Tour anchors: the first free-but-past cell explains a passed/unbookable
                  // slot (the view now starts today, so it is looked up, not fixed by
                  // position); 2nd row, 6th column (dayIdx 5) explains a free/bookable slot.
                  const tourTarget =
                    key === pastTourKey
                      ? "tour-cell-past"
                      : rowIdx === 1 && dayIdx === 5
                      ? "tour-cell-free"
                      : undefined;

                  return (
                    <td
                      key={key}
                      data-r={rowIdx}
                      data-c={dayIdx}
                      className={`${styles.gridCell} ${cellClass}`}
                      onMouseDown={(e) => onCellMouseDown(e, rowIdx, dayIdx)}
                      onClick={(e) => {
                        if (cell && (booked || closed)) onInfoCellClick(e, cell);
                      }}
                      data-tour={tourTarget}
                    >
                      {booked ? (
                        <span className={styles.cellName} title={cell?.name}>{cell?.name}</span>
                      ) : closed ? (
                        <span className={styles.cellName} title={cell?.reason || "Closed"}>Closed</span>
                      ) : past ? (
                        <span className={styles.cellPastDot} />
                      ) : selected ? (
                        <span className={styles.cellSelectedDot} />
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

      {/* ---------- arrows: earlier days / later days ---------- */}
      <div className={styles.pager}>
        <button
          type="button"
          className={styles.pagerBtn}
          onClick={goPrevDays}
          disabled={prevDisabled}
          aria-label="Show earlier days"
          title="Earlier days"
        >
          <ArrowLeftIcon />
        </button>
         
        <button
          type="button"
          className={styles.pagerBtn}
          onClick={goNextDays}
          disabled={nextDisabled}
          aria-label="Show later days"
          title="Later days"
        >
          <ArrowRightIcon />
        </button>
      </div>

      {/* ---------- info popup (booked or closed cell) ---------- */}
      {popup?.kind === "info" && (
        <>
          <div className={styles.popupBackdrop} onClick={closePopup} />
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

      {/* ---------- free-cell popup: Book / Close tabs (1 or many slots) ---------- */}
      {popup?.kind === "book" && (
        <>
          <div className={styles.popupBackdrop} onClick={closePopup} />
          <div className={styles.popupCard} style={{ left: popup.x, top: popup.y }}>
            <div className={styles.popupArrow} />

            {calculating ? (
              <div className={styles.popupSkeleton} aria-busy="true" aria-label="Calculating price">
                <div className={`${styles.skelBlock} ${styles.skelTabs}`} />
                <div className={`${styles.skelBlock} ${styles.skelTag}`} />
                <div className={`${styles.skelBlock} ${styles.skelInput}`} />
                <div className={`${styles.skelBlock} ${styles.skelInput}`} />
                <div className={`${styles.skelBlock} ${styles.skelInput}`} />
                <div className={`${styles.skelBlock} ${styles.skelBtn}`} />
              </div>
            ) : (
            <>
            <div className={styles.calendarToggle} style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`${styles.calToggleBtn} ${popupTab === "book" ? styles.calToggleBtnActive : ""}`}
                onClick={() => { setPopupTab("book"); setFormError(""); }}
              >
                Book
              </button>
              <button
                type="button"
                className={`${styles.calToggleBtn} ${popupTab === "close" ? styles.calToggleBtnActive : ""}`}
                onClick={() => { setPopupTab("close"); setFormError(""); }}
              >
                Close
              </button>
            </div>

            <div className={styles.popupHead}>
              <span className={styles.popupTagFree}>{popup.label}</span>
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
                    inputMode="tel"
                    value={bookForm.phone}
                    onChange={(e) => {
                      setBookForm((f) => ({ ...f, phone: e.target.value }));
                      if (formError) setFormError("");
                    }}
                  />
                  <input
                    className={styles.bookInput}
                    placeholder="Total price (Br)"
                    inputMode="decimal"
                    value={bookForm.price}
                    onChange={(e) => {
                      setBookForm((f) => ({ ...f, price: e.target.value }));
                      if (formError) setFormError("");
                    }}
                  />
                  {hourlyRate > 0 && (
                    <div className={styles.priceHint}>
                      {slotCount} {slotCount === 1 ? "hour" : "hours"} × {formatBirr(hourlyRate)} = {formatBirr(hourlyRate * slotCount)}
                    </div>
                  )}
                </div>
                {formError && <div className={styles.popupErrorText}>{formError}</div>}
                <button
                  className={styles.bookBtn}
                  disabled={!bookForm.name.trim() || !bookForm.phone.trim() || saving}
                  onClick={submitBooking}
                >
                  {saving ? "Booking…" : slotCount > 1 ? `Book ${slotCount} slots` : "Book"}
                </button>
              </>
            ) : (
              <>
                <div className={styles.bookFormGrid}>
                  <input
                    className={styles.bookInput}
                    placeholder="Reason *"
                    value={closeForm.reason}
                    onChange={(e) => {
                      setCloseForm({ reason: e.target.value });
                      if (formError) setFormError("");
                    }}
                    autoFocus
                  />
                </div>
                {formError && <div className={styles.popupErrorText}>{formError}</div>}
                <button
                  className={styles.closeSlotBtn}
                  disabled={!closeForm.reason.trim() || saving}
                  onClick={submitClose}
                >
                  {saving ? "Closing…" : slotCount > 1 ? `Close ${slotCount} slots` : "Close"}
                </button>
              </>
            )}
            </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
