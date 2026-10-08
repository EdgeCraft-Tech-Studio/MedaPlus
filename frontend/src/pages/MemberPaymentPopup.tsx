import { useEffect, useRef, useState } from "react";
import styles from "./css/MemberPaymentPopup.module.css";
import {
  getTeamBookingPaymentInfo, extractReceiptData, submitTeamBookingPayment, pollPaymentTransaction,
  getSoloBookingPaymentInfo, submitSoloBookingPayment,
  type PaymentInfo, type OwnerBankAccount,
} from "../lib/payment";
import { SUPPORTED_BANKS } from "../lib/paymentAdmin";
import PaymentLogo from "../components/PaymentLogo";

interface PendingPaymentLike {
  id: string;
  request_id?: string;
  pitch_name: string;
  team_name?: string;
  amount: string;
  payment_expires_at: string;
}

interface Props {
  payment: PendingPaymentLike;
  kind?: "team" | "solo";
  onClose?: () => void;
  onPaid?: () => void;
  readOnly?: boolean;
  readOnlyStatusLabel?: string;
}

const REFERENCE_LABELS: Record<string, { label: string; placeholder: string }> = {
  cbe: { label: "CBE Transaction ID", placeholder: "e.g. FT26267712345" },
  boa: { label: "Transaction Reference", placeholder: "Reference number" },
  telebirr: { label: "Telebirr Transaction Number", placeholder: "e.g. ABCT1234567" },
  cbebirr: { label: "Transaction Number", placeholder: "Transaction number" },
  mpesa: { label: "Transaction Number", placeholder: "Transaction number" },
  dashen: { label: "Transaction Reference", placeholder: "Reference number" },
  awash: { label: "Transaction Reference", placeholder: "Reference number" },
  siinqee: { label: "Transaction Reference", placeholder: "Reference number" },
  kaafiebirr: { label: "Transaction Reference", placeholder: "Reference number" },
};
const DEFAULT_REF = { label: "Transaction Reference", placeholder: "Reference number" };

// Banks / wallets a payer can pay FROM (any of them can send to any owner account).
const SENDER_BANKS = SUPPORTED_BANKS.filter((b) => b.value !== "zemen");
const SENDER_VALUES: string[] = SENDER_BANKS.map((b) => b.value);

// Banks whose lookup needs account digits. The server fills them in from the pitch
// owner's account; this is only used for the "second chance" field after a failure.
const SUFFIX_LENGTH: Record<string, number> = { cbe: 8, boa: 5 };

const REJECTION_MESSAGES: Record<string, string> = {
  bank_unavailable: "The bank isn't responding right now. This is a temporary problem on the bank's side. Please wait a minute and tap Try Again.",
  receiver_name_mismatch: "This payment wasn't sent to the pitch owner's account. Check the account name and pay again.",
  transaction_too_old: "This payment was made too long before this booking's payment started, so it can't be used. Please make a new payment for this booking or contact pitch owner.",
  sender_identity_mismatch: "The account number on this payment doesn't match yours. Make sure you're uploading your OWN payment, not someone else's.",
  no_result_from_provider: "We couldn't find a matching transaction. Check the reference and that \"I paid from\" is the bank you really used, then try again.",
  not_verified: "This transaction couldn't be verified. Check the reference and that \"I paid from\" is the bank you really used, then try again.",
  currency_mismatch: "This transaction wasn't in ETB.",
  receiver_mismatch: "This payment wasn't sent to the correct account. Double-check and try again.",
  amount_mismatch: "The amount paid doesn't match what's owed.",
  amount_unreadable: "We couldn't read the paid amount from this transaction.",
  transaction_date_mismatch: "This payment doesn't match the date of this booking.",
  timestamp_in_future: "This transaction's date looks incorrect.",
  duplicate_transaction: "This transaction reference has already been used.",
  provider_unreachable: "We couldn't reach the verification service. Please try again in a moment.",
};
function friendlyRejection(reason: string): string {
  if (REJECTION_MESSAGES[reason]) return REJECTION_MESSAGES[reason];
  if (reason.startsWith("provider_error_")) {
    console.log(reason);
    return "Check your bank selection Try again please!";}
  return "This payment couldn't be verified. Please try again or contact support.";
}

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    function tick() { setRemaining(Math.max(0, new Date(targetIso).getTime() - Date.now())); }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  const s = Math.floor(remaining / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>;
}
function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.3l2.3 2.3 4.7-5" /></svg>;
}
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 100" /></svg>;
}
function NoGestureIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 21v-7.3a1.9 1.9 0 1 1 3.8 0V13" />
      <path d="M8 13V7.2a1.5 1.5 0 1 1 3 0V11" />
      <path d="M11 11V5.7a1.5 1.5 0 1 1 3 0V11" />
      <path d="M14 11V6.9a1.5 1.5 0 1 1 3 0V13a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.3-3a1.25 1.25 0 0 1 1.9-1.6L8 14" />
    </svg>
  );
}

