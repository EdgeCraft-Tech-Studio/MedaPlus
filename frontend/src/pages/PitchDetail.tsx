import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { me } from "../lib/auth";
import { createBooking, getPitchDetail } from "../lib/pitches";
import type {
  AvailabilityDay,
  AvailabilitySlot,
  ExistingBooking,
  MonthlyWeek,
  Pitch,
} from "../lib/pitches";
import styles from "./css/PitchDetail.module.css";
import LoadingBall from "./LoadingBall";
import { showToast } from "./Toast";
import ToastContainer from "./Toast";
import { getMyTeams, requestTeamBooking, type MyTeam } from "../lib/team";
import type { BookingStep } from "./BookingTeamModal";
import BookingTeamModal from "./BookingTeamModal";

type BookingMode = "daily" | "weekly" | "monthly";
type SelectedMap = Record<string, AvailabilitySlot>;

// The pitch payload may include a gallery of images (in addition to the
// single `cover_image_url`). Adjust the field name below if your API
// returns something different, e.g. `pitch.photos` or `pitch.gallery`.
type PitchImageEntry = string | { id?: string | number; image_url?: string; url?: string };
type PitchWithGallery = Pitch & { image_urls?: PitchImageEntry[] };

function priceForMode(pitch: Pitch, mode: BookingMode) {
  if (mode === "daily") return Number(pitch.hourly_price || 0);
  if (mode === "weekly") return Number(pitch.weekly_price || 0);
  return Number(pitch.monthly_price || 0);
}

function slotClassName(slot: AvailabilitySlot, selected: boolean) {
  if (slot.status === "BOOKED") return styles.slotBooked;
  if (!slot.is_available) return styles.slotUnavailable;
  if (selected) return styles.slotSelected;
  return styles.slotDefault;
}

function resolveImageUrl(entry: PitchImageEntry): string {
  if (typeof entry === "string") return entry;
  return entry.image_url || entry.url || "";
}

/* ---------- small inline icons (purely presentational) ---------- */

function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 1118.5 10c0 5.3-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ShirtIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M8 4L4 6.5 5.5 10l2-1V20h9V9l2 1L20 6.5 16 4l-2 1.5h-4L8 4z" />
    </svg>
  );
}

function ShowerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 9h12M8 13v.01M12 13v.01M16 13v.01M8 17v.01M12 17v.01M16 17v.01" />
      <path d="M17 6a5 5 0 00-10 0" />
    </svg>
  );
}

function ParkingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 17V7h3.5a2.75 2.75 0 010 5.5H9" />
    </svg>
  );
}

function LightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6h5.4c0-.6.3-1.2.8-1.6A6 6 0 0012 3z" />
    </svg>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M11 12h1v5h1" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}

