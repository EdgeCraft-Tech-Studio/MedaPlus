import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./css/CreateTeam.module.css";
import AppHeader from "./AppHeader";

/* ---------- icons ---------- */

function BallIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4L12 8.2z" />
      <path d="M12 3v5.2M4.5 8.5l3.5 2.7M19.5 8.5L16 11.2M6.3 18l1.6-4.8M17.7 18l-1.6-4.8" />
    </svg>
  );
}

function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
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

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3" />
    </svg>
  );
}

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.4 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.4-3.6-8.5S9.6 5.9 12 3.5z" />
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

/* ---------- constants (grounded in proposal §3) ---------- */

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

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

const TIME_WINDOWS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Late night" },
] as const;

const AGE_CATEGORIES = [
  { value: "", label: "No preference" },
  { value: "u18", label: "Under 18" },
  { value: "18plus", label: "18+" },
  { value: "over35", label: "Over 35 (veterans)" },
] as const;

const VISIBILITY = [
  {
    value: "public",
    label: "Public",
    icon: GlobeIcon,
    text: "Listed in team search. Anyone can join instantly while there's room.",
  },
  {
    value: "request",
    label: "Request to join",
    icon: ShieldIcon,
    text: "Listed in team search. You approve or reject each request.",
  },
  {
    value: "private",
    label: "Private",
    icon: LockIcon,
    text: "Hidden from search. Members join by invite link or code only.",
  },
] as const;

type Visibility = (typeof VISIBILITY)[number]["value"];

interface TeamFormState {
  name: string;
  logoInitials: string;
  description: string;
  sport: (typeof SPORTS)[number]["value"];
  homeArea: string;
  skillLevel: (typeof SKILL_LEVELS)[number]["value"];
  preferredDays: string[];
  usualTime: (typeof TIME_WINDOWS)[number]["value"] | "";
  ageCategory: string;
  capacity: number;
  visibility: Visibility;
}

const initialState: TeamFormState = {
  name: "",
  logoInitials: "",
  description: "",
  sport: "football",
  homeArea: "",
  skillLevel: "intermediate",
  preferredDays: [],
  usualTime: "",
  ageCategory: "",
  capacity: 16,
  visibility: "public",
};

type Errors = Partial<Record<keyof TeamFormState, string>>;

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// TODO: once team creation is backed by a real API, use the id it returns
// instead of deriving one from the name — this is only a stand-in so the
// "add your players" link below has somewhere real to go.
function slugifyTeamName(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "your-team"
  );
}