type Step = "loading" | "no_config" | "gateway_unavailable" | "form" | "submitting" | "polling" | "rejected" | "needs_review" | "timeout";

export default function MemberPaymentPopup({ payment, kind = "team", onClose, onPaid, readOnly = false, readOnlyStatusLabel }: Props) {
  const countdown = useCountdown(payment.payment_expires_at);
  const [step, setStep] = useState<Step>(readOnly ? "form" : "loading");
  const [info, setInfo] = useState<PaymentInfo | null>(null);

  // selectedAccount = the pitch owner's account being paid INTO
  const [selectedAccount, setSelectedAccount] = useState<OwnerBankAccount | null>(null);
  // senderBank = the bank / wallet the payer paid FROM (may differ from selectedAccount.bank)
  const [senderBank, setSenderBank] = useState<string>("");
  const [senderAutoDetected, setSenderAutoDetected] = useState(false);

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [refAutoFilled, setRefAutoFilled] = useState(false);
  const [refNeedsManual, setRefNeedsManual] = useState(false);
  const [suffixFallback, setSuffixFallback] = useState(false);
  const [accountSuffix, setAccountSuffix] = useState("");
  const [suffixInvalid, setSuffixInvalid] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const suffixLength = SUFFIX_LENGTH[senderBank];
  // Normally the server adds the account digits itself. The field only appears as a
  // second chance, after the automatic attempt failed for CBE / BOA.
  const showSuffixField = suffixFallback && !!suffixLength;
  const senderNeedsPhone = senderBank === "cbebirr";

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    const fetchInfo = kind === "solo" ? getSoloBookingPaymentInfo(payment.id) : getTeamBookingPaymentInfo(payment.id);
    fetchInfo
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        if (data.payment_mode === "not_configured") setStep("no_config");
        else if (data.payment_mode === "gateway") setStep("gateway_unavailable");
        else {
          setStep("form");
          if (data.bank_accounts.length === 1) {
            setSelectedAccount(data.bank_accounts[0]);
            setSenderBank(data.bank_accounts[0].bank);
          }
        }
      })
      .catch(() => !cancelled && setError("Couldn't load payment options. Please try again."));
    return () => { cancelled = true; };
  }, [payment.id, readOnly, kind]);

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  function chooseSenderBank(bank: string) {
    setSenderBank(bank);
    setSenderAutoDetected(false);
    setSuffixFallback(false);
    setAccountSuffix("");
    setSuffixInvalid(false);
  }

  function chooseOwnerAccount(acc: OwnerBankAccount) {
    setSelectedAccount(acc);
    // Until the receipt or the payer says otherwise, assume a same-bank payment.
    if (!senderAutoDetected) setSenderBank(acc.bank);
  }

  async function handleFileSelected(file: File) {
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setError("");
    setScanning(true);
    setRefAutoFilled(false);
    setRefNeedsManual(false);
    try {
      // No bank hint on purpose: the scan tells us which bank's receipt this really is.
      const result = await extractReceiptData(file);
      if (result.suggested_reference_number) {
        setReferenceNumber(result.suggested_reference_number);
        setRefAutoFilled(true);
      } else {
        setRefNeedsManual(true);
      }
      if (result.suggested_bank && SENDER_VALUES.includes(result.suggested_bank)) {
        setSenderBank(result.suggested_bank);
        setSenderAutoDetected(true);
        setSuffixFallback(false);
      }
      if (!selectedAccount && result.suggested_bank && info) {
        const match = info.bank_accounts.find((a) => a.bank === result.suggested_bank);
        if (match) setSelectedAccount(match);
      }
    } catch (err: any) {
      setRefNeedsManual(true);
      if (err?.response?.status === 429) {
        setError("You've tried this too many times — please wait a minute before uploading again.");
      } else {
        setError("We couldn't scan this image automatically. Please type the transaction number below.");
      }
    } finally {
      setScanning(false);
    }
  }

  // A CBE / BOA check that couldn't confirm the payment with the automatic digits gets
  // a second chance: reveal the field so the payer can type their own account digits.
  function handleRejected(reason: string) {
  console.error("❌ PAYMENT REJECTED");
  console.error("Rejection reason:", reason);
  console.error("Sender bank:", senderBank);
  console.error("Pay-to bank:", selectedAccount?.bank);
  console.error("Reference:", referenceNumber);

  setRejectionReason(reason);

  if (
    suffixLength &&
    !suffixFallback &&
    (reason === "not_verified" || reason === "no_result_from_provider")
  ) {
    setSuffixFallback(true);
  }

  setStep("rejected");
}

  function startPolling(transactionId: string) {
    setStep("polling");
    let attempts = 0;
    pollTimer.current = setInterval(async () => {
      attempts += 1;
      try {
        const txn = await pollPaymentTransaction(transactionId);
        if (txn.status === "verified") { clearInterval(pollTimer.current!); onPaid?.(); onClose?.(); }
        else if (txn.status === "rejected") { clearInterval(pollTimer.current!); handleRejected(txn.rejection_reason); }
        else if (txn.status === "needs_review") { clearInterval(pollTimer.current!); setStep("needs_review"); }
        else if (attempts > 40) { clearInterval(pollTimer.current!); setStep("timeout"); }
      } catch { /* transient — keep polling */ }
    }, 3000);
  }

  async function handleSubmit() {
    if (!selectedAccount || !senderBank || !screenshotFile || !referenceNumber.trim()) {
      setError("Select where you paid to, the bank you paid from, upload the screenshot, and confirm the transaction number.");
      return;
    }
    if (showSuffixField && accountSuffix.length !== suffixLength) {
      setSuffixInvalid(true);
      setError(`Enter exactly ${suffixLength} digits.`);
      return;
    }
    setSuffixInvalid(false);
    if (senderNeedsPhone && !phoneNumber.trim()) {
      setError("Enter the phone number you paid from.");
      return;
    }

    setError("");
    setStep("submitting");
    try {
      const submitFn = kind === "solo" ? submitSoloBookingPayment : submitTeamBookingPayment;
      const txn = await submitFn(payment.id, {
        bank: senderBank,                    // paid FROM
        pay_to_bank: selectedAccount.bank,   // paid INTO
        screenshot: screenshotFile,
        reference_number: referenceNumber.trim(),
        account_suffix: showSuffixField ? accountSuffix : "",
        phone_number: senderNeedsPhone ? phoneNumber : "",
      });
      if (txn.status === "verified") { onPaid?.(); onClose?.(); }
      else if (txn.status === "rejected") handleRejected(txn.rejection_reason);
      else if (txn.status === "needs_review") setStep("needs_review");
      else startPolling(txn.id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Couldn't submit this payment. Please try again.");
      setStep("form");
    }
  }

  function retry() { setStep("form"); setError(""); }

  const refMeta = REFERENCE_LABELS[senderBank] || DEFAULT_REF;
  const senderLabel = SENDER_BANKS.find((b) => b.value === senderBank)?.label || senderBank;

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="alertdialog" aria-modal="true">
        {!readOnly && <div className={styles.countdown}>{countdown}</div>}
        {onClose && readOnly && (
          <button className={styles.readOnlyClose} onClick={onClose} aria-label="Close"><CloseIcon /></button>
        )}

        {error && (
          <div className={styles.topErrorBanner}>
            <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
            <span className={styles.topErrorText}>{error}</span>
            <button className={styles.topErrorClose} onClick={() => setError("")} aria-label="Dismiss">
              <CloseIcon />
            </button>
          </div>
        )}

        <div className={styles.titleRow}>
          <div className={styles.title}>Pay for {payment.pitch_name}</div>
        </div>
        <div className={styles.subtitle}>
          {payment.team_name || "Individual booking"} — {kind === "solo" ? "total" : "your share"}: <b className={styles.amountHighlight}>{payment.amount} Br</b>
        </div>

        {readOnly ? (
          <div className={styles.readOnlyBanner}>{readOnlyStatusLabel || "This payment window has closed."}</div>
        ) : (
          <>
            {step === "loading" && <div className={styles.loadingWrap}><SpinnerIcon className={styles.spinnerLarge} /></div>}

            {step === "no_config" && (
              <div className={styles.infoBox}>
                This pitch owner hasn't set up a way to receive payments yet. Please contact them directly.
              </div>
            )}

            {step === "gateway_unavailable" && (
              <div className={styles.infoBox}>
                Online checkout for this pitch isn't available yet. Please contact the pitch owner to arrange payment.
              </div>
            )}

            {step === "form" && info && (
              <div className={styles.form}>
                {/* 1 — which of the owner's accounts you paid INTO */}
                {info.bank_accounts.length > 1 && (
                  <>
                    <span className={styles.fieldLabel}>Pay to</span>
                    <div className={styles.accountPicker}>
                      {info.bank_accounts.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          className={`${styles.accountOption} ${selectedAccount?.id === acc.id ? styles.accountOptionActive : ""}`}
                          onClick={() => chooseOwnerAccount(acc)}
                        >
                          <PaymentLogo name={acc.bank} label={acc.requirements.label} size={30} />
                          <span>{acc.requirements.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {selectedAccount && (
                  <div className={styles.accountCard}>
                    <PaymentLogo name={selectedAccount.bank} label={selectedAccount.requirements.label} size={44} />
                    <div>
                      <div className={styles.accountCardBank}>{selectedAccount.requirements.label}</div>
                      <div className={styles.accountCardName}>{selectedAccount.account_holder_name}</div>
                      <div className={styles.accountCardNumber}>{selectedAccount.phone_number || selectedAccount.account_number}</div>
                    </div>
                  </div>
                )}

                {/* 2 — which bank / wallet you paid FROM (any bank can send to any account) */}
                {selectedAccount && (
                  <>
                    <span className={styles.fieldLabel}>
                      I paid from
                      {senderAutoDetected && !scanning && (
                        <span className={styles.ocrTag}><CheckCircleIcon className={styles.ocrTagIcon} /> Auto-detected</span>
                      )}
                    </span>
                    <div className={styles.accountPicker}>
                      {SENDER_BANKS.map((b) => (
                        <button
                          key={b.value}
                          type="button"
                          className={`${styles.accountOption} ${senderBank === b.value ? styles.accountOptionActive : ""}`}
                          onClick={() => chooseSenderBank(b.value)}
                          title={b.label}
                        >
                          <PaymentLogo name={b.value} label={b.label} size={30} />
                          <span>{b.label}</span>
                        </button>
                      ))}
                    </div>
                    {senderBank && senderBank !== selectedAccount.bank && (
                      <span className={styles.manualHint}>
                        Paying {selectedAccount.requirements.label} from {senderLabel} is fine — we handle bank-to-bank transfers.
                      </span>
                    )}
                  </>
                )}

                {selectedAccount && senderBank && (
                  <>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Upload payment screenshot</span>
                      <label className={styles.uploadBox}>
                        {screenshotPreview ? (
                          <div className={styles.previewWrap}>
                            <img src={screenshotPreview} alt="Receipt preview" className={styles.uploadPreview} />
                            {scanning && (
                              <div className={styles.scanOverlay}>
                                <div className={styles.scanLine} />
                                <span>Scanning receipt…</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <UploadIcon className={styles.uploadIcon} />
                            <span>Tap to upload — we'll read it for you</span>
                          </>
                        )}
                        <input
                          type="file" accept="image/*" style={{ display: "none" }}
                          onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                        />
                      </label>
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {refMeta.label}
                        {refAutoFilled && !scanning && <span className={styles.ocrTag}><CheckCircleIcon className={styles.ocrTagIcon} /> Auto-detected</span>}
                      </span>
                      <input
                        type="text"
                        className={`${styles.input} ${refNeedsManual && !referenceNumber ? styles.inputNeedsAttention : ""}`}
                        value={referenceNumber}
                        onChange={(e) => {
                          setReferenceNumber(e.target.value.toUpperCase());
                          setRefAutoFilled(false);
                          setRefNeedsManual(false);
                        }}
                        placeholder={refMeta.placeholder}
                      />
                      {refNeedsManual && !referenceNumber && (
                        <span className={styles.manualHint}>
                          We couldn't read this automatically — please type it in from your screenshot.
                        </span>
                      )}
                    </label>

                    {showSuffixField && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Last {suffixLength} digits of the account you paid from</span>
                        <input
                          type="text"
                          className={`${styles.input} ${suffixInvalid ? styles.inputNeedsAttention : ""}`}
                          inputMode="numeric"
                          maxLength={suffixLength}
                          value={accountSuffix}
                          onChange={(e) => { setAccountSuffix(e.target.value.replace(/\D/g, "")); setSuffixInvalid(false); }}
                          placeholder={`${suffixLength} digits`}
                        />
                        <span className={styles.manualHint}>
                          The bank couldn't confirm this automatically. Enter the digits and try again.
                        </span>
                      </label>
                    )}

                    {senderNeedsPhone && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Phone number you paid from</span>
                        <input
                          type="tel" className={styles.input}
                          value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="09XXXXXXXX"
                        />
                      </label>
                    )}
                  </>
                )}

                <button className={styles.payBtn} onClick={handleSubmit} disabled={!selectedAccount || !senderBank || scanning}>
                  Submit Payment
                </button>
              </div>
            )}

            {(step === "submitting" || step === "polling") && (
              <div className={styles.loadingWrap}>
                <SpinnerIcon className={styles.spinnerLarge} />
                <div className={styles.processingText}>
                  {step === "submitting" ? "Submitting…" : "Verifying your payment — this usually takes a few seconds wait…"}
                </div>
              </div>
            )}

            {step === "rejected" && (
              <div className={styles.rejectBox}>
                <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
                <div className={styles.rejectText}>{friendlyRejection(rejectionReason)}</div>
                <button className={styles.payBtn} onClick={retry}>Try Again</button>
              </div>
            )}

            {step === "needs_review" && (
              <div className={styles.infoBox}>
                We received your payment, but we couldn't confirm every detail automatically.
                The pitch owner will review it shortly — please check back in a little while.
              </div>
            )}

            {step === "timeout" && (
              <div className={styles.rejectBox}>
                <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
                <div className={styles.rejectText}>
                  We couldn't confirm this payment yet. Double-check the transaction number and screenshot, then try again.
                </div>
                <button className={styles.payBtn} onClick={retry}>Try Again</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