function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function SearchOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export default function PitchDetail() {
  const { pitchId } = useParams();

  const [user, setUser] = useState<any>(null);
  const [pitch, setPitch] = useState<PitchWithGallery | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [monthlyWeeks, setMonthlyWeeks] = useState<MonthlyWeek[]>([]);
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [mode, setMode] = useState<BookingMode>("daily");
  const [selected, setSelected] = useState<SelectedMap>({});
  const [loading, setLoading] = useState(true);
  const [bookingMsg, setBookingMsg] = useState("");
  const [monthlyWeekIndex, setMonthlyWeekIndex] = useState(0);
  const [bookedForName, setBookedForName] = useState("");
  const [notes, setNotes] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [ownedTeams, setOwnedTeams] = useState<MyTeam[]>([]);
const [bookingStep, setBookingStep] = useState<BookingStep>("closed");
const [selectedTeam, setSelectedTeam] = useState<MyTeam | null>(null);
const [teamBookingLoading, setTeamBookingLoading] = useState(false);

  // ---------- days scroller: overflow + scroll-affordance state ----------
  const daysScrollRef = useRef<HTMLDivElement>(null);
  const [daysOverflow, setDaysOverflow] = useState(false);
  const [daysAtStart, setDaysAtStart] = useState(true);
  const [daysAtEnd, setDaysAtEnd] = useState(false);
  const [daysUserScrolled, setDaysUserScrolled] = useState(false);

  const role = user?.role;
  const isManager = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
  async function loadOwnedTeams() {
    try {
      const teams = await getMyTeams();
      setOwnedTeams(teams.filter((t) => t.role === "owner"));
    } catch {
      setOwnedTeams([]);
    }
  }
  loadOwnedTeams();
}, []);

  useEffect(() => {
    async function load() {
      if (!pitchId) return;
      try {
        const [u, data] = await Promise.all([me(), getPitchDetail(pitchId)]);
        setUser(u);
        setPitch(data.pitch);
        setDays(data.daily_weekly_days);
        setMonthlyWeeks(data.monthly_weeks);
        setExistingBookings(data.existing_bookings || []);
        setActiveImageIndex(0);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [pitchId]);

  const galleryImages = useMemo(() => {
    if (!pitch) return [];
    const fromGallery = (pitch.image_urls || [])
      .map(resolveImageUrl)
      .filter((url): url is string => Boolean(url));
    if (fromGallery.length > 0) return fromGallery;
    return pitch.cover_image_url ? [pitch.cover_image_url] : [];
  }, [pitch]);

  const hasMultipleImages = galleryImages.length > 1;
  const activeImage = galleryImages[activeImageIndex] || galleryImages[0];

  function goToPrevImage() {
    setActiveImageIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length);
  }

  function goToNextImage() {
    setActiveImageIndex((i) => (i + 1) % galleryImages.length);
  }

  const selectedList = useMemo(() => {
    return Object.values(selected).sort((a, b) => a.start_iso.localeCompare(b.start_iso));
  }, [selected]);

  const total = useMemo(() => {
    if (!pitch) return 0;
    return selectedList.length * priceForMode(pitch, mode);
  }, [pitch, mode, selectedList]);

  function toggleSlot(slot: AvailabilitySlot) {
    if (!slot.is_available) return;

    setSelected((prev) => {
      const next = { ...prev };
      if (next[slot.key]) delete next[slot.key];
      else next[slot.key] = slot;
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
    setBookedForName("");
    setNotes("");
    setBookingMsg("");
  }

  function applyWeek1ToAllWeeks() {
    if (monthlyWeeks.length < 4) return;

    const week1 = monthlyWeeks[0];
    const selectedWeek1 = Object.values(selected).filter((slot) =>
      week1.days.some((day) => day.slots.some((s) => s.key === slot.key))
    );

    if (!selectedWeek1.length) return;

    const patternMap = selectedWeek1.map((slot) => {
      const dayIndex = week1.days.findIndex((day) => day.slots.some((s) => s.key === slot.key));
      return { dayIndex, hour: slot.hour };
    });

    const nextSelected: SelectedMap = {};

    for (const week of monthlyWeeks) {
      for (const pattern of patternMap) {
        const day = week.days[pattern.dayIndex];
        if (!day) continue;
        const match = day.slots.find((s) => s.hour === pattern.hour && s.is_available);
        if (match) nextSelected[match.key] = match;
      }
    }

    setSelected(nextSelected);
  }

  const canApplyWeek1ToAll = useMemo(() => {
    if (monthlyWeeks.length < 4) return false;
    const week1 = monthlyWeeks[0];
    const selectedWeek1 = Object.values(selected).filter((slot) =>
      week1.days.some((day) => day.slots.some((s) => s.key === slot.key))
    );
    if (!selectedWeek1.length) return false;

    const patterns = selectedWeek1.map((slot) => {
      const dayIndex = week1.days.findIndex((day) => day.slots.some((s) => s.key === slot.key));
      return { dayIndex, hour: slot.hour };
    });

    for (let w = 1; w < monthlyWeeks.length; w++) {
      for (const pattern of patterns) {
        const day = monthlyWeeks[w].days[pattern.dayIndex];
        const match = day?.slots.find((s) => s.hour === pattern.hour && s.is_available);
        if (!match) return false;
      }
    }

    return true;
  }, [monthlyWeeks, selected]);

  const displayedDays =
    mode === "monthly" ? monthlyWeeks[monthlyWeekIndex]?.days || [] : days;

  // ---------- measure whether the days row actually overflows ----------
  function measureDaysOverflow() {
    const el = daysScrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setDaysOverflow(overflow);
    setDaysAtStart(el.scrollLeft <= 1);
    setDaysAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }

  useEffect(() => {
    measureDaysOverflow();
    const el = daysScrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => measureDaysOverflow());
    ro.observe(el);
    window.addEventListener("resize", measureDaysOverflow);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureDaysOverflow);
    };
    // re-measure whenever the visible set of days changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedDays]);

  function handleDaysScroll() {
    const el = daysScrollRef.current;
    if (!el) return;
    setDaysAtStart(el.scrollLeft <= 1);
    setDaysAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
    if (el.scrollLeft > 8 && !daysUserScrolled) setDaysUserScrolled(true);
  }

  // ---------- one-time "peek" nudge so users feel it's scrollable ----------
  useEffect(() => {
    const el = daysScrollRef.current;
    if (!el || !daysOverflow) return;

    // Capture the narrowed, non-null value in its own binding. TS can't
    // carry the `!el` guard above into a closure that runs later on a
    // requestAnimationFrame callback, so without this `node` would still
    // be typed HTMLDivElement | null inside tick().
    const node = el;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    setDaysUserScrolled(false);

    let cancelled = false;
    const distance = 46;
    const duration = 650;
    let start = 0;

    function easeOutCubic(x: number) {
      return 1 - Math.pow(1 - x, 3);
    }

    function tick(now: number) {
      if (cancelled) return;
      if (!start) start = now;
      const t = Math.min((now - start) / duration, 1);
      const progress =
        t < 0.5 ? easeOutCubic(t / 0.5) : 1 - easeOutCubic((t - 0.5) / 0.5);
      node.scrollLeft = progress * distance;
      if (t < 1) requestAnimationFrame(tick);
      else measureDaysOverflow();
    }

    const timeout = window.setTimeout(() => requestAnimationFrame(tick), 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysOverflow, mode, monthlyWeekIndex]);

  async function handleBook() {
    if (!pitch || !pitchId || selectedList.length === 0) return;

    const bookingType =
      mode === "daily" ? "HOURLY" : mode === "weekly" ? "WEEKLY" : "MONTHLY";

    try {
      const res = await createBooking({
        pitch_id: pitchId,
        booking_type: bookingType,
        selections: selectedList.map((s) => ({
          start_iso: s.start_iso,
          end_iso: s.end_iso,
        })),
        notes,
        manual_cash: isManager,
        booked_for_name: isManager ? bookedForName : "",
      });

      setBookingMsg(
        isManager
          ? `Slot occupied successfully. Booking code: ${res.booking_code}`
          : `Booking created successfully. Booking code: ${res.booking_code}`
      );
      showToast(
        isManager
          ? `Slot occupied. Booking code: ${res.booking_code}`
          : `Booking created. Booking code: ${res.booking_code}`,
        "create"
      );

      const refreshed = await getPitchDetail(pitchId);
      setPitch(refreshed.pitch);
      setDays(refreshed.daily_weekly_days);
      setMonthlyWeeks(refreshed.monthly_weeks);
      setExistingBookings(refreshed.existing_bookings || []);
      setSelected({});
      setBookedForName("");
      setNotes("");
    } catch (e: any) {
      const errMsg = e?.response?.data?.detail || "Booking failed.";
      setBookingMsg(errMsg);
      showToast(errMsg, "delete");
    }
  }



  function handleBookClick() {
  if (selectedList.length === 0) return;

  // Pitch owner/admin doing a manual cash booking — unchanged, instant.
  if (isManager) {
    handleBook();
    return;
  }

  // Regular player who owns at least one team — offer the choice.
  if (ownedTeams.length > 0) {
    setBookingStep("choice");
    return;
  }

  // No teams owned — book individually, as before.
  handleBook();
}

function closeBookingModal() {
  setBookingStep("closed");
  setSelectedTeam(null);
}

function chooseIndividualBooking() {
  setBookingStep("closed");
  handleBook();
}

function chooseTeamBooking() {
  setBookingStep("team-select");
}

function selectTeamForBooking(team: MyTeam) {
  setSelectedTeam(team);
}

function proceedToTeamConfirm() {
  if (selectedTeam) setBookingStep("team-confirm");
}

function backToChoiceStep() {
  setBookingStep("choice");
  setSelectedTeam(null);
}

function backToTeamSelectStep() {
  setBookingStep("team-select");
}

async function handleConfirmTeamBooking() {
  if (!pitch || !pitchId || !selectedTeam || selectedList.length === 0) return;

  const bookingType =
    mode === "daily" ? "HOURLY" : mode === "weekly" ? "WEEKLY" : "MONTHLY";
  const memberCount = selectedTeam.active_member_count || 1;
  const perMember = total / memberCount;

  setTeamBookingLoading(true);
  try {
        await requestTeamBooking({
      pitch_id: pitchId,
      pitch_name: pitch.name,
      team_id: selectedTeam.id,
      booking_type: bookingType,
      selections: selectedList.map((s) => ({
        start_iso: s.start_iso,
        end_iso: s.end_iso,
      })),
      notes,
      price_per_member: perMember.toFixed(2),
      total_price: total.toFixed(2),
    });

    showToast(
      `Booking request sent to ${selectedTeam.name}. Members will be notified.`,
      "create"
    );
    setBookingStep("closed");
    setSelectedTeam(null);
    setSelected({});
    setNotes("");
  } catch (e: any) {
    const errMsg = e?.response?.data?.detail || "Failed to send the team booking request.";
    showToast(errMsg, "delete");
  } finally {
    setTeamBookingLoading(false);
  }
}


  if (loading) {
    return <LoadingBall fullscreen label="Loading pitch..." size="sm" />;
  }

  if (!pitch) {
    return (
      <div className={styles.page}>
        <div className={styles.notFoundWrap}>
          <div className={styles.notFoundCard}>
            <SearchOffIcon className={styles.notFoundIcon} />
            <div className={styles.notFoundTitle}>Pitch not found</div>
            <div className={styles.notFoundText}>
              It may have been removed or the link is incorrect.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const amenityEntries = [
    { active: pitch.has_dressing_room, label: "Dressing room", Icon: ShirtIcon },
    { active: pitch.has_showers, label: "Showers", Icon: ShowerIcon },
    { active: pitch.has_parking, label: "Parking", Icon: ParkingIcon },
    { active: pitch.has_lighting, label: "Lighting", Icon: LightIcon },
  ].filter((a) => a.active);

  return (
    <div>
    <div className={styles.page}>
      <ToastContainer />
      <div className={styles.shell}>
        <Link
          className={styles.backLink}
          to={role === "OWNER" ? "/owner" : role === "ADMIN" ? "/admin" : "/app"}
        >
          <ArrowLeftIcon className={styles.backIcon} />
          Back
        </Link>

        <div className={styles.layout}>
          <div className={styles.mainCard}>
            {/* ---------- gallery: big image + scrollable thumbnail changer ---------- */}
            <div className={styles.gallery}>
              <div className={styles.galleryFrame}>
                <div className={styles.mainImageWrap}>
                  {activeImage ? (
                    <img key={activeImage} src={activeImage} alt={pitch.name} />
                  ) : (
                    <div className={styles.mainImagePlaceholder}>No photo yet</div>
                  )}

                  {hasMultipleImages && (
                    <>
                      <button
                        type="button"
                        className={`${styles.navBtn} ${styles.navBtnLeft}`}
                        aria-label="Previous photo"
                        onClick={goToPrevImage}
                      >
                        <ChevronLeftIcon />
                      </button>
                      <button
                        type="button"
                        className={`${styles.navBtn} ${styles.navBtnRight}`}
                        aria-label="Next photo"
                        onClick={goToNextImage}
                      >
                        <ChevronRightIcon />
                      </button>
                      <div className={styles.imageCounter}>
                        {activeImageIndex + 1} / {galleryImages.length}
                      </div>
                    </>
                  )}
                </div>

                {hasMultipleImages && (
                  <div className={styles.thumbStrip}>
                    {galleryImages.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        className={`${styles.thumbBtn} ${
                          index === activeImageIndex ? styles.thumbBtnActive : ""
                        }`}
                        onClick={() => setActiveImageIndex(index)}
                        aria-label={`View photo ${index + 1}`}
                      >
                        <img src={url} alt={`${pitch.name} ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ---------- details: name, location, hours, prices, amenities ---------- */}
            <div className={styles.detailsSection}>
              <div className={styles.detailsHeader}>
                <div className={styles.detailsHeaderMain}>
                  <div className={styles.heroTitle}>{pitch.name}</div>
                  <div className={styles.heroAddress}>
                    <PinIcon className={styles.heroAddressIcon} />
                    <span>{pitch.address}</span>
                  </div>
                </div>

                <div className={styles.heroHours}>
                  <ClockIcon className={styles.heroHoursIcon} />
                  {pitch.opening_time_label} – {pitch.closing_time_label}
                </div>
              </div>

              <div className={styles.priceStrip}>
                <div className={styles.priceCard}>
                  <span className={styles.priceCardLabel}>Hourly</span>
                  <span className={styles.priceCardValue}>{pitch.hourly_price} Br</span>
                </div>
                <div className={styles.priceCard}>
                  <span className={styles.priceCardLabel}>Weekly</span>
                  <span className={styles.priceCardValue}>{pitch.weekly_price} Br</span>
                </div>
                <div className={styles.priceCard}>
                  <span className={styles.priceCardLabel}>Monthly</span>
                  <span className={styles.priceCardValue}>{pitch.monthly_price} Br</span>
                </div>
              </div>

              <div className={styles.amenityRow}>
                {amenityEntries.length === 0 ? (
                  <span className={styles.amenityEmpty}>No amenities listed</span>
                ) : (
                  amenityEntries.map(({ label, Icon }) => (
                    <span key={label} className={styles.amenityChip}>
                      <Icon className={styles.amenityChipIcon} />
                      {label}
                    </span>
                  ))
                )}
              </div>

              {pitch.other_services ? (
                <div className={styles.otherServices}>
                  <InfoIcon className={styles.otherServicesIcon} />
                  <span>{pitch.other_services}</span>
                </div>
              ) : null}
            </div>

            <div className={styles.bookingSection}>
              <div className={styles.modeRow}>
                <div className={styles.modeTabs}>
                  {(["daily", "weekly", "monthly"] as BookingMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setMode(m);
                        setSelected({});
                        setBookingMsg("");
                        if (m !== "monthly") setMonthlyWeekIndex(0);
                      }}
                      className={`${styles.modeTab} ${mode === m ? styles.modeTabActive : ""}`}
                    >
                      {m[0].toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>

                {mode === "monthly" && (
                  <div className={styles.weekNav}>
                    <button
                      className={styles.weekNavBtn}
                      onClick={() => setMonthlyWeekIndex((v) => Math.max(0, v - 1))}
                      disabled={monthlyWeekIndex === 0}
                    >
                      <ChevronLeftIcon />
                    </button>
                    <div className={styles.weekLabel}>Week {monthlyWeekIndex + 1}</div>
                    <button
                      className={styles.weekNavBtn}
                      onClick={() => setMonthlyWeekIndex((v) => Math.min(3, v + 1))}
                      disabled={monthlyWeekIndex === 3}
                    >
                      <ChevronRightIcon />
                    </button>

                    {canApplyWeek1ToAll && (
                      <button className={styles.applyWeekBtn} onClick={applyWeek1ToAllWeeks}>
                        Apply week 1 to all weeks
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.legend}>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.legendSwatchAvailable}`} />
                  Available
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.legendSwatchSelected}`} />
                  Selected
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.legendSwatchBooked}`} />
                  Occupied
                </div>
              </div>

              {/* ---------- days: always-horizontal scroller with scroll hints ---------- */}
              <div className={styles.daysGridWrap}>
                <div
                  className={styles.daysGrid}
                  ref={daysScrollRef}
                  onScroll={handleDaysScroll}
                >
                  {displayedDays.map((day) => (
                    <div key={day.date} className={styles.dayColumn}>
                      <div className={styles.dayHeader}>
                        <div className={styles.dayWeekday}>{day.weekday}</div>
                        <div className={styles.dayDate}>{day.display_date}</div>
                      </div>

                      <div className={styles.slotList}>
                        {day.slots.map((slot) => {
                          const isSelected = !!selected[slot.key];
                          return (
                            <button
                              key={slot.key}
                              type="button"
                              onClick={() => toggleSlot(slot)}
                              disabled={!slot.is_available}
                              className={`${styles.slotBtn} ${slotClassName(slot, isSelected)}`}
                            >
                              {slot.status === "BOOKED" && <LockIcon />}
                              {isSelected && slot.status !== "BOOKED" && <CheckIcon />}
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {daysOverflow && !daysAtStart && <div className={styles.edgeFadeLeft} />}
                {daysOverflow && !daysAtEnd && <div className={styles.edgeFadeRight} />}

                {daysOverflow && !daysUserScrolled && (
                  <div className={styles.scrollHintBadge} aria-hidden="true">
                    <ChevronRightIcon />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.sidebar}>
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarHead}>
                <div className={styles.sidebarTitle}>
                  {isManager ? "Slot Control" : "Selected Hours"}
                </div>
                <span className={styles.modeBadge}>{mode}</span>
              </div>

              {selectedList.length === 0 ? (
                <div className={styles.emptySelection}>
                  No hours selected yet. Total starts at 0 birr.
                </div>
              ) : (
                <div className={styles.selectedList}>
                  {selectedList.map((slot) => (
                    <div key={slot.key} className={styles.selectedItem}>
                      <div className={styles.selectedItemText}>
                        <div className={styles.selectedDate}>
                          {new Date(slot.start_iso).toLocaleDateString()}
                        </div>
                        <div className={styles.selectedLabel}>{slot.label}</div>
                      </div>
                      <div className={styles.selectedPrice}>
                        {priceForMode(pitch, mode)} Br
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isManager && (
                <>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Booked for</label>
                    <input
                      className={styles.textInput}
                      value={bookedForName}
                      onChange={(e) => setBookedForName(e.target.value)}
                      placeholder="Customer name (optional)"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Notes</label>
                    <textarea
                      className={styles.textArea}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional note"
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className={styles.summaryBlock}>
                <div className={styles.summaryRow}>
                  <span>Hours selected</span>
                  <b>{selectedList.length}</b>
                </div>
                <div className={styles.summaryTotalRow}>
                  <span>Total</span>
                  <span className={styles.summaryTotalValue}>{total} Br</span>
                </div>

                <div className={styles.actionRow}>
                  <button className={styles.clearBtn} onClick={clearSelection}>
                    Clear
                  </button>
                  <button
                    className={styles.bookBtn}
                    onClick={handleBookClick}
                    disabled={selectedList.length === 0}
                  >
                    {isManager ? "Occupy / Cash Booking" : "Create Booking"}
                  </button>
                </div>

                {bookingMsg && (
                  <div className={styles.bookingMsg}>
                    <CheckIcon className={styles.bookingMsgIcon} />
                    <span>{bookingMsg}</span>
                  </div>
                )}
              </div>
            </div>

            {isManager && (
              <div className={styles.sidebarCard}>
                <div className={styles.existingHead}>Existing Bookings</div>

                {existingBookings.length === 0 ? (
                  <div className={styles.existingEmpty}>
                    No bookings yet for the coming weeks.
                  </div>
                ) : (
                  <div className={styles.existingList}>
                    {existingBookings.map((b) => (
                      <div key={b.id} className={styles.existingCard}>
                        <div className={styles.existingLabel}>{b.label}</div>
                        <div className={styles.existingMetaRow}>
                          <span className={styles.existingCode}>{b.booking_code}</span>
                          <span className={styles.existingStatus}>{b.status}</span>
                          <span className={styles.existingPrice}>{b.total_price} Br</span>
                        </div>
                        {b.booked_by ? (
                          <div className={styles.existingBy}>By: {b.booked_by}</div>
                        ) : null}
                        {b.notes ? (
                          <div className={styles.existingNotes}>{b.notes}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
                        )}
          </div>
        </div>
      </div>

      <BookingTeamModal
        step={bookingStep}
        teams={ownedTeams}
        selectedTeam={selectedTeam}
        pitchName={pitch.name}
        mode={mode}
        pricePerSlot={priceForMode(pitch, mode)}
        selectedCount={selectedList.length}
        totalPrice={total}
        loading={teamBookingLoading}
        onClose={closeBookingModal}
        onChooseIndividual={chooseIndividualBooking}
        onChooseTeam={chooseTeamBooking}
        onSelectTeam={selectTeamForBooking}
        onProceedToConfirm={proceedToTeamConfirm}
        onConfirmTeamBooking={handleConfirmTeamBooking}
        onBack={backToChoiceStep}
        onBackToTeams={backToTeamSelectStep}
      />
    </div>
    </div>
  );
}
