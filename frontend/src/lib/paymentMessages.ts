// Everything the payer READS: Amharic first, with a small English line under it.
// Raw errors from the server or from verify.et are never shown - only these texts.

export interface Bi {
  am: string;
  en: string;
}

/** Amharic names of the banks / wallets (English names come from SUPPORTED_BANKS). */
export const BANK_AM: Record<string, string> = {
  cbe: "ንግድ ባንክ",
  boa: "አቢሲኒያ ባንክ",
  telebirr: "ቴሌብር",
  mpesa: "ኤም-ፔሳ",
  cbebirr: "ሲቢኢ ብር",
  dashen: "ዳሽን ባንክ",
  awash: "አዋሽ ባንክ",
  siinqee: "ሲንቄ ባንክ",
  kaafiebirr: "ካፊ ኢብር",
};

export const GENERIC_ERROR: Bi = {
  am: "የሆነ ችግር ተፈጥሯል። እባክዎ ቆይተው እንደገና ይሞክሩ።",
  en: "Something went wrong. Please try again later.",
};

/** 41 -> "41 seconds"; 330 -> "6 minutes" (rounded up). */
export function formatWait(totalSeconds: number): Bi {
  const seconds = Math.max(Math.ceil(totalSeconds), 1);
  if (seconds < 60) {
    return { am: `${seconds} ሰከንድ`, en: `${seconds} second${seconds === 1 ? "" : "s"}` };
  }
  const minutes = Math.ceil(seconds / 60);
  return { am: `${minutes} ደቂቃ`, en: `${minutes} minute${minutes === 1 ? "" : "s"}` };
}

function waitMessage(totalSeconds: number): Bi {
  const wait = formatWait(totalSeconds);
  return {
    am: `እባክዎ ከ${wait.am} በኋላ እንደገና ይሞክሩ።`,
    en: `Please try again after ${wait.en}.`,
  };
}

/** Our server's own rate limit ("Request was throttled. Expected available in 41 seconds."). */
function throttleSeconds(err: any): number {
  const header = Number(err?.response?.headers?.["retry-after"]);
  if (Number.isFinite(header) && header > 0) return header;
  const fromText = String(err?.response?.data?.detail ?? "").match(/(\d+)\s*second/i);
  return fromText ? Number(fromText[1]) : 60;
}

export type ErrorCode = "account_number_required";

/** Turns ANY failed request into a message that is safe and understandable. */
export function friendlyError(err: any): Bi & { code?: ErrorCode } {
  const status = err?.response?.status;
  const detail = String(err?.response?.data?.detail ?? "");

  if (status === 429) return waitMessage(throttleSeconds(err));

  if (status === 400 || status === 422) {
    if (/account_number_required/i.test(detail)) {
      return {
        code: "account_number_required",
        am: "ክፍያውን ለማረጋገጥ የላኩበትን የባንክ አካውንት ቁጥር ያስገቡ።",
        en: "Please type the bank account number you sent the money from.",
      };
    }
    if (/couldn't find this transaction number in the uploaded screenshot/i.test(detail)) {
      return {
        am: "በፎቶው ውስጥ ይህን የግብይት ቁጥር አላገኘነውም። እባክዎ የክፍያውን ትክክለኛ ፎቶ ይጫኑ።",
        en: "We couldn't find this transaction number in your photo. Please upload the real payment receipt.",
      };
    }
    if (/already been used/i.test(detail)) {
      return {
        am: "ይህ የግብይት ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል።",
        en: "This transaction number has already been used.",
      };
    }
    if (/already (been )?paid/i.test(detail)) {
      return { am: "ይህ ክፍያ ቀደም ብሎ ተከፍሏል።", en: "This has already been paid." };
    }
    if (/full account number|exactly \d+ digits/i.test(detail)) {
      return {
        am: "እባክዎ ሙሉውን የአካውንት ቁጥር ያስገቡ።",
        en: "Please enter your full account number.",
      };
    }
    if (/being checked right now/i.test(detail)) {
      return {
        am: "ይህ ግብይት አሁን እየተረጋገጠ ነው። ጥቂት ቆይተው እንደገና ይሞክሩ።",
        en: "This transaction is being checked right now. Try again in a moment.",
      };
    }
    if (/window has closed|no longer pending/i.test(detail)) {
      return { am: "የክፍያ ጊዜው አብቅቷል።", en: "The payment time has ended." };
    }
    if (/phone/i.test(detail)) {
      return { am: "እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ።", en: "Please enter a valid phone number." };
    }
  }
  return GENERIC_ERROR;
}

