import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import type { Match, MatchType, CreateMatchPayload, UpdateMatchPayload } from "../lib/match";
import { listMatches, createMatch, updateMatch, cancelMatch } from "../lib/match";
import type { Pitch } from "../lib/pitches";
import { listPitches } from "../lib/pitches";
import styles from "./css/MatchesTab.module.css";

const ADDIS_ABABA = { lat: 8.9806, lng: 38.7578 };

/* ---------------- icons ---------------- */

type IconName =
  | "plus" | "pin" | "clock" | "x" | "pencil" | "trash"
  | "users" | "swords" | "calendar" | "cash" | "check" | "arrowRight" | "note" | "alertTriangle";

function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    pin: (
      <>
        <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 16 14" />
      </>
    ),
    x: <path d="M18 6 6 18M6 6l12 12" />,
    pencil: <path d="m14.5 3.5 3 3L7 17l-4 1 1-4 10.5-10.5z" />,
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3M6 7l1 14h10l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 20c0-3.6 2.6-6 5.5-6s5.5 2.4 5.5 6" />
        <path d="M16 8.5a3 3 0 1 1 0-6" />
        <path d="M15 14.2c2.6.3 4.5 2.6 4.5 5.8" />
      </>
    ),
    swords: (
      <>
        <path d="m5 5 14 14M19 5 5 19" />
        <path d="M5 5h4M5 5v4M19 5h-4M19 5v4M5 19h4M5 19v-4M19 19h-4M19 19v-4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18" />
        <path d="M8 3v3M16 3v3" />
      </>
    ),
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
    note: (
      <>
        <path d="M7 3h8l4 4v14H7z" />
        <path d="M15 3v4h4" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),
    alertTriangle: (
      <>
        <path d="M12 3 2 20h20L12 3z" />
        <path d="M12 10v4M12 17v.01" />
      </>
    ),
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function SportBall({ sport, size = 20, className }: { sport?: "FOOTBALL" | "BASKETBALL"; size?: number; className?: string }) {
  const src = sport === "BASKETBALL" ? "/basketball.png" : "/football.png";
  return <img src={src} alt="" width={size} height={size} className={className} />;
}

/* ---------------- helpers ---------------- */

function formatBirr(value: string | number | null | undefined) {
  const num = Number(value) || 0;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`;
}

function formatWhen(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateLabel = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${startLabel} – ${endLabel}`;
}

function statusTone(status: Match["status"]) {
  if (status === "confirmed") return "team";
  if (status === "cancelled") return "danger";
  if (status === "completed") return "faint";
  return "grass"; // open
}

// Confirmed matches are the "live and locked in" ones — surface them first,
// then open, then completed/cancelled at the bottom. Ties broken by soonest.
const STATUS_ORDER: Record<Match["status"], number> = {
  confirmed: 0,
  open: 1,
  completed: 2,
  cancelled: 3,
};

function sortMatches(list: Match[]) {
  return [...list].sort((a, b) => {
    const rankDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });
}

function toLocalDateInput(d: Date) {
  return d.toLocaleDateString("en-CA");
}
function toLocalTimeInput(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const DURATION_OPTIONS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 150, label: "2.5 hours" },
  { minutes: 180, label: "3 hours" },
];

/* ---------------- map marker icon ---------------- */

function buildBallDivIcon(sport: "FOOTBALL" | "BASKETBALL", selected: boolean) {
  const isBasketball = sport === "BASKETBALL";
  const pinColor = isBasketball ? "#c9942a" : "#3fae7f";
  const ballSrc = isBasketball ? "/basketball.png" : "/football.png";
  const w = selected ? 42 : 30;
  const h = selected ? 52 : 37;
  const ballSize = selected ? 24 : 17;

  const html = `
    <div class="${selected ? "ball-marker ball-marker-selected" : "ball-marker"}">
      <svg width="${w}" height="${h}" viewBox="0 0 30 37" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 1C7.8 1 2 6.6 2 13.4c0 9 13 22 13 22s13-13 13-22C28 6.6 22.2 1 15 1z"
          fill="${selected ? pinColor : "#ffffff"}" stroke="${pinColor}" stroke-width="1.8"/>
        <circle cx="15" cy="13.4" r="9.3" fill="#ffffff"/>
      </svg>
      <img src="${ballSrc}" width="${ballSize}" height="${ballSize}" style="position:absolute; top:${selected ? 12 : 8}px; left:50%; transform:translateX(-50%);" />
    </div>`;

  return L.divIcon({
    html,
    className: "match-pitch-marker",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 6],
  });
}

