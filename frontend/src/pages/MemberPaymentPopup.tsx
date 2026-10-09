import { useEffect, useRef, useState } from "react";
import styles from "./css/MemberPaymentPopup.module.css";
import flow from "./css/PaymentFlow.module.css";
import {
  getTeamBookingPaymentInfo, extractReceiptData, submitTeamBookingPayment, pollPaymentTransaction,
  getSoloBookingPaymentInfo, submitSoloBookingPayment, getMySavedSenderBanks,
  type PaymentInfo, type OwnerBankAccount,
} from "../lib/payment";
import { SUPPORTED_BANKS } from "../lib/paymentAdmin";
import { BANK_AM, GENERIC_ERROR, TEXT, friendlyError, friendlyRejection, type Bi, type ErrorCode } from "../lib/paymentMessages";
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

const REFERENCE_PLACEHOLDER: Record<string, string> = {
  cbe: "FT26267712345",
  telebirr: "ABCT1234567",
};

// Banks you can pay FROM (any of them can send to any owner account).
const SENDER_BANKS = SUPPORTED_BANKS
  .filter((b) => b.value !== "zemen")
  .map((b) => ({ value: b.value as string, label: b.label }));

// CBE and BOA open a receipt with the last digits of an account number.
const ACCOUNT_DIGITS: Record<string, number> = { cbe: 8, boa: 5 };

