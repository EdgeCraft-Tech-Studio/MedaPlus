import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createBooking, getPitchDetail } from "../lib/pitches";
import type { AvailabilityDay, AvailabilitySlot, MonthlyWeek, Pitch } from "../lib/pitches";

type BookingMode = "daily" | "weekly" | "monthly";

type SelectedMap = Record<string, AvailabilitySlot>;

function priceForMode(pitch: Pitch, mode: BookingMode) {
  if (mode === "daily") return Number(pitch.hourly_price || 0);
  if (mode === "weekly") return Number(pitch.weekly_price || 0);
  return Number(pitch.monthly_price || 0);
}

function slotButtonStyle(slot: AvailabilitySlot, selected: boolean) {
  if (!slot.is_available) {
    return {
      padding: "10px 8px",
      borderRadius: 10,
      background: "#efefef",
      color: "#999",
      border: "1px solid #ddd",
      cursor: "not-allowed",
      fontSize: 12,
    };
  }

  if (selected) {
    return {
      padding: "10px 8px",
      borderRadius: 10,
      background: "#111",
      color: "#fff",
      border: "1px solid #111",
      cursor: "pointer",
      fontSize: 12,
    };
  }

  return {
    padding: "10px 8px",
    borderRadius: 10,
    background: "#fff",
    color: "#222",
    border: "1px solid #ddd",
    cursor: "pointer",
    fontSize: 12,
  };
}

export default function PitchDetail() {
  const { pitchId } = useParams();
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [monthlyWeeks, setMonthlyWeeks] = useState<MonthlyWeek[]>([]);
  const [mode, setMode] = useState<BookingMode>("daily");
  const [selected, setSelected] = useState<SelectedMap>({});
  const [loading, setLoading] = useState(true);
  const [bookingMsg, setBookingMsg] = useState("");
  const [monthlyWeekIndex, setMonthlyWeekIndex] = useState(0);

  useEffect(() => {
    if (!pitchId) return;
    getPitchDetail(pitchId)
      .then((data) => {
        setPitch(data.pitch);
        setDays(data.daily_weekly_days);
        setMonthlyWeeks(data.monthly_weeks);
      })
      .finally(() => setLoading(false));
  }, [pitchId]);

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
      });

      setBookingMsg(`Booking created successfully. Code: ${res.booking_code}`);
      setSelected({});
    } catch (e: any) {
      setBookingMsg(e?.response?.data?.detail || "Booking failed.");
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!pitch) return <div style={{ padding: 24 }}>Pitch not found.</div>;

  const displayedDays =
    mode === "monthly" ? monthlyWeeks[monthlyWeekIndex]?.days || [] : days;

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9", padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/app">← Back to dashboard</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 6px 22px rgba(0,0,0,0.06)",
            minHeight: "calc(100vh - 80px)",
            display: "grid",
            gridTemplateRows: "25% 75%",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "38% 62%", minHeight: 240 }}>
            <div style={{ background: "#e9ecef", display: "grid", placeItems: "center" }}>
              <div style={{ color: "#666" }}>Pitch image/gallery goes here</div>
            </div>

            <div style={{ padding: 18, display: "grid", gap: 8, alignContent: "start" }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{pitch.name}</div>
              <div style={{ color: "#555" }}>{pitch.address}</div>
              <div style={{ color: "#333" }}>
                Working hours: <b>{pitch.opening_time_label}</b> - <b>{pitch.closing_time_label}</b>
              </div>
              <div style={{ color: "#333" }}>
                Hourly: <b>{pitch.hourly_price}</b> birr | Weekly: <b>{pitch.weekly_price}</b> birr | Monthly: <b>{pitch.monthly_price}</b> birr
              </div>
              <div style={{ color: "#333" }}>
                Amenities:
                {" "}
                {[
                  pitch.has_dressing_room ? "Dressing room" : null,
                  pitch.has_showers ? "Showers" : null,
                  pitch.has_parking ? "Parking" : null,
                  pitch.has_lighting ? "Lighting" : null,
                ].filter(Boolean).join(", ") || "None"}
              </div>
              {pitch.other_services ? (
                <div style={{ color: "#333" }}>Other services: {pitch.other_services}</div>
              ) : null}
            </div>
          </div>

          <div style={{ padding: 16, overflow: "auto" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
              {(["daily", "weekly", "monthly"] as BookingMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setSelected({});
                    setBookingMsg("");
                    if (m !== "monthly") setMonthlyWeekIndex(0);
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: mode === m ? "#111" : "#fff",
                    color: mode === m ? "#fff" : "#222",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}

              {mode === "monthly" && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => setMonthlyWeekIndex((v) => Math.max(0, v - 1))}
                    disabled={monthlyWeekIndex === 0}
                  >
                    Prev
                  </button>
                  <div>Week {monthlyWeekIndex + 1}</div>
                  <button
                    onClick={() => setMonthlyWeekIndex((v) => Math.min(3, v + 1))}
                    disabled={monthlyWeekIndex === 3}
                  >
                    Next
                  </button>

                  {canApplyWeek1ToAll && (
                    <button onClick={applyWeek1ToAllWeeks}>
                      Apply week 1 to all weeks
                    </button>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${displayedDays.length}, minmax(160px, 1fr))`,
                gap: 12,
              }}
            >
              {displayedDays.map((day) => (
                <div key={day.date} style={{ border: "1px solid #eee", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: 12, background: "#fafafa", borderBottom: "1px solid #eee" }}>
                    <div style={{ fontWeight: 700 }}>{day.weekday}</div>
                    <div style={{ fontSize: 13, color: "#666" }}>{day.display_date}</div>
                  </div>

                  <div style={{ padding: 10, display: "grid", gap: 8 }}>
                    {day.slots.map((slot) => {
                      const isSelected = !!selected[slot.key];
                      return (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => toggleSlot(slot)}
                          disabled={!slot.is_available}
                          style={slotButtonStyle(slot, isSelected)}
                        >
                          {slot.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 6px 22px rgba(0,0,0,0.06)",
            alignSelf: "start",
            position: "sticky",
            top: 18,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Selected Hours</div>
          <div style={{ color: "#555", marginBottom: 10 }}>
            Mode: <b>{mode}</b>
          </div>

          {selectedList.length === 0 ? (
            <div style={{ color: "#777" }}>No hours selected yet. Total starts at 0 birr.</div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              {selectedList.map((slot) => (
                <div
                  key={slot.key}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{new Date(slot.start_iso).toLocaleDateString()}</div>
                  <div style={{ fontSize: 13, color: "#555" }}>{slot.label}</div>
                  <div style={{ marginTop: 6 }}>
                    {priceForMode(pitch, mode)} birr
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span>Hours selected</span>
              <b>{selectedList.length}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span>Total</span>
              <b>{total} birr</b>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={clearSelection}>Clear</button>
              <button
                onClick={handleBook}
                disabled={selectedList.length === 0}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                }}
              >
                Confirm Booking
              </button>
            </div>

            {bookingMsg && (
              <div style={{ marginTop: 12, fontSize: 14, color: "#0a7a34" }}>
                {bookingMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
