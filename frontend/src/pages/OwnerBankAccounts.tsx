import { useEffect, useMemo, useState } from "react";
import styles from "../pages/css/OwnerBankAccounts.module.css";
import { SUPPORTED_BANKS, type OwnerBankAccount, type SupportedBank } from "../lib/paymentAdmin";
import {
  addMyBankAccount,
  deleteMyBankAccount,
  getMyBankAccounts,
  setMyBankAccountActive,
  updateMyBankAccount,
} from "../lib/ownerBankAccounts";
import { showToast } from "../pages/Toast";
import PaymentLogo from "../components/PaymentLogo";

// Same set as backend WALLET_BANKS: these identify the account by phone.
const WALLET_BANKS: SupportedBank[] = ["telebirr", "mpesa", "cbebirr"];
const SELECTABLE_BANKS = SUPPORTED_BANKS.filter((b) => b.value !== "zemen");

const bankLabel = (bank: string) => SUPPORTED_BANKS.find((b) => b.value === bank)?.label || bank;
const identifierOf = (a: OwnerBankAccount) => a.phone_number || a.account_number;

// DRF returns {"detail": ["message"]} for ValidationError — handle both shapes.
function errMsg(err: any, fallback: string): string {
  const d = err?.response?.data?.detail;
  if (Array.isArray(d)) return d[0] || fallback;
  return typeof d === "string" && d ? d : fallback;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg className={styles.spinner} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" />
    </svg>
  );
}

/* ───────────────── Add / Edit popup (one form for both) ───────────────── */