/* ---------------- pitch map field ---------------- */

function PitchMapField({
  pitches,
  selectedId,
  onSelect,
}: {
  pitches: Pitch[];
  selectedId: string;
  onSelect: (pitch: Pitch) => void;
}) {
  const selected = pitches.find((p) => p.id === selectedId) || null;

  const center = useMemo(() => {
    if (selected) return { lat: selected.latitude, lng: selected.longitude };
    if (pitches.length > 0) return { lat: pitches[0].latitude, lng: pitches[0].longitude };
    return ADDIS_ABABA;
  }, [pitches, selected]);

  return (
    <div className={styles.pitchField}>
      <div className={styles.mapBox}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={12}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {pitches.map((p) => (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={buildBallDivIcon(p.sport_type, p.id === selectedId)}
              eventHandlers={{ click: () => onSelect(p) }}
            />
          ))}
        </MapContainer>
      </div>

      {selected ? (
        <div className={styles.pitchConfirm}>
          <span className={styles.pitchConfirmBall}>
            <SportBall sport={selected.sport_type} size={22} />
          </span>
          <div className={styles.pitchConfirmInfo}>
            <div className={styles.pitchConfirmName}>{selected.name}</div>
            <div className={styles.pitchConfirmAddress}>
              <Icon name="pin" size={11} />
              {selected.address || "No address on file"}
            </div>
          </div>
          <div className={styles.pitchConfirmPrice}>{selected.hourly_price} Br/hr</div>
        </div>
      ) : (
        <div className={styles.pitchConfirmEmpty}>
          <Icon name="pin" size={14} />
          Tap a marker on the map to pick a pitch
        </div>
      )}
    </div>
  );
}

/* ---------------- create / edit drawer ---------------- */

