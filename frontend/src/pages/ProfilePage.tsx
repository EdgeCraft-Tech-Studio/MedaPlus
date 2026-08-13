import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./css/Profile.module.css";
import { ChevronRightIcon, LockIcon, SettingsIcon } from "./Icons";
import { mockUserProfile } from "./mockData";
import { logout } from "../lib/auth";

export default function ProfilePage() {
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(mockUserProfile);
  const [draft, setDraft] = useState(mockUserProfile);
  const [saving, setSaving] = useState(false);

  const [notifTeam, setNotifTeam] = useState(true);
  const [notifMatch, setNotifMatch] = useState(true);
  const [notifBooking, setNotifBooking] = useState(true);
  const [notifTournament, setNotifTournament] = useState(true);

  function startEdit() {
    setDraft(profile);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // TODO: replace with the real API call, e.g. await updateProfile(draft);
    await new Promise((r) => setTimeout(r, 700));
    console.log("TODO: save profile", draft);
    setProfile(draft);
    setSaving(false);
    setEditing(false);
  }

  async function handleLogout() {
    await logout();
    nav("/login", { replace: true });
  }

  return (
    <div className={styles.page}>
      <div className={styles.headCard}>
        <span className={styles.avatar}>
          {profile.photo ? <img src={profile.photo} alt="" /> : profile.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
        <div>
          <div className={styles.headName}>{profile.fullName}</div>
          <div className={styles.headMeta}>{profile.phone}{profile.email ? ` · ${profile.email}` : ""}</div>
        </div>
      </div>

      <div className={styles.sectionTitle}>Personal information</div>
      <div className={styles.card}>
        {!editing ? (
          <button className={`${styles.row} ${styles.rowBtn}`} onClick={startEdit}>
            <span className={styles.rowLabel}>Edit profile</span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : (
          <form className={styles.editForm} onSubmit={handleSave}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-name">Full name</label>
              <input id="p-name" className={styles.input} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} disabled={saving} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-phone">Phone number</label>
              <input id="p-phone" className={styles.input} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} disabled={saving} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-email">Email (optional)</label>
              <input id="p-email" className={styles.input} value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value || null })} disabled={saving} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
              <button type="button" className={styles.saveBtn} style={{ background: "var(--grass-soft)", color: "var(--green-800)" }} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.sectionTitle}>Account</div>
      <div className={styles.card}>
        <button className={`${styles.row} ${styles.rowBtn}`} onClick={() => console.log("TODO: navigate to account settings")}>
          <span className={styles.rowLabel}>Account settings</span>
          <ChevronRightIcon width={15} height={15} />
        </button>
        <button className={`${styles.row} ${styles.rowBtn}`} onClick={() => console.log("TODO: navigate to security settings")}>
          <span className={styles.rowLabel}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <LockIcon width={14} height={14} /> Security
            </span>
          </span>
          <ChevronRightIcon width={15} height={15} />
        </button>
        <button className={`${styles.row} ${styles.rowBtn} ${styles.rowDanger}`} onClick={handleLogout}>
          <span className={styles.rowLabel}>Log out</span>
          <ChevronRightIcon width={15} height={15} />
        </button>
      </div>

      <div className={styles.sectionTitle}>Notification preferences</div>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Team activity</span>
          <button className={`${styles.toggle} ${notifTeam ? styles.toggleOn : ""}`} onClick={() => setNotifTeam((v) => !v)} aria-pressed={notifTeam}>
            <span className={styles.toggleKnob} />
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Match updates</span>
          <button className={`${styles.toggle} ${notifMatch ? styles.toggleOn : ""}`} onClick={() => setNotifMatch((v) => !v)} aria-pressed={notifMatch}>
            <span className={styles.toggleKnob} />
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Booking & payments</span>
          <button className={`${styles.toggle} ${notifBooking ? styles.toggleOn : ""}`} onClick={() => setNotifBooking((v) => !v)} aria-pressed={notifBooking}>
            <span className={styles.toggleKnob} />
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Tournament updates</span>
          <button className={`${styles.toggle} ${notifTournament ? styles.toggleOn : ""}`} onClick={() => setNotifTournament((v) => !v)} aria-pressed={notifTournament}>
            <span className={styles.toggleKnob} />
          </button>
        </div>
      </div>
      {/* TODO: persist notifTeam/notifMatch/notifBooking/notifTournament to the backend on change */}

      <div className={styles.sectionTitle}>Other</div>
      <div className={styles.card}>
        <button className={`${styles.row} ${styles.rowBtn}`} onClick={() => console.log("TODO: navigate to app preferences")}>
          <span className={styles.rowLabel}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <SettingsIcon width={14} height={14} /> App preferences
            </span>
          </span>
          <ChevronRightIcon width={15} height={15} />
        </button>
      </div>
    </div>
  );
}