// Only a same-bank CBE -> CBE payment can be opened with the OWNER's digits (the server
// does that on its own). Everything else needs the PAYER's own account number.
// Keep in sync with _owner_digits_can_work() in services.py.
function ownerDigitsCanWork(sender: string, payTo: string) {
  return sender === "cbe" && payTo === "cbe";
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

function BiText({ t, small }: { t: Bi; small?: boolean }) {
  return (
    <>
      <span className={`${flow.am} ${small ? flow.amSmall : ""}`}>{t.am}</span>
      <span className={flow.en}>{t.en}</span>
    </>
  );
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
function GreenArrow() {
  return (
    <svg className={flow.flowArrow} width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
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
  const [savedBanks, setSavedBanks] = useState<string[]>([]);

  const [selectedAccount, setSelectedAccount] = useState<OwnerBankAccount | null>(null); // paid TO
  const [senderBank, setSenderBank] = useState<string>("");                                // paid FROM

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [refAutoFilled, setRefAutoFilled] = useState(false);
  const [refNeedsManual, setRefNeedsManual] = useState(false);

  const [accountNumber, setAccountNumber] = useState("");
  const [accountFallback, setAccountFallback] = useState(false);
  const [accountInvalid, setAccountInvalid] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  const [error, setError] = useState<(Bi & { code?: ErrorCode }) | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [slowCheck, setSlowCheck] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const digitsNeeded = ACCOUNT_DIGITS[senderBank];
  const needsAccountUpfront =
    !!digitsNeeded && !!selectedAccount &&
    !ownerDigitsCanWork(senderBank, selectedAccount.bank) &&
    !savedBanks.includes(senderBank);
  const askAccount = !!digitsNeeded && (needsAccountUpfront || accountFallback);
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
          if (data.bank_accounts.length === 1) setSelectedAccount(data.bank_accounts[0]);
        }
      })
      .catch(() => !cancelled && setError(GENERIC_ERROR));
    getMySavedSenderBanks().then((banks) => !cancelled && setSavedBanks(banks)).catch(() => {});
    return () => { cancelled = true; };
  }, [payment.id, readOnly, kind]);

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  function chooseSenderBank(bank: string) {
    setSenderBank(bank);
    setAccountFallback(false);
    setAccountInvalid(false);
    setError(null);
  }

  async function handleFileSelected(file: File) {
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setError(null);
    setScanning(true);
    setRefAutoFilled(false);
    setRefNeedsManual(false);
    try {
      const result = await extractReceiptData(file, senderBank);
      if (result.suggested_reference_number) {
        setReferenceNumber(result.suggested_reference_number);
        setRefAutoFilled(true);
      } else {
        setRefNeedsManual(true);
      }
    } catch (err: any) {
      setRefNeedsManual(true);
      setError(err?.response?.status === 429 ? friendlyError(err) : TEXT.typeTx);
    } finally {
      setScanning(false);
    }
  }

  // CBE / BOA could not open the receipt with the digits we had: ask for the player's own account.
  function handleRejected(reason: string) {
    setRejectionReason(reason);
    if (digitsNeeded && ["not_verified", "no_result_from_provider", "bank_unavailable"].includes(reason)) {
      setAccountFallback(true);
    }
    setStep("rejected");
  }

  function startPolling(transactionId: string) {
    setStep("polling");
    setSlowCheck(false);
    let attempts = 0;
    pollTimer.current = setInterval(async () => {
      attempts += 1;
      if (attempts === 8) setSlowCheck(true);
      try {
        const txn = await pollPaymentTransaction(transactionId);
        if (txn.status === "verified") { clearInterval(pollTimer.current!); onPaid?.(); onClose?.(); }
        else if (txn.status === "rejected") { clearInterval(pollTimer.current!); handleRejected(txn.rejection_reason); }
        else if (txn.status === "needs_review") { clearInterval(pollTimer.current!); setStep("needs_review"); }
        else if (attempts > 90) { clearInterval(pollTimer.current!); setStep("timeout"); }
      } catch { /* a short network hiccup - keep checking */ }
    }, 2000);
  }

  async function handleSubmit() {
    if (!selectedAccount || !senderBank || !screenshotFile || !referenceNumber.trim()) {
      setError(TEXT.fillAll);
      return;
    }
    const digits = accountNumber.replace(/\D/g, "");
    if (askAccount && digits.length < digitsNeeded) {
      setAccountInvalid(true);
      setError({ am: "እባክዎ ሙሉውን የአካውንት ቁጥር ያስገቡ።", en: "Please enter your full account number." });
      return;
    }
    if (senderNeedsPhone && !phoneNumber.trim()) {
      setError({ am: "እባክዎ የላኩበትን ስልክ ቁጥር ያስገቡ።", en: "Please enter the phone number you sent from." });
      return;
    }
    setAccountInvalid(false);
    setError(null);
    setStep("submitting");
    try {
      const submitFn = kind === "solo" ? submitSoloBookingPayment : submitTeamBookingPayment;
      const txn = await submitFn(payment.id, {
        bank: senderBank,                    // paid FROM
        pay_to_bank: selectedAccount.bank,   // paid INTO
        screenshot: screenshotFile,
        reference_number: referenceNumber.trim(),
        sender_account_number: askAccount ? digits : "",
        phone_number: senderNeedsPhone ? phoneNumber : "",
      });
      if (txn.status === "verified") { onPaid?.(); onClose?.(); }
      else if (txn.status === "rejected") handleRejected(txn.rejection_reason);
      else if (txn.status === "needs_review") setStep("needs_review");
      else startPolling(txn.id);
    } catch (err: any) {
      const friendly = friendlyError(err);
      if (friendly.code === "account_number_required") setAccountFallback(true);
      setError(friendly);
      setStep("form");
    }
  }

  function retry() { setStep("form"); setError(null); }

  const referencePlaceholder = REFERENCE_PLACEHOLDER[senderBank] || "";
  const bankEnglish = (value: string) => SENDER_BANKS.find((b) => b.value === value)?.label.replace(" (not supported for verification)", "") || value;

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="alertdialog" aria-modal="true">
        {!readOnly && <div className={styles.countdown}>{countdown}</div>}
        {onClose && readOnly && (
          <button className={styles.readOnlyClose} onClick={onClose} aria-label="Close"><CloseIcon /></button>
        )}

        {error && (
          <div className={`${styles.topErrorBanner} ${flow.errorBilingual}`}>
            <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
            <span className={styles.topErrorText}>
              <span className={flow.am}>{error.am}</span>
              <span className={flow.en}>{error.en}</span>
            </span>
            <button className={styles.topErrorClose} onClick={() => setError(null)} aria-label="Close"><CloseIcon /></button>
          </div>
        )}

        <div className={styles.titleRow}>
          <div className={styles.title}>{payment.pitch_name}</div>
        </div>
        <div className={styles.subtitle}>
          {payment.team_name || "—"} · <b className={styles.amountHighlight}>{payment.amount} Br</b>
        </div>

        {readOnly ? (
          <div className={styles.readOnlyBanner}>{readOnlyStatusLabel || "This payment window has closed."}</div>
        ) : (
          <>
            {step === "loading" && <div className={styles.loadingWrap}><SpinnerIcon className={styles.spinnerLarge} /></div>}

            {step === "no_config" && <div className={styles.infoBox}><BiText t={TEXT.noConfig} small /></div>}
            {step === "gateway_unavailable" && <div className={styles.infoBox}><BiText t={TEXT.noGateway} small /></div>}

            {step === "form" && info && (
              <div className={styles.form}>
                {/* ── 1. where to send the money ── */}
                <div className={flow.step}>
                  <div className={flow.stepHead}>
                    <span className={flow.stepNum}>1</span>
                    <div><BiText t={info.bank_accounts.length > 1 ? TEXT.step1 : TEXT.step1Single} /></div>
                  </div>
                  <div className={flow.payToList}>
                    {info.bank_accounts.map((acc) => {
                      const active = selectedAccount?.id === acc.id;
                      const single = info.bank_accounts.length === 1;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          className={`${flow.payToCard} ${active ? flow.payToCardActive : ""} ${single ? flow.payToCardStatic : ""}`}
                          onClick={() => !single && setSelectedAccount(acc)}
                        >
                          <PaymentLogo name={acc.bank} label={bankEnglish(acc.bank)} size={46} />
                          <span className={flow.payToBody}>
                            <span className={`${flow.am} ${flow.amSmall}`}>{BANK_AM[acc.bank] || bankEnglish(acc.bank)}</span>
                            <span className={flow.en}>{bankEnglish(acc.bank)}</span>
                            <span className={flow.holder}>{acc.account_holder_name}</span>
                            <span className={flow.accountNo}>{acc.phone_number || acc.account_number}</span>
                            <span className={flow.payToCaption}>{TEXT.forPitch(payment.pitch_name).am} · {TEXT.forPitch(payment.pitch_name).en}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── 2. which bank did you send it from ── */}
                {selectedAccount && (
                  <div className={flow.step}>
                    <div className={flow.stepHead}>
                      <span className={flow.stepNum}>2</span>
                      <div>
                        <BiText t={TEXT.step2(payment.amount)} />
                        <span className={flow.en}>{TEXT.tapBank.am} · {TEXT.tapBank.en}</span>
                      </div>
                    </div>
                    <div className={flow.bankGrid}>
                      {SENDER_BANKS.map((b) => (
                        <button
                          key={b.value}
                          type="button"
                          className={`${flow.bankTile} ${senderBank === b.value ? flow.bankTileActive : ""}`}
                          onClick={() => chooseSenderBank(b.value)}
                          aria-pressed={senderBank === b.value}
                        >
                          <PaymentLogo name={b.value} label={b.label} size={38} />
                          <span className={flow.tileAm}>{BANK_AM[b.value] || b.label}</span>
                          <span className={flow.tileEn}>{b.label.replace(" (not supported for verification)", "")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 3. upload (only after the bank is chosen) ── */}
                {selectedAccount && senderBank && (
                  <div className={flow.step}>
                    <div className={flow.flowRow} aria-label={`${bankEnglish(senderBank)} to ${bankEnglish(selectedAccount.bank)}`}>
                      <PaymentLogo name={senderBank} label={bankEnglish(senderBank)} size={44} />
                      <GreenArrow />
                      <PaymentLogo name={selectedAccount.bank} label={bankEnglish(selectedAccount.bank)} size={44} />
                    </div>

                    <div className={flow.stepHead}>
                      <span className={flow.stepNum}>3</span>
                      <div><BiText t={TEXT.step3} /></div>
                    </div>

                    <label className={styles.uploadBox}>
                      {screenshotPreview ? (
                        <div className={styles.previewWrap}>
                          <img src={screenshotPreview} alt="Receipt" className={styles.uploadPreview} />
                          {scanning && (
                            <div className={styles.scanOverlay}>
                              <div className={styles.scanLine} />
                              <span>{TEXT.scanning.am} · {TEXT.scanning.en}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <UploadIcon className={styles.uploadIcon} />
                          <BiText t={TEXT.tapPhoto} small />
                        </>
                      )}
                      <input
                        type="file" accept="image/*" style={{ display: "none" }}
                        onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        <BiText t={TEXT.txNumber} small />
                        {refAutoFilled && !scanning && (
                          <span className={styles.ocrTag}><CheckCircleIcon className={styles.ocrTagIcon} /> {TEXT.readAuto.am}</span>
                        )}
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
                        placeholder={referencePlaceholder}
                      />
                      {refNeedsManual && !referenceNumber && (
                        <span className={`${styles.manualHint} ${flow.hint}`}><BiText t={TEXT.typeTx} small /></span>
                      )}
                    </label>

                    {askAccount && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}><BiText t={TEXT.accountNumber} small /></span>
                        <input
                          type="text"
                          className={`${styles.input} ${accountInvalid ? styles.inputNeedsAttention : ""}`}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={24}
                          value={accountNumber}
                          onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setAccountInvalid(false); }}
                          placeholder="1000123456789"
                        />
                        <span className={`${styles.manualHint} ${flow.hint}`}>
                          <BiText t={accountFallback && accountNumber ? TEXT.accountRetry : TEXT.accountHint} small />
                        </span>
                      </label>
                    )}

                    {senderNeedsPhone && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}><BiText t={TEXT.phone} small /></span>
                        <input
                          type="tel" className={styles.input}
                          value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="09XXXXXXXX"
                        />
                      </label>
                    )}

                    <button className={styles.payBtn} onClick={handleSubmit} disabled={scanning}>
                      {TEXT.submit.am}
                      <span className={flow.en} style={{ color: "inherit", opacity: 0.85 }}>{TEXT.submit.en}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {(step === "submitting" || step === "polling") && (
              <div className={styles.loadingWrap}>
                <SpinnerIcon className={styles.spinnerLarge} />
                <div className={styles.processingText}>
                  <BiText t={step === "submitting" ? { am: TEXT.submitting.am, en: TEXT.submitting.en } : TEXT.verifying} small />
                  {step === "polling" && slowCheck && (
                    <div className={flow.slowNote}><BiText t={TEXT.verifyingSlow} small /></div>
                  )}
                </div>
              </div>
            )}

            {step === "rejected" && (
              <div className={styles.rejectBox}>
                <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
                <div className={styles.rejectText}><BiText t={friendlyRejection(rejectionReason)} small /></div>
                <button className={styles.payBtn} onClick={retry}>{TEXT.tryAgain.am} · {TEXT.tryAgain.en}</button>
              </div>
            )}

            {step === "needs_review" && (
              <div className={styles.infoBox}><BiText t={TEXT.needsReview} small /></div>
            )}

            {step === "timeout" && (
              <div className={styles.rejectBox}>
                <span className={styles.noNoBadge}><NoGestureIcon className={styles.noNoIcon} /></span>
                <div className={styles.rejectText}><BiText t={TEXT.timeout} small /></div>
                <button className={styles.payBtn} onClick={retry}>{TEXT.tryAgain.am} · {TEXT.tryAgain.en}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
