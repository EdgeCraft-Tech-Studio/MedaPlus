import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./css/FormPage.module.css";
import { BackArrowIcon, VersusIcon } from "./Icons";
import {
  FieldWrap, TextField, TextAreaField, SelectField, SegmentedControl, CheckboxRow,
} from "../components/FormControls";

const SPORTS = [
  { value: "football", label: "Football" },
  { value: "basketball", label: "Basketball" },
];

const DURATIONS = [
  { value: "60", label: "60 minutes" },
  { value: "90", label: "90 minutes" },
  { value: "120", label: "120 minutes" },
];

const SKILL_LEVELS = [
  { value: "any", label: "Any level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "competitive", label: "Competitive" },
];

const BOOKING_TYPE = [
  { value: "individual", label: "Individual", hint: "Just you" },
  { value: "team", label: "Team match", hint: "Split with others" },
];

const PARTICIPATION = [
  { value: "public", label: "Public", hint: "Anyone can join" },
  { value: "approval", label: "Approval", hint: "You approve" },
  { value: "invite", label: "Invite only", hint: "You choose" },
];

// TODO: replace with the player's real teams from the backend
const MY_TEAMS = [
  { value: "bole-united", label: "Bole United" },
  { value: "friday-fc", label: "Friday FC" },
];

interface FormState {
  bookingType: string;
  team: string;
  sport: string;
  date: string;
  time: string;
  duration: string;
  pitchOrArea: string;
  requiredPlayers: string;
  skillLevel: string;
  requirements: string;
  participation: string;
  totalPrice: string;
  agreedToConduct: boolean;
}

const initialState: FormState = {
  bookingType: "team", team: "", sport: "football", date: "", time: "",
  duration: "90", pitchOrArea: "", requiredPlayers: "", skillLevel: "any",
  requirements: "", participation: "public", totalPrice: "", agreedToConduct: false,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function MakeMatch() {
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitErr, setSubmitErr] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  const isTeamBooking = form.bookingType === "team";

  const pricePerPlayer = useMemo(() => {
    const price = Number(form.totalPrice);
    const players = Number(form.requiredPlayers);
    if (!price || !players || price <= 0 || players <= 0) return null;
    return price / players;
  }, [form.totalPrice, form.requiredPlayers]);

  function validate(): Partial<Record<keyof FormState, string>> {
    const e: Partial<Record<keyof FormState, string>> = {};

    if (isTeamBooking && !form.team) e.team = "Select which team is booking.";

    if (!form.date) e.date = "Pick a date.";
    else if (form.date < todayISO()) e.date = "Date can't be in the past.";

    if (!form.time) e.time = "Pick a start time.";

    if (!form.duration) e.duration = "Choose a duration.";

    if (!form.pitchOrArea.trim()) e.pitchOrArea = "Enter a pitch name or preferred area.";

    if (isTeamBooking) {
      if (!form.requiredPlayers) e.requiredPlayers = "Enter how many players are needed.";
      else if (!/^\d+$/.test(form.requiredPlayers)) e.requiredPlayers = "Must be a whole number.";
      else if (Number(form.requiredPlayers) < 2) e.requiredPlayers = "Need at least 2 players.";
      else if (Number(form.requiredPlayers) > 30) e.requiredPlayers = "That's a big roster — max 30.";
    }

    if (!form.totalPrice) e.totalPrice = "Enter the total pitch price.";
    else if (Number.isNaN(Number(form.totalPrice)) || Number(form.totalPrice) <= 0) {
      e.totalPrice = "Enter a valid amount.";
    }

    if (isTeamBooking && !form.agreedToConduct) {
      e.agreedToConduct = "You need to accept the booking conduct rules.";
    }

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
        bookingType: form.bookingType,
        team: isTeamBooking ? form.team : null,
        sport: form.sport,
        date: form.date,
        time: form.time,
        durationMinutes: Number(form.duration),
        pitchOrArea: form.pitchOrArea.trim(),
        requiredPlayers: isTeamBooking ? Number(form.requiredPlayers) : 1,
        skillLevel: form.skillLevel,
        requirements: form.requirements.trim(),
        participation: isTeamBooking ? form.participation : null,
        totalPriceEtb: Number(form.totalPrice),
      };

      // TODO: replace with the real API call, e.g.
      // await createBooking(payload); // atomic hold + payment session on the backend
      await new Promise((resolve) => setTimeout(resolve, 900));
      console.log("TODO: submit makeMatch payload", payload);

      // TODO: navigate to the live payment/progress screen once the backend
      // returns a booking hold id, e.g. nav(`/match/${bookingId}/pay`);
    } catch {
      setSubmitErr("Couldn't start the booking. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} data-accent="match">
      <nav className={styles.nav}>
        <Link to="/home" className={styles.backLink}>
          <BackArrowIcon width={15} height={15} />
          Back to menu
        </Link>
        <span className={styles.navBrand}>MedaPlus</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroIconBadge}>
          <VersusIcon width={26} height={26} />
        </div>
        <span className={styles.eyebrow}>New match</span>
        <h1 className={styles.heroTitle}>Set up the game</h1>
        <p className={styles.heroSubtitle}>
          Pick a time and pitch — go it alone, or split the cost with your team.
        </p>
      </header>

      <main className={styles.main}>
        <form className={styles.formCard} onSubmit={onSubmit} noValidate>
          {submitErr && <div className={styles.errorBanner}>{submitErr}</div>}

          <FieldWrap label="Booking type" required>
            <SegmentedControl options={BOOKING_TYPE} value={form.bookingType} onChange={(v) => set("bookingType", v)} disabled={loading} />
          </FieldWrap>

          {isTeamBooking && (
            <FieldWrap label="Booking team" htmlFor="m-team" required error={errors.team}>
              <SelectField id="m-team" value={form.team} onChange={(v) => set("team", v)} options={MY_TEAMS} placeholder="Select your team" error={errors.team} disabled={loading} />
            </FieldWrap>
          )}

          <div className={styles.sectionTitle}>When & where</div>

          <div className={styles.row2}>
            <FieldWrap label="Sport" htmlFor="m-sport">
              <SelectField id="m-sport" value={form.sport} onChange={(v) => set("sport", v)} options={SPORTS} disabled={loading} />
            </FieldWrap>
            <FieldWrap label="Duration" htmlFor="m-duration" required error={errors.duration}>
              <SelectField id="m-duration" value={form.duration} onChange={(v) => set("duration", v)} options={DURATIONS} error={errors.duration} disabled={loading} />
            </FieldWrap>
          </div>

          <div className={styles.row2}>
            <FieldWrap label="Date" htmlFor="m-date" required error={errors.date}>
              <TextField id="m-date" type="date" min={todayISO()} value={form.date} onChange={(v) => set("date", v)} error={errors.date} disabled={loading} />
            </FieldWrap>
            <FieldWrap label="Start time" htmlFor="m-time" required error={errors.time}>
              <TextField id="m-time" type="time" value={form.time} onChange={(v) => set("time", v)} error={errors.time} disabled={loading} />
            </FieldWrap>
          </div>

          <FieldWrap label="Pitch or preferred area" htmlFor="m-pitch" required error={errors.pitchOrArea} hint="Name a specific pitch, or an area if you haven't picked one yet.">
            <TextField id="m-pitch" value={form.pitchOrArea} onChange={(v) => set("pitchOrArea", v)} placeholder="e.g. Bole Arena, or 'somewhere in Bole'" error={errors.pitchOrArea} disabled={loading} />
          </FieldWrap>

          {isTeamBooking && (
            <>
              <div className={styles.sectionTitle}>Roster</div>

              <div className={styles.row2}>
                <FieldWrap label="Players needed" htmlFor="m-players" required error={errors.requiredPlayers}>
                  <TextField id="m-players" type="number" min={2} max={30} value={form.requiredPlayers} onChange={(v) => set("requiredPlayers", v)} placeholder="e.g. 10" error={errors.requiredPlayers} disabled={loading} />
                </FieldWrap>
                <FieldWrap label="Skill level" htmlFor="m-skill">
                  <SelectField id="m-skill" value={form.skillLevel} onChange={(v) => set("skillLevel", v)} options={SKILL_LEVELS} disabled={loading} />
                </FieldWrap>
              </div>

              <FieldWrap label="Position / team requirements" htmlFor="m-reqs" hint="Optional — e.g. 'need 2 defenders' or 'mixed team welcome'.">
                <TextAreaField id="m-reqs" value={form.requirements} onChange={(v) => set("requirements", v)} placeholder="Anything players should know before joining" rows={2} disabled={loading} />
              </FieldWrap>

              <FieldWrap label="Who can join" required>
                <SegmentedControl options={PARTICIPATION} value={form.participation} onChange={(v) => set("participation", v)} disabled={loading} />
              </FieldWrap>
            </>
          )}

          <div className={styles.sectionTitle}>Price</div>

          <FieldWrap label="Total pitch price (ETB)" htmlFor="m-price" required error={errors.totalPrice}>
            <TextField id="m-price" type="number" min={1} value={form.totalPrice} onChange={(v) => set("totalPrice", v)} placeholder="e.g. 1000" error={errors.totalPrice} disabled={loading} />
          </FieldWrap>

          {isTeamBooking && pricePerPlayer !== null && (
            <div className={styles.summaryBox}>
              <div>
                <div className={styles.summaryLabel}>Per player</div>
                <div className={styles.summaryValue}>{pricePerPlayer.toFixed(2)} ETB</div>
                <div className={styles.summarySub}>{form.requiredPlayers} players · exact rounding applied at checkout</div>
              </div>
            </div>
          )}

          {isTeamBooking && (
            <FieldWrap error={errors.agreedToConduct}>
              <CheckboxRow
                id="m-conduct"
                checked={form.agreedToConduct}
                onChange={(v) => set("agreedToConduct", v)}
                label="I agree to the booking conduct rules and understand this holds the slot for a limited time until the group's payment is complete."
                error={errors.agreedToConduct}
              />
            </FieldWrap>
          )}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Starting booking..." : isTeamBooking ? "Start group booking" : "Book pitch"}
          </button>
          <p className={styles.footerNote}>
            {isTeamBooking ? "The slot is held while your team pays their shares." : "You'll pay the full amount now."}
          </p>
        </form>
      </main>
    </div>
  );
}
