import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./css/FormPage.module.css";
import { BackArrowIcon, UsersIcon } from "./Icons";
import {
  FieldWrap, TextField, TextAreaField, SelectField, ChipGroup, SegmentedControl, LogoUpload,
} from "../components/FormControls";
import { createTeam } from "../lib/team";

const SPORTS = [
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
  { value: "other", label: "Other" },
];

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "competitive", label: "Competitive" },
];

const DAYS = [
  { value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" }, { value: "fri", label: "Fri" }, { value: "sat", label: "Sat" }, { value: "sun", label: "Sun" },
];

const PLAY_TIMES = [
  { value: "morning", label: "Morning (6–11)" },
  { value: "afternoon", label: "Afternoon (11–5)" },
  { value: "evening", label: "Evening (5–10)" },
];


const AGE_CATEGORIES = [
  { value: "open", label: "Open" },
  { value: "u18", label: "Under 18" },
  { value: "u21", label: "Under 21" },
  { value: "adult", label: "Adult" },
  { value: "other", label: "Other" },
];

const VISIBILITY = [
  { value: "public", label: "Public", hint: "Anyone can join" },
  { value: "request", label: "Request", hint: "You approve" },
  { value: "private", label: "Private", hint: "Invite only" },
];

interface FormState {
  name: string;
  logo: string | null;
  logoFile: File | null; 
  description: string;
  sport: string;
  sportOther: string;
  homeArea: string;
  skillLevel: string;
  preferredDays: string[];
  playTime: string;
  ageCategory: string;
  capacity: string;
  visibility: string;
}

const initialState: FormState = {
  name: "", logo: null, logoFile: null, description: "", sport: "", sportOther: "",
  homeArea: "", skillLevel: "", preferredDays: [], playTime: "",
  ageCategory: "open", capacity: "", visibility: "public",
};

export default function CreateTeam() {
  const nav = useNavigate();
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitErr, setSubmitErr] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): Partial<Record<keyof FormState, string>> {
    const e: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) e.name = "Team name is required.";
    else if (form.name.trim().length < 3) e.name = "Team name must be at least 3 characters.";
    else if (form.name.trim().length > 40) e.name = "Team name must be under 40 characters.";

    if (!form.sport) e.sport = "Choose a sport.";
    if (form.sport === "other" && !form.sportOther.trim()) e.sportOther = "Tell us which sport.";

    if (!form.homeArea.trim()) e.homeArea = "Home area is required.";

    if (!form.skillLevel) e.skillLevel = "Choose a skill level.";

    if (!form.capacity) e.capacity = "Capacity is required.";
    else if (!/^\d+$/.test(form.capacity)) e.capacity = "Capacity must be a whole number.";
    else if (Number(form.capacity) < 2) e.capacity = "A team needs at least 2 members.";
    else if (Number(form.capacity) > 100) e.capacity = "Capacity can't exceed 100.";

    if (form.description.length > 220) e.description = "Keep the description under 220 characters.";

    if (!form.visibility) e.visibility = "Choose a visibility mode.";

    return e;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr("");
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setLoading(true);
    try {
      const { slug } = await createTeam({
        name: form.name.trim(),
        description: form.description.trim(),
        sport: form.sport === "other" ? form.sportOther.trim() : form.sport,
        area: form.homeArea.trim(),
        skill_level: form.skillLevel,
        preferred_days: form.preferredDays,
        play_time: form.playTime,
        age_category: form.ageCategory,
        max_roster_size: Number(form.capacity),
        visibility: form.visibility,
        logoFile: form.logoFile,
      });
      nav(`/teams/${slug}`);
    } catch (err: any) {
      if (err.response?.status === 400) {
      const raw = err.response.data as Record<string, string[]>;
      const flat: Partial<Record<keyof FormState, string>> = {};
      Object.entries(raw).forEach(([key, msgs]) => {
        flat[key as keyof FormState] = Array.isArray(msgs) ? msgs[0] : String(msgs);
      });
      setErrors(flat);
    } else {
      setSubmitErr("Couldn't create the team. Please try again.");
    }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} data-accent="team">
      <nav className={styles.nav}>
        <Link to="/home" className={styles.backLink}>
          <BackArrowIcon width={15} height={15} />
          Back to menu
        </Link>
        <span className={styles.navBrand}>MedaPlus</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroIconBadge}>
          <UsersIcon width={26} height={26} />
        </div>
        <span className={styles.eyebrow}>New team</span>
        <h1 className={styles.heroTitle}>Build your squad</h1>
        <p className={styles.heroSubtitle}>
          Give your team an identity, set who can join, and start inviting players.
        </p>
      </header>

      <main className={styles.main}>
        <form className={styles.formCard} onSubmit={onSubmit} noValidate>
          {submitErr && <div className={styles.errorBanner}>{submitErr}</div>}

          <div className={styles.sectionTitle}>Identity</div>

          <FieldWrap label="Team name" htmlFor="t-name" required error={errors.name}>
            <TextField id="t-name" value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Bole United" error={errors.name} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Team logo">
            <LogoUpload
  value={form.logo}
  onChange={(v) => set("logo", v)}
  onFileChange={(f) => set("logoFile", f)}   
