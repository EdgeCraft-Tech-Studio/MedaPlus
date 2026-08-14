import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./css/Profile.module.css";
import { ChevronRightIcon, LockIcon } from "./Icons";
import {
  me, logout, updateProfile, updateProfilePhoto, updateEmail,
  changePassword, requestPhoneChange, confirmPhoneChange,
} from "../lib/auth";
import type { SessionUser } from "../lib/session";

const DASH = "–";

export default function ProfilePage() {
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"request" | "confirm">("request");
  const [newPhone, setNewPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const u = await me();
        setUser(u);
      } catch (err) {
        console.error("Failed to load profile:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function startEdit() {
    if (!user) return;
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setProfileError(null);
    setEditing(true);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      const updated = await updateProfile({ first_name: firstName, last_name: lastName });
      setUser(updated);
      setEditing(false);
    } catch (err: any) {
      setProfileError(err?.response?.data?.detail ?? "Couldn't save changes. Try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  function handlePhotoClick() {
    fileInputRef.current?.click();
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const { profile_photo_url } = await updateProfilePhoto(file);
      setUser({ ...user, profile_photo_url });
    } catch (err: any) {
      setPhotoError(err?.response?.data?.profile_photo?.[0] ?? "Couldn't upload photo.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function startEditEmail() {
    if (!user) return;
    setEmailDraft(user.email ?? "");
    setEmailError(null);
    setEditingEmail(true);
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    setEmailError(null);
    try {
      const updated = await updateEmail(emailDraft);
      setUser(updated);
      setEditingEmail(false);
    } catch (err: any) {
      setEmailError(err?.response?.data?.email?.[0] ?? "Couldn't save email.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const res = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setPasswordSuccess(res.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (err: any) {
      const data = err?.response?.data;
      const firstError =
        data?.current_password?.[0] ?? data?.new_password?.[0] ??
        data?.confirm_password?.[0] ?? data?.detail ?? "Couldn't change password.";
      setPasswordError(firstError);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRequestPhoneChange(e: React.FormEvent) {
    e.preventDefault();
    setPhoneSubmitting(true);
    setPhoneError(null);
    try {
      const res = await requestPhoneChange(newPhone);
      setPhoneMessage(res.message);
      setPhoneStep("confirm");
    } catch (err: any) {
      const data = err?.response?.data;
      setPhoneError(data?.new_phone?.[0] ?? data?.detail ?? "Couldn't request phone change.");
    } finally {
      setPhoneSubmitting(false);
    }
  }

  async function handleConfirmPhoneChange(e: React.FormEvent) {
    e.preventDefault();
    setPhoneSubmitting(true);
    setPhoneError(null);
    try {
      const updated = await confirmPhoneChange({ new_phone: newPhone, otp_code: otpCode });
      setUser(updated);
      setShowPhoneForm(false);
      setPhoneStep("request");
      setNewPhone("");
      setOtpCode("");
      setPhoneMessage(null);
    } catch (err: any) {
      const data = err?.response?.data;
      setPhoneError(data?.otp_code?.[0] ?? data?.detail ?? "Couldn't confirm phone change.");
    } finally {
      setPhoneSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    nav("/login", { replace: true });
  }

  if (loading) {
    return <div className={styles.page}><div className={styles.headCard} style={{ opacity: 0.5 }} /></div>;
  }

  if (loadError || !user) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState ?? styles.card}>
          <p>Couldn't load your profile. Pull to refresh or try again shortly.</p>
        </div>
      </div>
    );
  }

  const initials = user.full_name
    ? user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : DASH;

  return (
    <div className={styles.page}>
      <div className={styles.headCard}>
        <button
          className={styles.avatar}
          onClick={handlePhotoClick}
          disabled={uploadingPhoto}
          aria-label="Change profile photo"
          style={{ border: "none", cursor: "pointer", padding: 0 }}
        >
          {user.profile_photo_url ? <img src={user.profile_photo_url} alt="" /> : initials}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={handlePhotoChange}
        />
        <div>
          <div className={styles.headName}>{user.full_name || DASH}</div>
          <div className={styles.headMeta}>
            {user.phone || DASH}{user.email ? ` · ${user.email}` : ""}
          </div>
        </div>
      </div>
      {uploadingPhoto && <div className={styles.sectionTitle}>Uploading photo…</div>}
      {photoError && <div className={styles.sectionTitle} style={{ color: "var(--danger, red)" }}>{photoError}</div>}

      {/* ---------- Personal information ---------- */}
      <div className={styles.sectionTitle}>Personal information</div>
      <div className={styles.card}>
        {!editing ? (
          <button className={`${styles.row} ${styles.rowBtn}`} onClick={startEdit}>
            <span className={styles.rowLabel}>Edit profile</span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : (
          <form className={styles.editForm} onSubmit={handleSaveProfile}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-first">First name</label>
              <input id="p-first" className={styles.input} value={firstName}
                onChange={(e) => setFirstName(e.target.value)} disabled={savingProfile} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-last">Last name</label>
              <input id="p-last" className={styles.input} value={lastName}
                onChange={(e) => setLastName(e.target.value)} disabled={savingProfile} />
            </div>
            {profileError && <div style={{ color: "var(--danger, red)", fontSize: 13 }}>{profileError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={styles.saveBtn} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save changes"}
              </button>
              <button type="button" className={styles.saveBtn}
                style={{ background: "var(--grass-soft)", color: "var(--green-800)" }}
                onClick={() => setEditing(false)} disabled={savingProfile}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ---------- Email ---------- */}
      <div className={styles.sectionTitle}>Email</div>
      <div className={styles.card}>
        {!editingEmail ? (
          <button className={`${styles.row} ${styles.rowBtn}`} onClick={startEditEmail}>
            <span className={styles.rowLabel}>{user.email ?? "Add an email"}</span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : (
          <form className={styles.editForm} onSubmit={handleSaveEmail}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-email">Email</label>
              <input id="p-email" type="email" className={styles.input} value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)} disabled={savingEmail} />
            </div>
            {emailError && <div style={{ color: "var(--danger, red)", fontSize: 13 }}>{emailError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={styles.saveBtn} disabled={savingEmail}>
                {savingEmail ? "Saving..." : "Save email"}
              </button>
              <button type="button" className={styles.saveBtn}
                style={{ background: "var(--grass-soft)", color: "var(--green-800)" }}
                onClick={() => setEditingEmail(false)} disabled={savingEmail}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ---------- Security ---------- */}
      <div className={styles.sectionTitle}>Security</div>
      <div className={styles.card}>
        {!showPasswordForm ? (
          <button className={`${styles.row} ${styles.rowBtn}`} onClick={() => { setShowPasswordForm(true); setPasswordSuccess(null); }}>
            <span className={styles.rowLabel}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <LockIcon width={14} height={14} /> Change password
              </span>
            </span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : (
          <form className={styles.editForm} onSubmit={handleChangePassword}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pw-current">Current password</label>
              <input id="pw-current" type="password" className={styles.input} value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} disabled={savingPassword} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pw-new">New password</label>
              <input id="pw-new" type="password" className={styles.input} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} disabled={savingPassword} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pw-confirm">Confirm new password</label>
              <input id="pw-confirm" type="password" className={styles.input} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} disabled={savingPassword} />
            </div>
            {passwordError && <div style={{ color: "var(--danger, red)", fontSize: 13 }}>{passwordError}</div>}
            <br />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={styles.saveBtn} disabled={savingPassword}>
                {savingPassword ? "Saving..." : "Update password"}
              </button>
              <button type="button" className={styles.saveBtn}
                style={{ background: "var(--grass-soft)", color: "var(--green-800)" }}
                onClick={() => setShowPasswordForm(false)} disabled={savingPassword}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {passwordSuccess && <div style={{ padding: "8px 16px", fontSize: 13, color: "var(--green-800)" }}>{passwordSuccess}</div>}

        {!showPhoneForm ? (
          <button className={`${styles.row} ${styles.rowBtn}`} onClick={() => { setShowPhoneForm(true); setPhoneStep("request"); }}>
            <span className={styles.rowLabel}>Change phone number</span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : phoneStep === "request" ? (
          <form className={styles.editForm} onSubmit={handleRequestPhoneChange}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-phone">New phone number</label>
              <input id="new-phone" className={styles.input} placeholder="+251912345678" value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)} disabled={phoneSubmitting} />
            </div>
            {phoneError && <div style={{ color: "var(--danger, red)", fontSize: 13 }}>{phoneError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={styles.saveBtn} disabled={phoneSubmitting}>
                {phoneSubmitting ? "Sending..." : "Send OTP"}
              </button>
              <button type="button" className={styles.saveBtn}
                style={{ background: "var(--grass-soft)", color: "var(--green-800)" }}
                onClick={() => setShowPhoneForm(false)} disabled={phoneSubmitting}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form className={styles.editForm} onSubmit={handleConfirmPhoneChange}>
            {phoneMessage && <div style={{ fontSize: 13, color: "var(--green-800)" }}>{phoneMessage}</div>}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="otp">OTP code</label>
              <input id="otp" className={styles.input} value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)} disabled={phoneSubmitting} />
            </div>
            {phoneError && <div style={{ color: "var(--danger, red)", fontSize: 13 }}>{phoneError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={styles.saveBtn} disabled={phoneSubmitting}>
                {phoneSubmitting ? "Confirming..." : "Confirm"}
              </button>
              <button type="button" className={styles.saveBtn}
                style={{ background: "var(--grass-soft)", color: "var(--green-800)" }}
                onClick={() => { setShowPhoneForm(false); setPhoneStep("request"); }} disabled={phoneSubmitting}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ---------- Account ---------- */}
      <div className={styles.sectionTitle}>Account</div>
      <div className={styles.card}>
        <button className={`${styles.row} ${styles.rowBtn} ${styles.rowDanger}`} onClick={handleLogout}>
          <span className={styles.rowLabel}>Log out</span>
          <ChevronRightIcon width={15} height={15} />
        </button>
      </div>
    </div>
  );
}