export default function CreateTeam() {
  const navigate = useNavigate();
  const [form, setForm] = useState<TeamFormState>(initialState);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof TeamFormState, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const badgeInitials = form.logoInitials.trim()
    ? form.logoInitials.trim().slice(0, 3).toUpperCase()
    : initialsFromName(form.name);

  function setField<K extends keyof TeamFormState>(key: K, value: TeamFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleDay(day: string) {
    setForm((f) => {
      const has = f.preferredDays.includes(day);
      return {
        ...f,
        preferredDays: has ? f.preferredDays.filter((d) => d !== day) : [...f.preferredDays, day],
      };
    });
  }

  function validate(f: TeamFormState): Errors {
    const e: Errors = {};
    if (!f.name.trim()) e.name = "Give your team a name.";
    else if (f.name.trim().length < 3) e.name = "Team name needs at least 3 characters.";
    else if (f.name.trim().length > 40) e.name = "Keep it under 40 characters.";

    if (f.description.length > 240) e.description = "Keep the description under 240 characters.";

    if (!f.homeArea.trim()) e.homeArea = "Tell players where your team plays.";

    if (!Number.isFinite(f.capacity) || f.capacity < 5 || f.capacity > 60) {
      e.capacity = "Capacity must be between 5 and 60 members.";
    }

    if (!f.visibility) e.visibility = "Choose who can find and join this team.";

    return e;
  }

  const liveErrors = useMemo(() => validate(form), [form]);

  function handleBlur(key: keyof TeamFormState) {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(liveErrors);
  }

  
  const teamId = slugifyTeamName(form.name);

  async function handleSubmit() {
    const foundErrors = validate(form);
    setErrors(foundErrors);
    setTouched({
      name: true,
      description: true,
      homeArea: true,
      capacity: true,
      visibility: true,
    });
    if (Object.keys(foundErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // TODO: await teamsApi.createTeam(form) — POST to the team-management
      // service (TM-01), then navigate to the new team's page on success.
      await new Promise((resolve) => setTimeout(resolve, 900));
      navigate(`/team/${teamId}/members`);
    } catch (err) {
      setSubmitError("Couldn't create the team. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const showError = (key: keyof TeamFormState) => touched[key] && errors[key];



  return (
    <div className={styles.page}>
        <AppHeader variant="logout"/>
        <br />
        <Link to="/home" className={styles.backLink}>
          <ArrowLeftIcon width={15} height={15} />
          Back home
        </Link>

      <header className={styles.hero}>
        <span className={styles.eyebrow}>Team management</span>
        <h1 className={styles.heroTitle}>
          Build your <em>squad's</em> home
        </h1>
        <p className={styles.heroSubtitle}>
          A name, a badge, a place to play. Everything else — chat, games, split payments —
          follows once your team exists.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.formCol}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Team identity</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="name">
                  Team name<span className={styles.req}>*</span>
                </label>
                <input
                  id="name"
                  className={styles.input}
                  data-invalid={!!showError("name")}
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  onBlur={() => handleBlur("name")}
                  placeholder="Riverside Falcons"
                  maxLength={40}
                />
                <span className={styles.hint}>Your official team name.</span>
                {showError("name") && <span className={styles.errorText}>{errors.name}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="logoInitials">
                  Badge initials
                </label>
                <input
                  id="logoInitials"
                  className={styles.input}
                  value={form.logoInitials}
                  onChange={(e) => setField("logoInitials", e.target.value.toUpperCase())}
                  placeholder={initialsFromName(form.name)}
                  maxLength={3}
                />
                <span className={styles.hint}>Leave blank to auto-generate from the name.</span>
              </div>
            </div>
            <br />
            <div className={styles.field}>
              <label className={styles.label} htmlFor="description">
                Short description
              </label>
              <textarea
                id="description"
                className={styles.textarea}
                data-invalid={!!showError("description")}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                onBlur={() => handleBlur("description")}
                placeholder="Sunday league regulars, easygoing but competitive when it counts."
                rows={3}
                maxLength={240}
              />
              <div className={styles.hintRow}>
                {showError("description") ? (
                  <span className={styles.errorText}>{errors.description}</span>
                ) : (
                  <span className={styles.hint}>Optional — shown on your team's public page.</span>
                )}
                <span className={styles.counter}>{form.description.length}/240</span>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Where &amp; how you play</h2>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="sport">
                  Sport
                </label>
                <select
                  id="sport"
                  className={styles.select}
                  value={form.sport}
                  onChange={(e) => setField("sport", e.target.value as TeamFormState["sport"])}
                >
                  {SPORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="homeArea">
                  Home area<span className={styles.req}>*</span>
                </label>
                <input
                  id="homeArea"
                  className={styles.input}
                  data-invalid={!!showError("homeArea")}
                  value={form.homeArea}
                  onChange={(e) => setField("homeArea", e.target.value)}
                  onBlur={() => handleBlur("homeArea")}
                  placeholder="Bole, Addis Ababa"
                />
                {showError("homeArea") && (
                  <span className={styles.errorText}>{errors.homeArea}</span>
                )}
              </div>
            </div>
            <br />
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="skillLevel">
                  Skill level
                </label>
                <select
                  id="skillLevel"
                  className={styles.select}
                  value={form.skillLevel}
                  onChange={(e) =>
                    setField("skillLevel", e.target.value as TeamFormState["skillLevel"])
                  }
                >
                  {SKILL_LEVELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="usualTime">
                  Usual playing time
                </label>
                <select
                  id="usualTime"
                  className={styles.select}
                  value={form.usualTime}
                  onChange={(e) =>
                    setField("usualTime", e.target.value as TeamFormState["usualTime"])
                  }
                >
                  <option value="">No preference</option>
                  {TIME_WINDOWS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>  
            <br />

            <div className={styles.field}>
              <label className={styles.label}>Preferred days</label>
              <div className={styles.chipRow}>
                {DAYS.map((d) => {
                  const active = form.preferredDays.includes(d.value);
                  return (
                    <button
                      type="button"
                      key={d.value}
                      className={styles.chip}
                      data-active={active}
                      onClick={() => toggleDay(d.value)}
                      aria-pressed={active}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <span className={styles.hint}>Optional — helps teammates and opponents match your schedule.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="ageCategory">
                Age category
              </label>
              <select
                id="ageCategory"
                className={styles.select}
                value={form.ageCategory}
                onChange={(e) => setField("ageCategory", e.target.value)}
              >
                {AGE_CATEGORIES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Capacity</h2>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="capacity">
                Maximum active members<span className={styles.req}>*</span>
              </label>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setField("capacity", Math.max(5, form.capacity - 1))}
                  aria-label="Decrease capacity"
                >
                  −
                </button>
                <input
                  id="capacity"
                  className={styles.stepperInput}
                  type="number"
                  min={5}
                  max={60}
                  data-invalid={!!showError("capacity")}
                  value={form.capacity}
                  onChange={(e) => setField("capacity", Number(e.target.value))}
                  onBlur={() => handleBlur("capacity")}
                />
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setField("capacity", Math.min(60, form.capacity + 1))}
                  aria-label="Increase capacity"
                >
                  +
                </button>
                <span className={styles.stepperUnit}>members</span>
              </div>
              {showError("capacity") ? (
                <span className={styles.errorText}>{errors.capacity}</span>
              ) : (
                <span className={styles.hint}>
                  A 20-member squad can still pick just 10 for any given match — capacity only
                  caps the roster, not the game.
                </span>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Visibility</h2>
            <div className={styles.visibilityGrid}>
              {VISIBILITY.map((v) => {
                const Icon = v.icon;
                const active = form.visibility === v.value;
                return (
                  <button
                    type="button"
                    key={v.value}
                    className={styles.visibilityCard}
                    data-active={active}
                    onClick={() => setField("visibility", v.value)}
                    aria-pressed={active}
                  >
                    <span className={styles.visibilityIcon}>
                      <Icon width={18} height={18} />
                    </span>
                    <span className={styles.visibilityLabel}>{v.label}</span>
                    <span className={styles.visibilityText}>{v.text}</span>
                  </button>
                );
              })}
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
              You'll be the team owner. Roles and invites come next.
            </span>
            <button
  type="button"
  className={styles.btnPrimary}
  disabled={submitting}
  onClick={handleSubmit}
>
  {submitting ? (
    <>
      <SpinnerIcon className={styles.spin} width={16} height={16} />
      Creating team…
    </>
  ) : (
    "Create team"
  )}
</button>
          </div>
        </div>

        <aside className={styles.sideCol}>
          <div className={styles.previewCard}>
            <span className={styles.previewLabel}>Live preview</span>
            <div className={styles.badgeWrap}>
              <div className={styles.badge}>
                <span>{badgeInitials}</span>
              </div>
              <div className={styles.badgeShine} />
            </div>
            <h3 className={styles.previewName}>{form.name.trim() || "Your team name"}</h3>
            <p className={styles.previewArea}>
              {form.homeArea.trim() || "Home area not set"} ·{" "}
              {SPORTS.find((s) => s.value === form.sport)?.label}
            </p>

            <div className={styles.previewTags}>
              <span className={styles.previewTag}>
                {SKILL_LEVELS.find((s) => s.value === form.skillLevel)?.label}
              </span>
              {form.usualTime && (
                <span className={styles.previewTag}>
                  {TIME_WINDOWS.find((t) => t.value === form.usualTime)?.label}
                </span>
              )}
              {form.ageCategory && (
                <span className={styles.previewTag}>
                  {AGE_CATEGORIES.find((a) => a.value === form.ageCategory)?.label}
                </span>
              )}
            </div>

            <div className={styles.capacityMeter}>
              <div className={styles.capacityTrack}>
                <div
                  className={styles.capacityFill}
                  style={{ width: `${Math.min(100, (1 / form.capacity) * 100)}%` }}
                />
              </div>
              <span className={styles.capacityLabel}>1 / {form.capacity} members</span>
            </div>

            <div className={styles.previewVisibility}>
              {(() => {
                const v = VISIBILITY.find((x) => x.value === form.visibility)!;
                const Icon = v.icon;
                return (
                  <>
                    <Icon width={14} height={14} />
                    <span>{v.label}</span>
                  </>
                );
              })()}
            </div>

            {form.preferredDays.length > 0 && (
              <div className={styles.previewDays}>
                {DAYS.filter((d) => form.preferredDays.includes(d.value)).map((d) => (
                  <span key={d.value} className={styles.previewDayDot}>
                    {d.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.tipCard}>
            <h4 className={styles.tipTitle}>What happens after creating</h4>
            <ul className={styles.tipList}>
              <li>You become the team owner and can add admins later.</li>
              <li>Invite teammates by link, code, or approve join requests.</li>
              <li>Start a game and split any pitch booking across your roster.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
