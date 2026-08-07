import { useMemo, useState } from "react";
import {  useNavigate } from "react-router-dom";
import styles from "./css/CreateMatch.module.css";
import AppHeader from "./AppHeader";

/* ---------- icons ---------- */


function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z" />
    </svg>
  );
}
function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" />
    </svg>
  );
}
function MailIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7l7.5 6 7.5-6" />
    </svg>
  );
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.6 2.2" />
    </svg>
  );
}
function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.6 2.6L16.2 9" />
    </svg>
  );
}
function AlertIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" {...props}>
      <path d="M12 3.5l9.5 16.5H2.5L12 3.5z" />
      <path d="M12 10v4.2M12 17.3v.1" />
    </svg>
  );
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.4" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function UsersSmallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.8 14.8c2.4.3 4.1 2 4.7 5.2" />
    </svg>
  );
}

/* ---------- constants (grounded in proposal §4 & §6) ---------- */

const SPORTS = [
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
  { value: "other", label: "Other" },
] as const;

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "competitive", label: "Competitive" },
] as const;

const DURATIONS = [60, 90, 120] as const;

const PARTICIPATION = [
  {
    value: "public",
    label: "Public",
    icon: GlobeIcon,
    text: "Listed as an open game. Anyone can join until the roster is full.",
  },
  {
    value: "approval",
    label: "Approval required",
    icon: ShieldIcon,
    text: "Listed publicly, but you approve every player before they're in.",
  },
  {
    value: "invite",
    label: "Invitation only",
    icon: MailIcon,
    text: "Hidden from search. Only people you invite can see or join it.",
  },
] as const;

type Participation = (typeof PARTICIPATION)[number]["value"];

const MOCK_TEAMS = ["Riverside Falcons", "Bole United", "Kera City FC"];

interface MatchFormState {
  bookingType: "individual" | "team";
  organizingTeam: string;
  sport: (typeof SPORTS)[number]["value"];
  date: string;
  startTime: string;
  duration: (typeof DURATIONS)[number];
  pitchOrArea: string;
  requiredPlayers: number;
  skillLevel: (typeof SKILL_LEVELS)[number]["value"];
  positionNotes: string;
  totalPrice: string;
  participation: Participation;
  challengeMode: "open" | "challenge";
  opponentTeam: string;
}

const initialState: MatchFormState = {
  bookingType: "team",
  organizingTeam: MOCK_TEAMS[0],
  sport: "football",
  date: "",
  startTime: "",
  duration: 90,
  pitchOrArea: "",
  requiredPlayers: 10,
  skillLevel: "intermediate",
  positionNotes: "",
  totalPrice: "",
  participation: "public",
  challengeMode: "open",
  opponentTeam: "",
};