function AccountModal({
  account, defaultBank, onClose, onSaved,
}: {
  account: OwnerBankAccount | null;   // null = adding a new account
  defaultBank: SupportedBank;
  onClose: () => void;
  onSaved: (a: OwnerBankAccount, isNew: boolean) => void;
}) {
  const isNew = account === null;
  const [bank, setBank] = useState<SupportedBank>(account?.bank ?? defaultBank);
  const [holder, setHolder] = useState(account?.account_holder_name ?? "");
  const [value, setValue] = useState(account ? identifierOf(account) : "");
  const [saving, setSaving] = useState(false);

  const isWallet = WALLET_BANKS.includes(bank);

  const changed =
    isNew ||
    bank !== account!.bank ||
    holder.trim() !== account!.account_holder_name ||
    value.trim() !== identifierOf(account!);

  function onBankChange(next: SupportedBank) {
    const nextWallet = WALLET_BANKS.includes(next);
    // phone <-> account number are different things: don't carry one into the other
    if (nextWallet !== isWallet) {
      if (account && nextWallet === WALLET_BANKS.includes(account.bank)) setValue(identifierOf(account));
      else setValue("");
    }
    setBank(next);
  }

  async function save() {
    if (holder.trim().split(/\s+/).length < 2) {
      showToast("Enter the full account holder name (at least two words).", "delete");
      return;
    }
    if (!value.trim()) {
      showToast(isWallet ? "Enter the phone number." : "Enter the account number.", "delete");
      return;
    }
    const payload = {
      bank,
      account_holder_name: holder.trim(),
      account_number: isWallet ? "" : value.trim(),
      phone_number: isWallet ? value.trim() : "",
    };
    setSaving(true);
    try {
      const saved = isNew
        ? await addMyBankAccount(payload)
        : await updateMyBankAccount(account!.id, payload);
      onSaved(saved, isNew);
      showToast(isNew ? "Account added." : "Account updated.", isNew ? "create" : "update");
      onClose();
    } catch (err) {
      showToast(errMsg(err, isNew ? "Couldn't add this account." : "Couldn't save changes."), "delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose} aria-label="Close"><CloseIcon /></button>

        <div className={styles.modalLogo}>
          <PaymentLogo key={bank} name={bank} label={bankLabel(bank)} size={76} />
        </div>
        <div className={styles.modalTitle}>{isNew ? "Add account" : "Edit account"}</div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Bank / Wallet</span>
          <div className={styles.selectWrap}>
            <select className={styles.select} value={bank} onChange={(e) => onBankChange(e.target.value as SupportedBank)}>
              {SELECTABLE_BANKS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <svg className={styles.selectChevron} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Account holder name</span>
          <input className={styles.input} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Full name exactly as the bank shows it" />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{isWallet ? "Phone number" : "Account number"}</span>
          <input
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={isWallet ? "tel" : "numeric"}
            placeholder={isWallet ? `${bankLabel(bank)} phone number` : `${bankLabel(bank)} account number`}
          />
        </label>

        <button className={styles.saveBtn} onClick={save} disabled={saving || !changed}>
          {saving ? <Spinner /> : isNew ? "Add account" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* ───────────────── Confirm popup (turn off / delete) ───────────────── */

function ConfirmModal({
  account, title, text, confirmLabel, busy, onCancel, onConfirm,
}: {
  account: OwnerBankAccount;
  title: string;
  text: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.overlay} onMouseDown={onCancel}>
      <div className={`${styles.modal} ${styles.confirmModal}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalLogo}>
          <PaymentLogo name={account.bank} label={bankLabel(account.bank)} size={56} />
        </div>
        <div className={styles.modalTitle}>{title}</div>
        <p className={styles.confirmText}>{text}</p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelBtn} onClick={onCancel} disabled={busy}>No</button>
          <button className={styles.dangerBtn} onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Main section ───────────────────────── */

export default function OwnerBankAccounts({ isApproved }: { isApproved: boolean }) {
  const [accounts, setAccounts] = useState<OwnerBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<OwnerBankAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmOff, setConfirmOff] = useState<OwnerBankAccount | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OwnerBankAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMyBankAccounts();
        if (!cancelled) setAccounts(data);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeCount = useMemo(() => accounts.filter((a) => a.is_active).length, [accounts]);

  // pre-select a bank the owner does not have yet
  const defaultBank = useMemo<SupportedBank>(() => {
    const taken = new Set(accounts.filter((a) => a.is_active).map((a) => a.bank));
    return (SELECTABLE_BANKS.find((b) => !taken.has(b.value))?.value ?? "cbe") as SupportedBank;
  }, [accounts]);

  function replace(updated: OwnerBankAccount) {
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  function onSaved(saved: OwnerBankAccount, isNew: boolean) {
    if (isNew) setAccounts((prev) => [...prev, saved]);
    else replace(saved);
  }

  async function setActive(account: OwnerBankAccount, next: boolean) {
    setBusyId(account.id);
    try {
      replace(await setMyBankAccountActive(account.id, next));
      showToast(next ? "Account turned on." : "Account turned off.", next ? "create" : "delete");
    } catch (err) {
      showToast(errMsg(err, "Couldn't update this account."), "delete");
    } finally {
      setBusyId(null);
      setConfirmOff(null);
    }
  }

  async function doDelete(account: OwnerBankAccount) {
    setBusyId(account.id);
    try {
      await deleteMyBankAccount(account.id);
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      showToast("Account deleted.", "delete");
    } catch (err) {
      showToast(errMsg(err, "Couldn't delete this account."), "delete");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  function onToggle(account: OwnerBankAccount) {
    if (busyId) return;
    if (account.is_active) setConfirmOff(account); // turning OFF needs confirmation
    else setActive(account, true);
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>Payment accounts</div>
          <div className={styles.subtitle}>Banks &amp; wallets players can pay into</div>
        </div>

        <div className={styles.addWrap} data-tip={isApproved ? "" : "Not approved by admin"}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setAdding(true)}
            disabled={!isApproved}
          >
            <PlusIcon /> Add account
          </button>
        </div>

        <div className={styles.headerRight}>
          {!loading && accounts.length > 0 && (
            <span className={styles.countPill}>{activeCount} of {accounts.length} active</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => <div key={i} className={`${styles.card} ${styles.skeleton}`} />)}
        </div>
      ) : failed ? (
        <div className={styles.empty}>Couldn't load your payment accounts.</div>
      ) : accounts.length === 0 ? (
        <div className={styles.empty}>
          {isApproved
            ? "No payment accounts yet. Click “Add account” to create your first one."
            : "Your account must be approved by the admin before you can add a bank or wallet."}
        </div>
      ) : (
        <div className={styles.grid}>
          {accounts.map((a, i) => (
            <div
              key={a.id}
              className={`${styles.card} ${a.is_active ? "" : styles.cardOff}`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <button className={styles.editBtn} onClick={() => setEditing(a)} title="Edit account" aria-label="Edit account">
                <PencilIcon />
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={a.is_active}
                aria-label={a.is_active ? "Turn off account" : "Turn on account"}
                className={`${styles.toggle} ${a.is_active ? styles.toggleOn : ""}`}
                onClick={() => onToggle(a)}
                disabled={busyId === a.id}
              >
                <span className={styles.toggleKnob} />
              </button>

              <div className={styles.logoWrap}>
                <PaymentLogo name={a.bank} label={bankLabel(a.bank)} size={60} />
              </div>
              <div className={styles.bankName}>{bankLabel(a.bank)}</div>
              <div className={styles.holder} title={a.account_holder_name}>{a.account_holder_name}</div>
              <div className={styles.number}>{identifierOf(a)}</div>

              <span className={`${styles.badge} ${a.is_active ? styles.badgeOn : styles.badgeOff}`}>
                {a.is_active ? "Active" : "Off"}
              </span>

              <button
                className={styles.deleteBtn}
                onClick={() => setConfirmDelete(a)}
                title="Delete account"
                aria-label="Delete account"
                disabled={busyId === a.id}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AccountModal account={null} defaultBank={defaultBank} onClose={() => setAdding(false)} onSaved={onSaved} />
      )}
      {editing && (
        <AccountModal account={editing} defaultBank={defaultBank} onClose={() => setEditing(null)} onSaved={onSaved} />
      )}
      {confirmOff && (
        <ConfirmModal
          account={confirmOff}
          title="Are you sure?"
          text={
            <>
              <b>{bankLabel(confirmOff.bank)}</b> ({identifierOf(confirmOff)}) will be turned off. Players will
              no longer see it and can't pay into it. You can turn it back on at any time.
            </>
          }
          confirmLabel="Yes, turn off"
          busy={busyId === confirmOff.id}
          onCancel={() => setConfirmOff(null)}
          onConfirm={() => setActive(confirmOff, false)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          account={confirmDelete}
          title="Delete this account?"
          text={
            <>
              <b>{bankLabel(confirmDelete.bank)}</b> ({identifierOf(confirmDelete)}) will be deleted
              permanently. This can't be undone. To keep it, just turn it off instead.
            </>
          }
          confirmLabel="Yes, delete"
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete)}
        />
      )}
    </section>
  );
}