import { useRef, useState } from "react";
import styles from "../pages/css/FormPage.module.css";
import { AlertIcon, ChevronDownIcon, UploadIcon, CheckIcon } from "../pages/Icons";

/* ---------------- shared wrapper ---------------- */

export function FieldWrap({
  label, htmlFor, hint, error, required, children,
}: {
  label?: string; htmlFor?: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label} {required && <span className={styles.reqStar}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <div className={styles.hint}>{hint}</div>}
      {error && (
        <div className={styles.fieldError}>
          <AlertIcon width={13} height={13} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- text / number / date / time ---------------- */

export function TextField(props: {
  id: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  type?: string; placeholder?: string; error?: string; disabled?: boolean;
  min?: string | number; max?: string | number; maxLength?: number;
}) {
  const { id, value, onChange, onBlur, type = "text", placeholder, error, disabled, min, max, maxLength } = props;
  return (
    <input
      id={id}
      className={styles.input}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      maxLength={maxLength}
      aria-invalid={!!error}
      style={error ? { borderColor: "var(--danger)" } : undefined}
    />
  );
}

export function TextAreaField(props: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string;
  error?: string; disabled?: boolean; maxLength?: number; rows?: number;
}) {
  const { id, value, onChange, placeholder, error, disabled, maxLength, rows = 3 } = props;
  return (
    <>
      <textarea
        id={id}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        style={error ? { borderColor: "var(--danger)" } : undefined}
      />
      {maxLength && (
        <div className={styles.charCount}>{value.length}/{maxLength}</div>
      )}
    </>
  );
}

export function SelectField(props: {
  id: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string; error?: string; disabled?: boolean;
}) {
  const { id, value, onChange, options, placeholder, error, disabled } = props;
  return (
    <div className={styles.selectWrap}>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={error ? { borderColor: "var(--danger)" } : undefined}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDownIcon className={styles.selectChevron} width={16} height={16} />
    </div>
  );
}

/* ---------------- chip group (single or multi select) ---------------- */

export function ChipGroup(props: {
  options: { value: string; label: string }[];
  value: string | string[];
  onChange: (v: any) => void;
  multi?: boolean;
  disabled?: boolean;
}) {
  const { options, value, onChange, multi, disabled } = props;
  const selected = multi ? (value as string[]) : [value as string];

  function toggle(v: string) {
    if (disabled) return;
    if (multi) {
      const arr = value as string[];
      onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    } else {
      onChange(v);
    }
  }

  return (
    <div className={styles.chipGroup}>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={`${styles.chip} ${active ? styles.chipActive : ""}`}
            onClick={() => toggle(o.value)}
            disabled={disabled}
            aria-pressed={active}
          >
            {active && <CheckIcon width={11} height={11} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- segmented control ---------------- */

export function SegmentedControl(props: {
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { options, value, onChange, disabled } = props;
  const idx = Math.max(options.findIndex((o) => o.value === value), 0);

  return (
    <div className={styles.segmented} style={{ ["--seg-count" as any]: options.length, ["--seg-idx" as any]: idx }}>
      <div className={styles.segmentedThumb} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.segmentBtn} ${o.value === value ? styles.segmentBtnActive : ""}`}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          <span>{o.label}</span>
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- checkbox ---------------- */

export function CheckboxRow(props: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; error?: string;
}) {
  const { id, checked, onChange, label, error } = props;
  return (
    <div>
      <label htmlFor={id} className={styles.checkboxRow}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={styles.checkboxInput}
        />
        <span className={styles.checkboxBox}>
          {checked && <CheckIcon width={12} height={12} />}
        </span>
        <span className={styles.checkboxLabel}>{label}</span>
      </label>
      {error && (
        <div className={styles.fieldError}>
          <AlertIcon width={13} height={13} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- logo / image upload ---------------- */

export function LogoUpload(props: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  error?: string;
}) {
  const { value, onChange, error } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 4 * 1024 * 1024) return; // 4MB cap
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div
        className={`${styles.uploadBox} ${dragOver ? styles.uploadBoxOver : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        style={error ? { borderColor: "var(--danger)" } : undefined}
      >
        {value ? (
          <img src={value} alt="Team logo preview" className={styles.uploadPreview} />
        ) : (
          <>
            <UploadIcon width={20} height={20} />
            <span>Drop a logo here or click to upload</span>
            <small>PNG or JPG, up to 4MB — optional</small>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value && (
        <button type="button" className={styles.uploadRemove} onClick={() => onChange(null)}>
          Remove logo
        </button>
      )}
    </div>
  );
}