/** Why a payment was refused (our own reason codes, never verify.et's words). */
export function friendlyRejection(reason: string): Bi {
  switch (reason) {
    case "bank_unavailable":
      return {
        am: "ባንኩ አሁን ምላሽ እየሰጠ አይደለም። ጥቂት ቆይተው እንደገና ይሞክሩ።",
        en: "The bank is not answering right now. Please try again in a little while.",
      };
    case "receiver_name_mismatch":
    case "receiver_mismatch":
      return {
        am: "ገንዘቡ ወደ ትክክለኛው አካውንት አልተላከም። የአካውንቱን ስም ያረጋግጡና እንደገና ይክፈሉ።",
        en: "The money was not sent to the right account. Check the account name and pay again.",
      };
    case "transaction_too_old":
      return {
        am: "ይህ ክፍያ ከዚህ ሜዳ መያዝ 3 ሰዐት ቀድሞ የተከፈለ ስለሆነ መጠቀም አይቻልም። እባክዎ አዲስ ክፍያ ይፈጽሙ ወይም የሜዳውን ባለቤት ያናግሩ።",
        en: "This payment was made too long before this booking, so it can't be used. Please make a new payment.",
      };
    case "amount_mismatch":
    case "amount_unreadable":
      return {
        am: "የተከፈለው ገንዘብ መጠን ከሚጠበቀው ጋር አይመሳሰልም።",
        en: "The amount you paid is not the amount that is due.",
      };
    case "currency_mismatch":
      return { am: "ክፍያው በኢትዮጵያ ብር መሆን አለበት።", en: "The payment must be in Ethiopian Birr." };
    case "timestamp_in_future":
    case "transaction_date_mismatch":
      return {
        am: "የክፍያው ቀን ትክክል አይመስልም። የትክክለኛውን ደረሰኝ ፎቶ ይጫኑ።",
        en: "The date of this payment looks wrong. Upload the real receipt.",
      };
    case "duplicate_transaction":
      return {
        am: "ይህ የግብይት ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል።",
        en: "This transaction number has already been used.",
      };
    case "sender_identity_mismatch":
      return {
        am: "ይህ ክፍያ የእርስዎ እንደሆነ ማረጋገጥ አልተቻለም። በራስዎ አካውንት የተላከ ክፍያ ይጫኑ።",
        en: "We couldn't confirm this payment is yours. Upload a payment from your own account.",
      };
    case "no_result_from_provider":
    case "not_verified":
      return {
        am: "ክፍያውን ማረጋገጥ አልተቻለም። የግብይት ቁጥሩን፣ የመረጡትን ባንክ እና የአካውንት ቁጥርዎን ያረጋግጡና እንደገና ይሞክሩ።",
        en: "We couldn't confirm this payment. Check the transaction number, the bank you picked and your account number, then try again.",
      };
    default:
      return GENERIC_ERROR;
  }
}

