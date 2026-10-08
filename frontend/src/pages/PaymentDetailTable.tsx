import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./css/PaymentDetailTable.module.css";
import {
  getPitchPayments, ownerReviewPayment, ownerRejectVerifiedPayment,
  type OwnerPaymentFilter, type OwnerPaymentPage, type OwnerPaymentRow,
} from "../lib/payment";
import { SUPPORTED_BANKS } from "../lib/paymentAdmin";
import PaymentLogo from "../components/PaymentLogo";
import { showToast } from "./Toast";

interface Props {
  pitchId: string;
}

const FILTERS: { value: OwnerPaymentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

const REVIEW_REASON_TEXT: Record<string, string> = {
  receiver_name_missing_in_response: "The bank didn't return the receiver name",
  timestamp_missing_in_response: "The bank didn't return the payment time",
  amount_missing_in_response: "The bank didn't return the amount",
  provider_never_completed: "The bank check never finished",
  owner_account_missing: "The receiving account was removed",
  booking_already_paid_duplicate_payment: "Already paid by another verified payment",
  sender_name_mismatch: "Sender name differs from the player's name",
  sender_identity_missing_in_response: "The bank didn't return the sender name",
};

const KIND_LABEL = { solo: "Solo booking", team: "Team booking", booking: "Booking" } as const;

function bankLabel(value: string) {
  return SUPPORTED_BANKS.find((b) => b.value === value)?.label.replace(" (not supported for verification)", "") || value || "—";
}
function formatMoney(amount: string) {
  const n = Number(amount);
  return `${Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : amount} Br`;
}
function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.overlay} onMouseDown={() => !busy && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button className={styles.modalClose} onClick={onClose} disabled={busy} aria-label="Close"><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PaymentFacts({ row }: { row: OwnerPaymentRow }) {
  return (
    <dl className={styles.facts}>
      <div><dt>Player</dt><dd>{row.payer_first_name} {row.payer_last_name} · {row.payer_phone}</dd></div>
      <div><dt>Amount</dt><dd>{formatMoney(row.amount)}</dd></div>
      <div><dt>Paid</dt><dd>{bankLabel(row.sender_bank)} → {bankLabel(row.pay_to_bank)}</dd></div>
      <div><dt>Reference</dt><dd className={styles.mono}>{row.reference_number}</dd></div>
    </dl>
  );
}

export default function PaymentDetailTable({ pitchId }: Props) {
  const [filter, setFilter] = useState<OwnerPaymentFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OwnerPaymentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // exactly one popup at a time, each bound to ONE row
  const [confirm, setConfirm] = useState<{ row: OwnerPaymentRow; action: "approve" | "reject" } | null>(null);
  const [reverseRow, setReverseRow] = useState<OwnerPaymentRow | null>(null);
  const [duplicateRef, setDuplicateRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const result = await getPitchPayments(pitchId, { status: filter, page });
      if (requestId !== latestRequest.current) return; // a newer request replaced this one
      setData(result);
      setLoadError("");
    } catch {
      if (requestId === latestRequest.current) setLoadError("Couldn't load payments. Please try again.");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [pitchId, filter, page]);

  useEffect(() => { load(); }, [load]);

  function changeFilter(next: OwnerPaymentFilter) {
    setFilter(next);
    setPage(1);
  }

  function closeReverse() {
    setReverseRow(null);
    setPassword("");
    setShowPassword(false);
    setPasswordError("");
  }

  async function runReview() {
    if (!confirm) return;
    const { row, action } = confirm;
    setBusy(true);
    try {
      await ownerReviewPayment(row.id, action);
      showToast(action === "approve" ? "Payment verified." : "Payment rejected.", "update");
      setConfirm(null);
      await load();
    } catch (err: any) {
      const body = err?.response?.data;
      if (err?.response?.status === 409 && body?.code === "reference_already_verified") {
        setConfirm(null);
        setDuplicateRef(body.reference_number || row.reference_number);
      } else {
        showToast(body?.detail || "Couldn't update this payment.", "delete");
      }
    } finally {
      setBusy(false);
    }
  }

  async function runReverse() {
    if (!reverseRow) return;
    if (!password) {
      setPasswordError("Enter your password.");
      return;
    }
    setBusy(true);
    setPasswordError("");
    try {
      await ownerRejectVerifiedPayment(reverseRow.id, password);
      showToast("Payment rejected.", "update");
      closeReverse();
      await load();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403 && err?.response?.data?.code === "invalid_password") setPasswordError("Incorrect password.");
      else if (status === 429) setPasswordError("Too many attempts. Please wait a minute and try again.");
      else setPasswordError(err?.response?.data?.detail || "Couldn't reject this payment.");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / data.page_size), 1) : 1;
  const rows = data?.results ?? [];

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Payment Detail</h2>
      <p className={styles.subheading}>Every payment made for this pitch. Payments that need your decision are listed first.</p>

      <div className={styles.filterBar} role="tablist">
        {FILTERS.map((f) => {
          const count =
            !data ? null
            : f.value === "all" ? data.counts.verified + data.counts.needs_review + data.counts.rejected
            : data.counts[f.value];
          return (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              className={`${styles.filterChip} ${filter === f.value ? styles.filterChipActive : ""}`}
              onClick={() => changeFilter(f.value)}
            >
              {f.label}
              {count !== null && (
                <span className={`${styles.chipCount} ${f.value === "needs_review" && count > 0 ? styles.chipCountAlert : ""}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>First name</th>
              <th>Last name</th>
              <th>Phone</th>
              <th>Amount</th>
              <th>Paid from → to</th>
              <th>Reference</th>
              <th>Paid on</th>
              <th>Type</th>
              <th>Status</th>
              <th className={styles.actionsHead}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && Array.from({ length: 4 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {Array.from({ length: 10 }).map((__, j) => (
                  <td key={j}><span className={`${styles.skeleton} ${styles.shimmer}`} /></td>
                ))}
              </tr>
            ))}

            {!loading && loadError && (
              <tr><td colSpan={10} className={styles.emptyCell}>{loadError}</td></tr>
            )}

            {!loadError && data && rows.length === 0 && (
              <tr><td colSpan={10} className={styles.emptyCell}>No payments here yet.</td></tr>
            )}

            {!loadError && rows.map((row) => (
              <tr key={row.id} className={row.status === "needs_review" ? styles.rowReview : undefined}>
                <td className={styles.strong}>{row.payer_first_name}</td>
                <td className={styles.strong}>{row.payer_last_name}</td>
                <td>{row.payer_phone}</td>
                <td className={styles.mono}>{formatMoney(row.amount)}</td>
                <td>
                  <span className={styles.bankFlow}>
                    <PaymentLogo name={row.sender_bank} label={bankLabel(row.sender_bank)} size={22} />
                    <ArrowIcon />
                    <PaymentLogo name={row.pay_to_bank} label={bankLabel(row.pay_to_bank)} size={22} />
                  </span>
                  {row.sender_bank !== row.pay_to_bank && <span className={styles.crossTag}>cross-bank</span>}
                </td>
                <td className={styles.mono}>{row.reference_number}</td>
                <td>{formatDateTime(row.paid_at || row.submitted_at)}</td>
                <td>
                  {KIND_LABEL[row.kind]}
                  {row.team_name && <span className={styles.subtle}>{row.team_name}</span>}
                </td>
                <td>
                  <span className={`${styles.badge} ${row.status === "verified" ? styles.badgeVerified : row.status === "needs_review" ? styles.badgeReview : styles.badgeRejected}`}>
                    {row.status === "verified" ? "Verified" : row.status === "needs_review" ? "Needs review" : "Rejected"}
                  </span>
                  {row.status === "needs_review" && row.review_reason && (
                    <span className={styles.subtle}>{REVIEW_REASON_TEXT[row.review_reason] || "Needs a manual check"}</span>
                  )}
                </td>
                <td className={styles.actionsCell}>
                  {row.status === "needs_review" && (
                    <>
                      <button className={`${styles.btn} ${styles.btnVerify}`} disabled={busy} onClick={() => setConfirm({ row, action: "approve" })}>Verify</button>
                      <button className={`${styles.btn} ${styles.btnReject}`} disabled={busy} onClick={() => setConfirm({ row, action: "reject" })}>Reject</button>
                    </>
                  )}
                  {row.status === "verified" && (
                    <button className={`${styles.btn} ${styles.btnReject}`} disabled={busy} onClick={() => setReverseRow(row)}>Reject</button>
                  )}
                  {row.status === "rejected" && <span className={styles.subtle}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {/* verify / reject a payment that is waiting for review */}
      {confirm && (
        <Modal
          title={confirm.action === "approve" ? "Verify this payment?" : "Reject this payment?"}
          onClose={() => setConfirm(null)}
          busy={busy}
        >
          <PaymentFacts row={confirm.row} />
          <p className={styles.modalText}>
            {confirm.action === "approve"
              ? "The player's booking will be confirmed and they will be told the payment is complete."
              : "The payment will be rejected and the player will have to pay again."}
          </p>
          <div className={styles.modalActions}>
            <button className={styles.btnGhost} onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
            <button
              className={`${styles.btnWide} ${confirm.action === "approve" ? styles.btnVerify : styles.btnReject}`}
              onClick={runReview}
              disabled={busy}
            >
              {busy ? "Please wait…" : confirm.action === "approve" ? "Yes, verify" : "Yes, reject"}
            </button>
          </div>
        </Modal>
      )}

      {/* the same transaction id is already saved as verified */}
      {duplicateRef && (
        <Modal title="Transaction already verified" onClose={() => setDuplicateRef(null)}>
          <p className={styles.modalText}>This transaction ID was found with <b>verified</b> status:</p>
          <div className={styles.refBox}>{duplicateRef}</div>
          <p className={styles.modalText}>The same payment can't be approved twice, so this one can't be verified.</p>
          <div className={styles.modalActions}>
            <button className={`${styles.btnWide} ${styles.btnNeutral}`} onClick={() => setDuplicateRef(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* rejecting a VERIFIED payment needs the owner's password */}
      {reverseRow && (
        <Modal title="Reject a verified payment" onClose={closeReverse} busy={busy}>
          <PaymentFacts row={reverseRow} />
          <p className={styles.modalText}>
            This payment is already verified. Enter your account password to confirm that you are the pitch owner.
          </p>
          <label className={styles.passwordLabel} htmlFor="owner-password">Password</label>
          <div className={styles.passwordWrap}>
            <input
              id="owner-password"
              className={`${styles.passwordInput} ${passwordError ? styles.passwordInputError : ""}`}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") runReverse(); }}
              placeholder="Your password"
              autoFocus
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
          {passwordError && <div className={styles.passwordError}>{passwordError}</div>}
          <div className={styles.modalActions}>
            <button className={styles.btnGhost} onClick={closeReverse} disabled={busy}>Cancel</button>
            <button className={`${styles.btnWide} ${styles.btnReject}`} onClick={runReverse} disabled={busy}>
              {busy ? "Checking…" : "Reject payment"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