function MatchFormModal({
  open,
  onClose,
  mode,
  initialMatch,
  teamId,
  pitches,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialMatch: Match | null;
  teamId: string;
  pitches: Pitch[];
  onSubmit: (payload: CreateMatchPayload | UpdateMatchPayload) => Promise<void>;
}) {
  const [matchType, setMatchType] = useState<MatchType>("team_vs_team");
  const [pitchId, setPitchId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [description, setDescription] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [slotsNeeded, setSlotsNeeded] = useState("4");
  const [pricePerSlot, setPricePerSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && initialMatch) {
      const start = new Date(initialMatch.start_time);
      const end = new Date(initialMatch.end_time);
      setMatchType(initialMatch.match_type);
      setPitchId(initialMatch.pitch_id);
      setDate(toLocalDateInput(start));
      setStartTime(toLocalTimeInput(start));
      setDurationMinutes(Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000)));
      setDescription(initialMatch.description || "");
      setTotalPrice(initialMatch.total_price || "");
      setSlotsNeeded(initialMatch.slots_needed ? String(initialMatch.slots_needed) : "4");
      setPricePerSlot(initialMatch.price_per_slot || "");
      setPriceTouched(true);
    } else {
      const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setMatchType("team_vs_team");
      setPitchId("");
      setDate(toLocalDateInput(soon));
      setStartTime("18:00");
      setDurationMinutes(60);
      setDescription("");
      setTotalPrice("");
      setSlotsNeeded("4");
      setPricePerSlot("");
      setPriceTouched(false);
    }
    setFormError("");
  }, [open, mode, initialMatch]);

  const selectedPitch = pitches.find((p) => p.id === pitchId) || null;

  useEffect(() => {
    if (mode !== "create" || priceTouched || !selectedPitch) return;
    const suggested = Math.round((Number(selectedPitch.hourly_price) || 0) * (durationMinutes / 60));
    setTotalPrice(String(suggested));
  }, [selectedPitch, durationMinutes, mode, priceTouched]);

  if (!open) return null;

  const totalPriceNum = Number(totalPrice) || 0;
  const slotsNum = Number(slotsNeeded) || 0;
  const priceSlotNum = Number(pricePerSlot) || 0;
  const isTeamType = matchType === "team_vs_team";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!pitchId || !selectedPitch) {
      setFormError("Select a pitch on the map first.");
      return;
    }
    if (!date || !startTime) {
      setFormError("Choose a date and start time.");
      return;
    }
    if (matchType === "team_vs_team" && (!totalPrice || totalPriceNum <= 0)) {
      setFormError("Enter the total pitch price to split between both teams.");
      return;
    }
    if (matchType === "open_slots" && (!slotsNeeded || slotsNum <= 0 || !pricePerSlot || priceSlotNum <= 0)) {
      setFormError("Enter how many players you need and the price per player.");
      return;
    }

    const startDate = new Date(`${date}T${startTime}`);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    if (Number.isNaN(startDate.getTime())) {
      setFormError("That date/time doesn't look right.");
      return;
    }

    const shared = {
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      description: description.trim(),
      ...(matchType === "team_vs_team"
        ? { total_price: totalPriceNum }
        : { slots_needed: slotsNum, price_per_slot: priceSlotNum }),
    };

    const payload: CreateMatchPayload | UpdateMatchPayload =
      mode === "create"
        ? { creator_team_id: teamId, match_type: matchType, pitch_id: pitchId, ...shared }
        : shared;

    try {
      setSubmitting(true);
      await onSubmit(payload);
    } catch (err: any) {
      const data = err?.response?.data;
      let apiMsg = "Couldn't save this match. Please check the details and try again.";
      if (typeof data === "string") apiMsg = data;
      else if (data && typeof data === "object") {
        const firstKey = Object.keys(data)[0];
        const firstVal = data[firstKey];
        if (firstKey === "detail") apiMsg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
        else if (firstKey) apiMsg = `${firstKey.replace(/_/g, " ")}: ${Array.isArray(firstVal) ? firstVal[0] : firstVal}`;
      }
      setFormError(apiMsg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div
        className={`${styles.drawer} ${isTeamType ? styles.drawerTeam : styles.drawerOpen}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <span className={styles.drawerHeaderIcon}>
            <Icon name={isTeamType ? "swords" : "users"} size={18} />
          </span>
          <div className={styles.drawerHeaderText}>
            <h3 className={styles.drawerTitle}>{mode === "create" ? "Create a match" : "Edit match"}</h3>
            <p className={styles.drawerSubtitle}>
              {isTeamType ? "Challenge another team, split the pitch cost" : "Open spots for players to join"}
            </p>
          </div>
          <button type="button" className={styles.drawerCloseBtn} onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <form className={styles.drawerForm} onSubmit={handleSubmit}>
          <div className={styles.drawerBody}>
            <div className={styles.block}>
              <span className={styles.blockLabel}>Match type</span>
              <div className={styles.typeToggle} data-disabled={mode === "edit" || undefined}>
                <span
                  className={styles.typeToggleThumb}
                  style={{ transform: isTeamType ? "translateX(0%)" : "translateX(100%)" }}
                />
                <button
                  type="button"
                  className={`${styles.typeToggleBtn} ${isTeamType ? styles.typeToggleBtnActive : ""}`}
                  onClick={() => setMatchType("team_vs_team")}
                  disabled={mode === "edit"}
                >
                  <Icon name="swords" size={14} />
                  Team vs team
                </button>
                <button
                  type="button"
                  className={`${styles.typeToggleBtn} ${!isTeamType ? styles.typeToggleBtnActive : ""}`}
                  onClick={() => setMatchType("open_slots")}
                  disabled={mode === "edit"}
                >
                  <Icon name="users" size={14} />
                  Open slots
                </button>
              </div>
              {mode === "edit" && <div className={styles.fieldHint}>Match type can't be changed after creation.</div>}
            </div>

            <div className={styles.divider} />

            <div className={styles.block}>
              <span className={styles.blockLabel}>Pitch</span>
              <PitchMapField pitches={pitches} selectedId={pitchId} onSelect={(p) => setPitchId(p.id)} />
            </div>

            <div className={styles.divider} />

            <div className={styles.block}>
              <span className={styles.blockLabel}>When</span>
              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldSubLabel}><Icon name="calendar" size={12} /> Date</span>
                  <input type="date" className={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldSubLabel}><Icon name="clock" size={12} /> Start time</span>
                  <input type="time" className={styles.input} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldSubLabel}>Duration</span>
                  <select className={styles.select} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
                    {DURATION_OPTIONS.map((o) => (
                      <option key={o.minutes} value={o.minutes}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.block}>
              <span className={styles.blockLabel}>Pricing</span>

              {isTeamType ? (
                <div className={styles.priceCard}>
                  <label className={styles.field}>
                    <span className={styles.fieldSubLabel}>Total pitch cost</span>
                    <div className={styles.priceInputWrap}>
                      <input
                        type="number" min={0} className={styles.priceInput}
                        value={totalPrice}
                        onChange={(e) => { setTotalPrice(e.target.value); setPriceTouched(true); }}
                        placeholder="0"
                      />
                      <span className={styles.priceInputSuffix}>Br</span>
                    </div>
                  </label>
                  <div className={styles.priceSplitRow}>
                    <span>Your team pays</span>
                    <b>{formatBirr(totalPriceNum / 2)}</b>
                  </div>
                </div>
              ) : (
                <div className={styles.priceCard}>
                  <div className={styles.fieldGridTwo}>
                    <label className={styles.field}>
                      <span className={styles.fieldSubLabel}>Players needed</span>
                      <input type="number" min={1} className={styles.input} value={slotsNeeded} onChange={(e) => setSlotsNeeded(e.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldSubLabel}>Price per player</span>
                      <div className={styles.priceInputWrap}>
                        <input type="number" min={0} className={styles.priceInput} value={pricePerSlot} onChange={(e) => setPricePerSlot(e.target.value)} placeholder="0" />
                        <span className={styles.priceInputSuffix}>Br</span>
                      </div>
                    </label>
                  </div>
                  <div className={styles.priceSplitRow}>
                    <span>Total if every slot fills</span>
                    <b>{formatBirr(slotsNum * priceSlotNum)}</b>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.divider} />

            <div className={styles.block}>
              <span className={styles.blockLabel}><Icon name="note" size={13} /> Notes (optional)</span>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Bring your own bibs, meet 15 minutes early"
                rows={3}
              />
            </div>

            {formError && <div className={styles.formError}>{formError}</div>}
          </div>

          <div className={styles.drawerFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={`${styles.submitBtn} ${isTeamType ? styles.submitBtnTeam : styles.submitBtnOpen}`} disabled={submitting}>
              {submitting ? "Saving…" : mode === "create" ? "Create match" : "Save changes"}
              {!submitting && <Icon name="arrowRight" size={15} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- cancel-match confirm popup ---------------- */

function CancelMatchDialog({
  match, onConfirm, onDismiss, cancelling,
}: {
  match: Match;
  onConfirm: () => void;
  onDismiss: () => void;
  cancelling: boolean;
}) {
  return (
    <div className={styles.confirmOverlay} onClick={cancelling ? undefined : onDismiss}>
      <div className={styles.confirmCard} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className={styles.confirmIcon}>
          <Icon name="alertTriangle" size={20} />
        </span>
        <h3 className={styles.confirmTitle}>Cancel this match?</h3>
        <p className={styles.confirmText}>
          {match.match_type === "team_vs_team"
            ? `This will cancel the match against ${match.opponent_team_name || "the other team"}. This can't be undone.`
            : "Players who already joined will be freed from their slots. This can't be undone."}
        </p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.confirmNoBtn} onClick={onDismiss} disabled={cancelling}>
            No, keep it
          </button>
          <button type="button" className={styles.confirmYesBtn} onClick={onConfirm} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Yes, cancel match"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- match ticket card ---------------- */

function MatchCard({
  match, pitch, canManage, onEdit, onCancel, cancelling,
}: {
  match: Match;
  pitch: Pitch | undefined;
  canManage: boolean;
  onEdit: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const tone = statusTone(match.status);
  const canEdit = canManage && match.status === "open";
  const canCancel = canManage && (match.status === "open" || match.status === "confirmed");
  const isOpenSlots = match.match_type === "open_slots";
  const isConfirmed = match.status === "confirmed";

  return (
    <div
      className={`${styles.ticket} ${isOpenSlots ? styles.ticketOpenType : styles.ticketTeamType} ${
        isConfirmed ? styles.ticketConfirmed : ""
      }`}
    >
      {isConfirmed && (
        <span className={styles.confirmedFlag}>
          <Icon name="check" size={11} /> Confirmed
        </span>
      )}

      <div className={styles.ticketMain}>
        <div className={styles.ticketTopRow}>
          <span className={styles.typeTag}>
            <Icon name={isOpenSlots ? "users" : "swords"} size={12} />
            {isOpenSlots ? "Open slots" : "Team vs team"}
          </span>
          <span className={styles.matchPitchBall}>
            <SportBall sport={pitch?.sport_type} size={18} />
          </span>
        </div>

        {match.match_type === "team_vs_team" ? (
          <div className={styles.matchup}>
            <span className={styles.matchupTeam}>{match.creator_team_name}</span>
            <span className={styles.matchupVs}>vs</span>
            <span className={styles.matchupTeam}>{match.opponent_team_name || "..."}</span>
          </div>
        ) : (
          <div className={styles.matchup}>
            <span className={styles.slotsCount}>{match.confirmed_participant_count}/{match.slots_needed}</span>
            <span className={styles.matchupVs}>players joined</span>
          </div>
        )}

        <div className={styles.metaLine}>
          <Icon name="clock" size={13} />
          {formatWhen(match.start_time, match.end_time)}
        </div>
        <div className={styles.metaLine}>
          <Icon name="pin" size={13} />
          {pitch ? `${pitch.name}${pitch.address ? ` · ${pitch.address}` : ""}` : "Pitch details unavailable"}
        </div>

        {match.description && <div className={styles.matchNotes}>{match.description}</div>}
      </div>

      <div className={styles.ticketStub}>
        <span className={`${styles.statusDot} ${styles[`dot_${tone}`]}`} />
        <span className={styles.statusText}>{match.status[0].toUpperCase() + match.status.slice(1)}</span>

        <div className={styles.stubPrice}>
          {match.match_type === "team_vs_team"
            ? formatBirr(match.price_per_team)
            : formatBirr(match.price_per_slot)}
          <span className={styles.stubPriceUnit}>{match.match_type === "team_vs_team" ? "/ team" : "/ player"}</span>
        </div>

        {canManage && (
          <div className={styles.stubActions}>
            <button type="button" className={styles.stubIconBtn} onClick={onEdit} disabled={!canEdit} title={canEdit ? "Edit match" : "Only an open match can be edited"}>
              <Icon name="pencil" size={13} />
            </button>
            <button type="button" className={`${styles.stubIconBtn} ${styles.stubIconBtnDanger}`} onClick={onCancel} disabled={!canCancel || cancelling} title={canCancel ? "Cancel match" : "This match can't be cancelled"}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- ticket skeleton (loading state) ---------------- */

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`${styles.shimmer} ${className}`} />;
}

function TicketSkeleton() {
  return (
    <div className={styles.ticket}>
      <div className={styles.ticketMain}>
        <div className={styles.ticketTopRow}>
          <SkeletonBlock className={styles.skelTag} />
          <SkeletonBlock className={styles.skelBall} />
        </div>
        <SkeletonBlock className={styles.skelMatchup} />
        <SkeletonBlock className={styles.skelMeta} />
        <SkeletonBlock className={styles.skelMetaShort} />
      </div>
      <div className={styles.ticketStub}>
        <SkeletonBlock className={styles.skelDot} />
        <SkeletonBlock className={styles.skelStatusText} />
        <SkeletonBlock className={styles.skelPrice} />
      </div>
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className={styles.ticketList} aria-busy="true" aria-live="polite">
      {Array.from({ length: 4 }).map((_, i) => (
        <TicketSkeleton key={i} />
      ))}
    </div>
  );
}

/* ---------------- main tab ---------------- */

export default function MatchesTab({
  team, canManage,
}: { team: { id: string; name: string }; canManage: boolean }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [matchPendingCancel, setMatchPendingCancel] = useState<Match | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setMsg("");
      const [m, p] = await Promise.all([
        listMatches({ team_id: team.id }),
        listPitches().catch(() => []),
      ]);
      setMatches(m);
      setPitches(p);
    } catch {
      setMsg("Failed to load matches for this team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  const pitchById = useMemo(() => {
    const map = new Map<string, Pitch>();
    pitches.forEach((p) => map.set(p.id, p));
    return map;
  }, [pitches]);

  // Confirmed matches surface first, so managers and members immediately
  // see what's locked in before scanning open/completed/cancelled ones.
  const orderedMatches = useMemo(() => sortMatches(matches), [matches]);

  async function handleCreate(payload: any) {
    await createMatch(payload);
    setModalMode(null);
    await refresh();
  }

  async function handleUpdate(payload: any) {
    if (!editingMatch) return;
    await updateMatch(editingMatch.id, payload);
    setModalMode(null);
    setEditingMatch(null);
    await refresh();
  }

  // "Cancel" click now just opens the confirm popup — the actual API call
  // only fires once the person taps "Yes, cancel match" inside it.
  function requestCancel(match: Match) {
    setMatchPendingCancel(match);
  }

  async function confirmCancel() {
    if (!matchPendingCancel) return;
    setCancellingId(matchPendingCancel.id);
    try {
      await cancelMatch(matchPendingCancel.id);
      setMatchPendingCancel(null);
      await refresh();
    } catch {
      setMsg("Couldn't cancel that match. Try again.");
      setMatchPendingCancel(null);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className={styles.tabWrap}>
      <div className={styles.tabHead}>
        <div>
          <div className={styles.tabTitle}>Matches</div>
          <div className={styles.tabSub}>
            {canManage
              ? "Challenge another team or open slots for outside players to join."
              : "Matches this team has scheduled."}
          </div>
        </div>
        {canManage && (
          <button type="button" className={styles.createBtn} onClick={() => { setEditingMatch(null); setModalMode("create"); }}>
            <Icon name="plus" size={15} />Create match
          </button>
        )}
      </div>

      {msg && <div className={styles.msg}>{msg}</div>}

      {loading ? (
        <MatchesSkeleton />
      ) : orderedMatches.length === 0 ? (
        <div className={styles.emptyState}>
          <Icon name="swords" size={26} />
          <div className={styles.emptyStateTitle}>No matches yet</div>
          <div className={styles.emptyStateText}>
            {canManage
              ? "Create a team-vs-team challenge or open some slots for players to join."
              : "Check back once team's owner or admin schedules one."}
          </div>
        </div>
      ) : (
        <div className={styles.ticketList}>
          {orderedMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              pitch={pitchById.get(m.pitch_id)}
              canManage={canManage}
              onEdit={() => { setEditingMatch(m); setModalMode("edit"); }}
              onCancel={() => requestCancel(m)}
              cancelling={cancellingId === m.id}
            />
          ))}
        </div>
      )}

      <MatchFormModal
        open={modalMode !== null}
        onClose={() => { setModalMode(null); setEditingMatch(null); }}
        mode={modalMode || "create"}
        initialMatch={editingMatch}
        teamId={team.id}
        pitches={pitches}
        onSubmit={modalMode === "edit" ? handleUpdate : handleCreate}
      />

      {matchPendingCancel && (
        <CancelMatchDialog
          match={matchPendingCancel}
          cancelling={cancellingId === matchPendingCancel.id}
          onConfirm={confirmCancel}
          onDismiss={() => setMatchPendingCancel(null)}
        />
      )}
    </div>
  );
}