export const TEXT = {
  step1: { am: "ገንዘቡን የሚልኩበትን አካውንት ይምረጡ", en: "Choose the account you will send the money to" },
  step1Single: { am: "ገንዘቡን ወደዚህ አካውንት ይላኩ", en: "Send the money to this account" },
  accountHolder: { am: "የአካውንት ባለቤት", en: "Account holder" },
  forPitch: (pitch: string): Bi => ({ am: `የ${pitch} ክፍያ አካውንት`, en: `Payment account of ${pitch}` }),
  step2: (amount: string): Bi => ({
    am: `ይህን ${amount} ብር ከየትኛው ባንክ ወይም ዋሌት ላኩ?`,
    en: `From which bank or wallet did you send this ${amount} Birr?`,
  }),
  tapBank: { am: "ባንኩን ይንኩ", en: "Tap your bank" },
  step3: { am: "የክፍያ ደረሰኙን ፎቶ ይጫኑ", en: "Upload the photo (screenshot) of your payment receipt" },
  tapPhoto: { am: "ፎቶ ለመምረጥ እዚህ ይንኩ", en: "Tap here to choose the photo" },
  scanning: { am: "ደረሰኙን በማንበብ ላይ…", en: "Reading your receipt…" },
  txNumber: { am: "የግብይት ቁጥር", en: "Transaction number" },
  readAuto: { am: "በራስ-ሰር ተነበበ", en: "Read automatically" },
  typeTx: {
    am: "ቁጥሩን በራስ-ሰር ማንበብ አልቻልንም። ከደረሰኙ ላይ ይጻፉት።",
    en: "We couldn't read it automatically. Please type it from your receipt.",
  },
  accountNumber: {
    am: "የእርሶን የባንክ አካውንት ቁጥር እዚ ያስገቡ",
    en: "The bank account number you sent this money from",
  },
  accountHint: {
    am: "ሙሉውን የአካውንት ቁጥር ያስገቡ።",
    en: "Type the full account number.",
  },
  accountRetry: {
    am: "ባንኩ በዚህ ቁጥር አላገኘውም። የላኩበትን አካውንት ቁጥር በትክክል ያስገቡ።",
    en: "The bank could not confirm it. Type the account number you really sent from.",
  },
  phone: { am: "የላኩበት ስልክ ቁጥር", en: "The phone number you sent from" },
  submit: { am: "ክፍያዬን አረጋግጥ", en: "Confirm my payment" },
  submitting: { am: "በመላክ ላይ…", en: "Sending…" },
  verifying: { am: "ክፍያዎን በማረጋገጥ ላይ ነን… እባክዎ ይጠብቁ", en: "Checking your payment… please wait" },
  verifyingSlow: {
    am: "ባንኩ ትንሽ እየዘገየ ነው፤ ገጹን አይዝጉ።",
    en: "The bank is a little slow. Please keep this page open.",
  },
  needsReview: {
    am: "ክፍያዎ ደርሶናል። የፒቹ ባለቤት በቅርቡ ያረጋግጣል። ቆይተው ይመለከቱ።",
    en: "We received your payment. The pitch owner will confirm it soon. Please check back later.",
  },
  timeout: {
    am: "ክፍያውን ገና ማረጋገጥ አልቻልንም። ቁጥሩንና ፎቶውን ያረጋግጡና እንደገና ይሞክሩ።",
    en: "We couldn't confirm the payment yet. Check the number and photo and try again.",
  },
  tryAgain: { am: "እንደገና ሞክር", en: "Try again" },
  noConfig: {
    am: "ይህ የፒች ባለቤት ክፍያ የሚቀበልበትን መንገድ ገና አላዘጋጀም። እባክዎ በቀጥታ ያነጋግሩት።",
    en: "This pitch owner has not set up a way to receive payments yet. Please contact them directly.",
  },
  noGateway: {
    am: "የኦንላይን ክፍያ ለዚህ ፒች ገና አልተዘጋጀም። እባክዎ የፒቹን ባለቤት ያነጋግሩ።",
    en: "Online checkout is not available for this pitch yet. Please contact the pitch owner.",
  },
  fillAll: {
    am: "እባክዎ ሁሉንም ቦታዎች ይሙሉ።",
    en: "Please fill in everything.",
  },
};