type Errors = Partial<Record<keyof MatchFormState, string>>;

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function CreateMatch() {
  const navigate = useNavigate();
  const [form, setForm] = useState<MatchFormState>(initialState);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof MatchFormState, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function setField<K extends keyof MatchFormState>(key: K, value: MatchFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(f: MatchFormState): Errors {
    const e: Errors = {};

    if (f.bookingType === "team" && !f.organizingTeam) {
      e.organizingTeam = "Pick which team is organizing this game.";
    }

    if (!f.date) e.date = "Choose a date.";
    else if (f.date < todayISO()) e.date = "Date can't be in the past.";

    if (!f.startTime) e.startTime = "Choose a kickoff time.";

    if (!f.pitchOrArea.trim()) e.pitchOrArea = "Enter a pitch name or a preferred area.";

    if (!Number.isFinite(f.requiredPlayers) || f.requiredPlayers < 2 || f.requiredPlayers > 30) {
      e.requiredPlayers = "Needs between 2 and 30 players.";
    }

    const price = Number(f.totalPrice);
    if (!f.totalPrice.trim() || !Number.isFinite(price) || price <= 0) {
      e.totalPrice = "Enter the total pitch price.";
    }

    if (!f.participation) e.participation = "Choose who can join.";

    if (f.challengeMode === "challenge" && !f.opponentTeam.trim()) {
      e.opponentTeam = "Name the team you're challenging.";
    }

    return e;
  }

  const liveErrors = useMemo(() => validate(form), [form]);

  function handleBlur(key: keyof MatchFormState) {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(liveErrors);
  }

  const priceNum = Number(form.totalPrice);
  const perPlayer =
    Number.isFinite(priceNum) && priceNum > 0 && form.requiredPlayers > 0
      ? priceNum / form.requiredPlayers
      : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const foundErrors = validate(form);
    setErrors(foundErrors);
    setTouched({
      organizingTeam: true,
      date: true,
      startTime: true,
      pitchOrArea: true,
      requiredPlayers: true,
      totalPrice: true,
      participation: true,
      opponentTeam: true,
    });
    if (Object.keys(foundErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // TODO: await gamesApi.createLobby(form) — POST to the matchmaking
      // service (MM-01). On success this creates the lobby in "Open" state;
      // the atomic pitch hold (BK-02) only starts once the roster is ready.
      await new Promise((resolve) => setTimeout(resolve, 900));
      setSuccess(true);
    } catch (err) {
      setSubmitError("Couldn't publish the game. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const showError = (key: keyof MatchFormState) => touched[key] && errors[key];

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.successWrap}>
          <div className={styles.successCard}>
            <span className={styles.successIcon}>
              <CheckCircleIcon width={30} height={30} />
            </span>
            <h1 className={styles.successTitle}>Your game is on the board</h1>
            <p className={styles.successText}>
              We'll fill the remaining spots and notify you as players join. Once the roster is
              ready, you can start the pitch hold and split payment.
            </p>
            <div className={styles.successActions}>
              <button className={styles.btnPrimary} onClick={() => navigate("/")}>
                Go to dashboard
              </button>
              <button
                className={styles.btnGhost}
                onClick={() => {
                  setSuccess(false);
                  setForm(initialState);
                  setTouched({});
                }}
              >
                Create another game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader variant="logout" />

      <header className={styles.hero}>
        <span className={styles.eyebrow}>Game matchmaking</span>
        <h1 className={styles.heroTitle}>
          Set the game, <em>fill</em> the roster
        </h1>
        <p className={styles.heroSubtitle}>
          Publish the details, and we'll help you fill open spots — the pitch price splits
          automatically across everyone who's confirmed.
        </p>
      </header>

      <form className={styles.layout} onSubmit={handleSubmit} noValidate>
        <div className={styles.formCol}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Who's organizing</h2>
            <div className={styles.segmented}>
              <button
                type="button"
                className={styles.segmentBtn}
                data-active={form.bookingType === "team"}
                onClick={() => setField("bookingType", "team")}
              >
                Team booking
              </button>
              <button
                type="button"
                className={styles.segmentBtn}
                data-active={form.bookingType === "individual"}
                onClick={() => setField("bookingType", "individual")}
              >
                Individual booking
              </button>
            </div>

            {form.bookingType === "team" ? (
              <>
                <div className={styles.field} style={{ marginTop: 16 }}>
                  <label className={styles.label} htmlFor="organizingTeam">
                    Organizing team<span className={styles.req}>*</span>
                  </label>
                  <select
                    id="organizingTeam"
                    className={styles.select}
                    data-invalid={!!showError("organizingTeam")}
                    value={form.organizingTeam}
                    onChange={(e) => setField("organizingTeam", e.target.value)}
                    onBlur={() => handleBlur("organizingTeam")}
                  >
                    {MOCK_TEAMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {showError("organizingTeam") && (
                    <span className={styles.errorText}>{errors.organizingTeam}</span>
                  )}
                </div>

              </>
            ) : (
              <p className={styles.plainNote} style={{ marginTop: 14 }}>
                This follows the existing individual booking flow — pick a pitch and time, pay
                for your own slot. No roster or shared payment involved.
              </p>
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Game details</h2>
            <div className={styles.grid3}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="sport">Sport</label>
                <select
                  id="sport"
                  className={styles.select}
                  value={form.sport}
                  onChange={(e) => setField("sport", e.target.value as MatchFormState["sport"])}
                >
                  {SPORTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="date">
                  Date<span className={styles.req}>*</span>
                </label>
                <input
                  id="date"
                  type="date"
                  className={styles.input}
                  data-invalid={!!showError("date")}
                  min={todayISO()}
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                  onBlur={() => handleBlur("date")}
                />
                {showError("date") && <span className={styles.errorText}>{errors.date}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="startTime">
                  Kickoff<span className={styles.req}>*</span>
                </label>
                <input
                  id="startTime"
                  type="time"
                  className={styles.input}
                  data-invalid={!!showError("startTime")}
                  value={form.startTime}
                  onChange={(e) => setField("startTime", e.target.value)}
                  onBlur={() => handleBlur("startTime")}
                />
                {showError("startTime") && (
                  <span className={styles.errorText}>{errors.startTime}</span>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Duration</label>
              <div className={styles.chipRow}>
                {DURATIONS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={styles.chip}
                    data-active={form.duration === d}
                    onClick={() => setField("duration", d)}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="pitchOrArea">
                Pitch or preferred area<span className={styles.req}>*</span>
              </label>
              <input
                id="pitchOrArea"
                className={styles.input}
                data-invalid={!!showError("pitchOrArea")}
                value={form.pitchOrArea}
                onChange={(e) => setField("pitchOrArea", e.target.value)}
                onBlur={() => handleBlur("pitchOrArea")}
                placeholder="Century Park 5-a-side, or just 'CMC area'"
              />
              {showError("pitchOrArea") ? (
                <span className={styles.errorText}>{errors.pitchOrArea}</span>
              ) : (
                <span className={styles.hint}>
                  Haven't picked a pitch yet? An area is enough to start filling the roster.
                </span>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Roster</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="requiredPlayers">
                  Players needed<span className={styles.req}>*</span>
                </label>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepperBtn}
                    onClick={() => setField("requiredPlayers", Math.max(2, form.requiredPlayers - 1))}
                  >
                    −
                  </button>
                  <input
                    id="requiredPlayers"
                    className={styles.stepperInput}
                    type="number"
                    min={2}
                    max={30}
                    data-invalid={!!showError("requiredPlayers")}
                    value={form.requiredPlayers}
                    onChange={(e) => setField("requiredPlayers", Number(e.target.value))}
                    onBlur={() => handleBlur("requiredPlayers")}
                  />
                  <button
                    type="button"
                    className={styles.stepperBtn}
                    onClick={() => setField("requiredPlayers", Math.min(30, form.requiredPlayers + 1))}
                  >
                    +
                  </button>
                </div>
                {showError("requiredPlayers") && (
                  <span className={styles.errorText}>{errors.requiredPlayers}</span>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="skillLevel">Skill level</label>
                <select
                  id="skillLevel"
                  className={styles.select}
                  value={form.skillLevel}
                  onChange={(e) =>
                    setField("skillLevel", e.target.value as MatchFormState["skillLevel"])
                  }
                >
                  {SKILL_LEVELS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="positionNotes">
                Position or team requirements
              </label>
              <input
                id="positionNotes"
                className={styles.input}
                value={form.positionNotes}
                onChange={(e) => setField("positionNotes", e.target.value)}
                placeholder="Need 2 defenders and a keeper — optional"
              />
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Price &amp; who can join</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="totalPrice">
                Total pitch price<span className={styles.req}>*</span>
              </label>
              <div className={styles.priceInputWrap}>
                <span className={styles.pricePrefix}>ETB</span>
                <input
                  id="totalPrice"
                  className={styles.priceInput}
                  data-invalid={!!showError("totalPrice")}
                  inputMode="decimal"
                  value={form.totalPrice}
                  onChange={(e) => setField("totalPrice", e.target.value.replace(/[^\d.]/g, ""))}
                  onBlur={() => handleBlur("totalPrice")}
                  placeholder="1000"
                />
              </div>
              {showError("totalPrice") ? (
                <span className={styles.errorText}>{errors.totalPrice}</span>
              ) : (
                <span className={styles.hint}>
                  Split equally across the confirmed roster — exact to the cent, no floating-point
                  surprises.
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Who can join</label>
              <div className={styles.visibilityGrid}>
                {PARTICIPATION.map((p) => {
                  const Icon = p.icon;
                  const active = form.participation === p.value;
                  return (
                    <button
                      type="button"
                      key={p.value}
                      className={styles.visibilityCard}
                      data-active={active}
                      onClick={() => setField("participation", p.value)}
                    >
                      <span className={styles.visibilityIcon}>
                        <Icon width={17} height={17} />
                      </span>
                      <span className={styles.visibilityLabel}>{p.label}</span>
                      <span className={styles.visibilityText}>{p.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {submitError && (
            <div className={styles.banner} data-tone="error">
              <AlertIcon width={16} height={16} />
              {submitError}
            </div>
          )}

          <div className={styles.submitRow}>
            <span className={styles.submitHint}>
              Publishing opens the lobby — the pitch isn't held until the roster is ready.
            </span>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? (
                <>
                  <SpinnerIcon className={styles.spin} width={16} height={16} />
                  Publishing…
                </>
              ) : (
                "Publish game"
              )}
            </button>
          </div>
        </div>

        <aside className={styles.sideCol}>
          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <span className={styles.previewSport}>
                {SPORTS.find((s) => s.value === form.sport)?.label} ·{" "}
                {form.duration} min
              </span>
              <span className={styles.previewCountdown}>
                <ClockIcon width={12} height={12} />
                10:00 hold
              </span>
            </div>

            <p className={styles.previewLine}>
              {form.pitchOrArea.trim() || "Pitch or area"} —{" "}
              {form.date
                ? new Date(form.date + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "date"}{" "}
              {form.startTime && `at ${form.startTime}`}
            </p>

            <div className={styles.rosterRow}>
              <UsersSmallIcon width={14} height={14} />
              <div className={styles.rosterTrack}>
                <div className={styles.rosterFill} style={{ width: "0%" }} />
              </div>
              <span className={styles.rosterCount}>0 / {form.requiredPlayers}</span>
            </div>

            <div className={styles.priceSplit}>
              <div>
                <span className={styles.priceSplitLabel}>Total</span>
                <span className={styles.priceSplitValue}>
                  ETB {priceNum > 0 ? priceNum.toLocaleString() : "—"}
                </span>
              </div>
              <div className={styles.priceSplitDivider} />
              <div>
                <span className={styles.priceSplitLabel}>Per player</span>
                <span className={styles.priceSplitValue} data-accent="true">
                  ETB {perPlayer > 0 ? perPlayer.toFixed(2) : "—"}
                </span>
              </div>
            </div>

            <div className={styles.chatBubble}>
              <span className={styles.chatBubbleTag}>Booking card preview</span>
              <p className={styles.chatBubbleText}>
                {SPORTS.find((s) => s.value === form.sport)?.label} booking
                {form.startTime ? ` at ${form.startTime}` : ""} — 0 of {form.requiredPlayers}{" "}
                shares paid — ETB 0 of {priceNum > 0 ? priceNum.toLocaleString() : "0"} secured.
              </p>
            </div>
          </div>

          <div className={styles.tipCard}>
            <h4 className={styles.tipTitle}>How the hold works</h4>
            <ul className={styles.tipList}>
              <li>The pitch locks for 10 minutes once the roster is confirmed and payment starts.</li>
              <li>Players can pay their own share, cover teammates, or clear what's left.</li>
              <li>Booking confirms only when the full amount is secured before the deadline.</li>
            </ul>
          </div>
        </aside>
      </form>
    </div>
  );
}
