import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./css/Profile.module.css";
import { ChevronRightIcon, LockIcon } from "./Icons";
import {
  me, logout, updateProfile, updateProfilePhoto, updateEmail,
  changePassword, requestPhoneChange, confirmPhoneChange,
} from "../lib/auth";
import type { SessionUser } from "../lib/session";

const DASH = "–";

/* ---------------------------------------------------------------------- */
/* Icons                                                                   */
/* ---------------------------------------------------------------------- */

function EyeIcon({ width = 16, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon({ width = 16, height = 16 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.6 10.6 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.46 3.42M14.12 14.12a3 3 0 1 1-4.24-4.24"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon({ width = 13, height = 13 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.13a1.5 1.5 0 0 0 1.28-.72l.68-1.12A1.5 1.5 0 0 1 10.87 4.5h2.26a1.5 1.5 0 0 1 1.28.66l.68 1.12A1.5 1.5 0 0 0 16.37 7H18.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function AlertIcon({ width = 13, height = 13 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16v.01" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Phone validation — identical logic to Login.tsx / Signup.tsx so every   */
/* entry point normalizes the same way before hitting the backend.         */
/* ---------------------------------------------------------------------- */

interface PhoneValidationResult {
  valid: boolean;
  message: string;
  normalized: string; // local format, e.g. 0941184305
}

function validateEthioPhone(value: string): PhoneValidationResult {
  const cleaned = value.replace(/[\s\-()]/g, "");

  if (!cleaned) {
    return { valid: false, message: "Phone number is required", normalized: "" };
  }

  let digits = cleaned;

  if (digits.startsWith("+251")) {
    digits = "0" + digits.slice(4);
  } else if (digits.startsWith("251") && digits.length === 12) {
    digits = "0" + digits.slice(3);
  }

  if (!/^\d+$/.test(digits)) {
    return { valid: false, message: "Phone number can only contain digits", normalized: "" };
  }

  if (digits.length !== 10) {
    return {
      valid: false,
      message: "Enter a 10-digit number, e.g. 09XXXXXXXX or 07XXXXXXXX",
      normalized: "",
    };
  }

  if (digits[0] !== "0") {
    return { valid: false, message: "Phone number must start with 0", normalized: "" };
  }

  const carrierDigit = digits[1];
  if (carrierDigit !== "9" && carrierDigit !== "7") {
    return {
      valid: false,
      message: "Enter a valid Ethio Telecom (09) or Safaricom (07) number",
      normalized: "",
    };
  }

  return { valid: true, message: "", normalized: digits };
}

function toInternationalPhone(local: string): string {
  return "+251" + local.slice(1);
}

/* ---------------------------------------------------------------------- */
/* Reusable password field with its own independent show/hide toggle       */
/* ---------------------------------------------------------------------- */

function PasswordField({
  id, label, value, onChange, disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={styles.pwWrapper}>
        <input
          id={id}
          type={show ? "text" : "password"}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={id === "pw-current" ? "current-password" : "new-password"}
        />
        <button
          type="button"
          className={styles.pwToggle}
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Phone change: request (phone + password) -> OTP verify -> done          */
/* ---------------------------------------------------------------------- */

function PhoneChangeSection({
  setUser, onClose,
}: {
  setUser: (u: SessionUser) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<"form" | "otp">("form");

  const [newPhone, setNewPhone] = useState("");       // raw user input, local format
  const [pendingPhone, setPendingPhone] = useState(""); // normalized +251… actually sent to backend
  const [phoneFieldError, setPhoneFieldError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handlePhoneInput(value: string) {
    setNewPhone(value);
    if (phoneFieldError) setPhoneFieldError(null);
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setPhoneFieldError(null);

    const result = validateEthioPhone(newPhone);
    if (!result.valid) {
      setPhoneFieldError(result.message);
      return;
    }

    const internationalPhone = toInternationalPhone(result.normalized);

    setRequesting(true);
    try {
      const res = await requestPhoneChange({ new_phone: internationalPhone, password });
      setPendingPhone(internationalPhone);
      setOtpInfo(res.message || `We sent a code to ${internationalPhone}.`);
      setStage("otp");
    } catch (err: any) {
      const data = err?.response?.data;
      setFormError(
        data?.new_phone?.[0] ?? data?.password?.[0] ?? data?.detail ?? "Couldn't send verification code."
      );
    } finally {
      setRequesting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setOtpError(null);
    try {
      const updated = await confirmPhoneChange({ new_phone: pendingPhone, otp_code: otpCode });
      setUser(updated);
      setSuccess("Phone number updated successfully.");
      setTimeout(() => onClose(), 1400);
    } catch (err: any) {
      const data = err?.response?.data;
      setOtpError(data?.otp_code?.[0] ?? data?.detail ?? "Incorrect code. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  if (success) {
    return (
      <div className={styles.editForm}>
        <div className={styles.successBanner}>{success}</div>
      </div>
    );
  }

  const inOtpStage = stage === "otp";

  return (
    <form className={styles.editForm} onSubmit={inOtpStage ? handleVerify : handleRequest}>
      <fieldset
        className={inOtpStage ? styles.fieldsetLocked : undefined}
        disabled={inOtpStage || requesting}
        style={{ border: "none", padding: 0, margin: 0 }}
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-phone">New phone number</label>
          <input
            id="new-phone"
            className={styles.input}
            placeholder="09XXXXXXXX or 07XXXXXXXX"
            value={newPhone}
            onChange={(e) => handlePhoneInput(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!phoneFieldError}
          />
          {phoneFieldError && (
            <div className={styles.fieldError}>
              <AlertIcon />
              <span>{phoneFieldError}</span>
            </div>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="phone-pw">Your password</label>
          <div className={styles.pwWrapper}>
            <input
              id="phone-pw"
              type={showPassword ? "text" : "password"}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.pwToggle}
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
      </fieldset>

      {formError && (
        <div className={styles.fieldError}>
          <AlertIcon />
          <span>{formError}</span>
        </div>
      )}

      {inOtpStage && (
        <div className={styles.otpBlock}>
          {otpInfo && <div className={styles.fieldInfo}>{otpInfo}</div>}
          <div className={styles.otpRow}>
            <div className={styles.field} style={{ marginBottom: 0, flex: 1 }}>
              <label className={styles.label} htmlFor="otp">Verification code</label>
              <input
                id="otp"
                className={styles.input}
                inputMode="numeric"
                maxLength={5}
                placeholder="12345"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                disabled={verifying}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className={styles.verifyBtn}
              disabled={verifying || otpCode.length !== 5}
            >
              {verifying ? <span className={styles.spinner} aria-hidden="true" /> : "Verify"}
            </button>
          </div>
          {otpError && (
            <div className={styles.fieldError}>
              <AlertIcon />
              <span>{otpError}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.formActions}>
        {!inOtpStage ? (
          <>
            <button type="submit" className={styles.saveBtn} disabled={requesting || !newPhone || !password}>
              {requesting ? "Sending code..." : "Save changes"}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={requesting}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.saveBtn} ${styles.disabledLook}`}
              disabled
              aria-disabled="true"
            >
              Save changes
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => { setStage("form"); setOtpCode(""); setOtpError(null); }}
              disabled={verifying}
            >
              Back
            </button>
          </>
        )}
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------------- */
/* Main page                                                                */
/* ---------------------------------------------------------------------- */

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
        <div className={styles.avatarWrap}>
          <button
            className={styles.avatar}
            onClick={handlePhotoClick}
            disabled={uploadingPhoto}
            aria-label="Change profile photo"
          >
            {user.profile_photo_url ? <img src={user.profile_photo_url} alt="" /> : initials}
          </button>
          <span className={styles.avatarCameraBadge} aria-hidden="true">
            <CameraIcon />
          </span>
        </div>
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
      {photoError && <div className={styles.fieldError}><AlertIcon /><span>{photoError}</span></div>}

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
            {profileError && <div className={styles.fieldError}><AlertIcon /><span>{profileError}</span></div>}
            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save changes"}
              </button>
              <button type="button" className={styles.cancelBtn}
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
            <span className={styles.rowLabel}>{user.email || "Add an email"}</span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : (
          <form className={styles.editForm} onSubmit={handleSaveEmail}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="p-email">Email</label>
              <input id="p-email" type="email" className={styles.input} value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)} disabled={savingEmail} />
            </div>
            {emailError && <div className={styles.fieldError}><AlertIcon /><span>{emailError}</span></div>}
            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={savingEmail}>
                {savingEmail ? "Saving..." : "Save email"}
              </button>
              <button type="button" className={styles.cancelBtn}
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
            <PasswordField id="pw-current" label="Current password" value={currentPassword}
              onChange={setCurrentPassword} disabled={savingPassword} />
            <PasswordField id="pw-new" label="New password" value={newPassword}
              onChange={setNewPassword} disabled={savingPassword} />
            <PasswordField id="pw-confirm" label="Confirm new password" value={confirmPassword}
              onChange={setConfirmPassword} disabled={savingPassword} />
            {passwordError && <div className={styles.fieldError}><AlertIcon /><span>{passwordError}</span></div>}
            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={savingPassword}>
                {savingPassword ? "Saving..." : "Update password"}
              </button>
              <button type="button" className={styles.cancelBtn}
                onClick={() => setShowPasswordForm(false)} disabled={savingPassword}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {passwordSuccess && <div className={styles.successBanner}>{passwordSuccess}</div>}

        {!showPhoneForm ? (
          <button className={`${styles.row} ${styles.rowBtn}`} onClick={() => setShowPhoneForm(true)}>
            <span className={styles.rowLabel}>Change phone number</span>
            <ChevronRightIcon width={15} height={15} />
          </button>
        ) : (
          <PhoneChangeSection
            setUser={setUser}
            onClose={() => setShowPhoneForm(false)}
          />
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