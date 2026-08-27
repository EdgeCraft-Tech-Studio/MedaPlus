import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./css/FormPage.module.css";
import { BackArrowIcon, TrophyIcon } from "./Icons";
import {
  FieldWrap, TextField, TextAreaField, ChipGroup, SegmentedControl,
} from "../components/FormControls";

const SPORTS = [
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
];

const FORMATS = [
  { value: "knockout", label: "Knockout" },
  { value: "roundrobin", label: "Round robin" },
  { value: "groups", label: "Groups + knockout" },
];

const TEAM_SLOTS = [
  { value: "4", label: "4 teams" },
  { value: "8", label: "8 teams" },
  { value: "16", label: "16 teams" },
  { value: "32", label: "32 teams" },
];

const SKILL_LEVELS = [
  { value: "any", label: "Any level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const VISIBILITY = [
  { value: "public", label: "Public", hint: "Any team can enter" },
  { value: "invite", label: "Invite only", hint: "You choose teams" },
];

interface FormState {
  name: string;
  sport: string;
  format: string;
  teamSlots: string;
  entryFee: string;
  startDate: string;
  registrationDeadline: string;
  venue: string;
  skillLevel: string;
  description: string;
  visibility: string;
}

const initialState: FormState = {
  name: "", sport: "football", format: "knockout", teamSlots: "8",
  entryFee: "", startDate: "", registrationDeadline: "", venue: "",
  skillLevel: "any", description: "", visibility: "public",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateTournament() {
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

    if (!form.name.trim()) e.name = "Tournament name is required.";
    else if (form.name.trim().length < 3) e.name = "Name must be at least 3 characters.";
    else if (form.name.trim().length > 60) e.name = "Name must be under 60 characters.";

    if (!form.format) e.format = "Choose a format.";
    if (!form.teamSlots) e.teamSlots = "Choose the number of teams.";

    if (!form.venue.trim()) e.venue = "Enter a venue or preferred area.";

    if (!form.startDate) e.startDate = "Pick a start date.";
    else if (form.startDate < todayISO()) e.startDate = "Start date can't be in the past.";

    if (!form.registrationDeadline) {
      e.registrationDeadline = "Pick a registration deadline.";
    } else if (form.registrationDeadline < todayISO()) {
      e.registrationDeadline = "Deadline can't be in the past.";
    } else if (form.startDate && form.registrationDeadline >= form.startDate) {
      e.registrationDeadline = "Deadline must be before the start date.";
    }

    if (form.entryFee && (Number.isNaN(Number(form.entryFee)) || Number(form.entryFee) < 0)) {
      e.entryFee = "Enter a valid amount, or leave it blank.";
    }

    if (form.description.length > 300) e.description = "Keep the description under 300 characters.";

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
      const payload = {
        name: form.name.trim(),
        sport: form.sport,
        format: form.format,
        teamSlots: Number(form.teamSlots),
        entryFeeEtb: form.entryFee ? Number(form.entryFee) : 0,
        startDate: form.startDate,
        registrationDeadline: form.registrationDeadline,
        venue: form.venue.trim(),
        skillLevel: form.skillLevel,
        description: form.description.trim(),
        visibility: form.visibility,
      };

      // TODO: replace with the real API call, e.g.
      // const { tournamentId } = await createTournament(payload);
      await new Promise((resolve) => setTimeout(resolve, 900));
      console.log("TODO: submit createTournament payload", payload);

      // No backend yet, so there's no real tournamentId to route to —
      // sending you back to Home so the flow doesn't dead-end. Replace once
      // the backend exists:
      // nav(`/discover/tournaments/${tournamentId}`);
      nav("/home");
    } catch {
      setSubmitErr("Couldn't create the tournament. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} data-accent="tournament">
      <nav className={styles.nav}>
        <Link to="/home" className={styles.backLink}>
          <BackArrowIcon width={15} height={15} />
          Back to menu
        </Link>
        <span className={styles.navBrand}>MedaPlus</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroIconBadge}>
          <TrophyIcon width={26} height={26} />
        </div>
        <span className={styles.eyebrow}>New tournament</span>
        <h1 className={styles.heroTitle}>Run your own bracket</h1>
        <p className={styles.heroSubtitle}>
          Set the format, open registration, and let teams battle it out.
        </p>
      </header>

      <main className={styles.main}>
        <form className={styles.formCard} onSubmit={onSubmit} noValidate>
          {submitErr && <div className={styles.errorBanner}>{submitErr}</div>}

          <div className={styles.sectionTitle}>Identity</div>

          <FieldWrap label="Tournament name" htmlFor="tn-name" required error={errors.name}>
            <TextField id="tn-name" value={form.name} onChange={(v) => set("name", v)} placeholder="e.g. Bole Weekend Cup" error={errors.name} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Sport" required>
            <ChipGroup options={SPORTS} value={form.sport} onChange={(v) => set("sport", v)} disabled={loading} />
          </FieldWrap>

          <div className={styles.sectionTitle}>Format</div>

          <FieldWrap label="Bracket format" required error={errors.format}>
            <SegmentedControl options={FORMATS} value={form.format} onChange={(v) => set("format", v)} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Number of teams" required error={errors.teamSlots}>
            <ChipGroup options={TEAM_SLOTS} value={form.teamSlots} onChange={(v) => set("teamSlots", v)} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Skill level" hint="Optional — helps the right teams find it.">
            <ChipGroup options={SKILL_LEVELS} value={form.skillLevel} onChange={(v) => set("skillLevel", v)} disabled={loading} />
          </FieldWrap>

          <div className={styles.sectionTitle}>Schedule & venue</div>

          <div className={styles.row2}>
            <FieldWrap label="Start date" htmlFor="tn-start" required error={errors.startDate}>
              <TextField id="tn-start" type="date" min={todayISO()} value={form.startDate} onChange={(v) => set("startDate", v)} error={errors.startDate} disabled={loading} />
            </FieldWrap>
            <FieldWrap label="Registration deadline" htmlFor="tn-deadline" required error={errors.registrationDeadline}>
              <TextField id="tn-deadline" type="date" min={todayISO()} value={form.registrationDeadline} onChange={(v) => set("registrationDeadline", v)} error={errors.registrationDeadline} disabled={loading} />
            </FieldWrap>
          </div>

          <FieldWrap label="Venue or preferred area" htmlFor="tn-venue" required error={errors.venue}>
            <TextField id="tn-venue" value={form.venue} onChange={(v) => set("venue", v)} placeholder="e.g. Bole Arena, or 'venues around Bole'" error={errors.venue} disabled={loading} />
          </FieldWrap>

          <div className={styles.sectionTitle}>Entry & visibility</div>

          <FieldWrap label="Entry fee per team (ETB)" htmlFor="tn-fee" error={errors.entryFee} hint="Optional — leave blank for a free tournament.">
            <TextField id="tn-fee" type="number" min={0} value={form.entryFee} onChange={(v) => set("entryFee", v)} placeholder="e.g. 500" error={errors.entryFee} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Visibility" required>
            <SegmentedControl options={VISIBILITY} value={form.visibility} onChange={(v) => set("visibility", v)} disabled={loading} />
          </FieldWrap>

          <FieldWrap label="Description / rules" htmlFor="tn-desc" error={errors.description} hint="Optional — prize, rules, format details for entrants.">
            <TextAreaField id="tn-desc" value={form.description} onChange={(v) => set("description", v)} placeholder="Winner takes the cup, runner-up gets bragging rights." maxLength={300} disabled={loading} error={errors.description} />
          </FieldWrap>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Creating tournament..." : "Create tournament"}
          </button>
          <p className={styles.footerNote}>You'll manage the bracket and approve entries as the organizer.</p>
        </form>
      </main>
    </div>
  );
}