/>
          </FieldWrap>

          <FieldWrap label="Short description" htmlFor="t-desc" error={errors.description} hint="Optional — what makes your team, your team?">
            <TextAreaField id="t-desc" value={form.description} onChange={(v) => set("description", v)} placeholder="Weekend 7-a-side crew, big on passing, low on drama." maxLength={220} disabled={loading} error={errors.description} />
          </FieldWrap>

          <div className={styles.sectionTitle}>Sport & home area</div>

          <div className={styles.row2}>
            <FieldWrap label="Sport" htmlFor="t-sport" required error={errors.sport}>
              <SelectField id="t-sport" value={form.sport} onChange={(v) => set("sport", v)} options={SPORTS} placeholder="Select sport" error={errors.sport} disabled={loading} />
            </FieldWrap>

            {form.sport === "other" ? (
              <FieldWrap label="Which sport?" htmlFor="t-sport-other" required error={errors.sportOther}>
                <TextField id="t-sport-other" value={form.sportOther} onChange={(v) => set("sportOther", v)} placeholder="e.g. Futsal" error={errors.sportOther} disabled={loading} />
              </FieldWrap>
            ) : (
              <FieldWrap label="Home area" htmlFor="t-area" required error={errors.homeArea}>
                <TextField id="t-area" value={form.homeArea} onChange={(v) => set("homeArea", v)} placeholder="e.g. Bole, Addis Ababa" error={errors.homeArea} disabled={loading} />
              </FieldWrap>
            )}
          </div>

          {form.sport === "other" && (
            <FieldWrap label="Home area" htmlFor="t-area2" required error={errors.homeArea}>
              <TextField id="t-area2" value={form.homeArea} onChange={(v) => set("homeArea", v)} placeholder="e.g. Bole, Addis Ababa" error={errors.homeArea} disabled={loading} />
            </FieldWrap>
          )}

          <div className={styles.sectionTitle}>Level & schedule</div>

          <FieldWrap label="Skill level" required error={errors.skillLevel}>
            <ChipGroup options={SKILL_LEVELS} value={form.skillLevel} onChange={(v) => set("skillLevel", v)} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Preferred days" hint="Optional — helps teammates know when you usually play.">
            <ChipGroup options={DAYS} value={form.preferredDays} onChange={(v) => set("preferredDays", v)} multi disabled={loading} />
          </FieldWrap>

          <div className={styles.row2}>
            <FieldWrap label="Usual playing time" htmlFor="t-time">
              <SelectField id="t-time" value={form.playTime} onChange={(v) => set("playTime", v)} options={PLAY_TIMES} placeholder="Optional" disabled={loading} />
            </FieldWrap>
            <FieldWrap label="Age category" htmlFor="t-age">
              <SelectField id="t-age" value={form.ageCategory} onChange={(v) => set("ageCategory", v)} options={AGE_CATEGORIES} disabled={loading} />
            </FieldWrap>
          </div>

          <div className={styles.sectionTitle}>Membership</div>

          <FieldWrap label="Capacity" htmlFor="t-cap" required error={errors.capacity} hint="Maximum number of active members.">
            <TextField id="t-cap" type="number" min={2} max={100} value={form.capacity} onChange={(v) => set("capacity", v)} placeholder="e.g. 18" error={errors.capacity} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Visibility" required error={errors.visibility}>
            <SegmentedControl options={VISIBILITY} value={form.visibility} onChange={(v) => set("visibility", v)} disabled={loading} />
          </FieldWrap>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Creating team..." : "Create team"}
          </button>
          <p className={styles.footerNote}>You'll be the team owner and can change any of this later.</p>
        </form>
      </main>
    </div>
  );
}
