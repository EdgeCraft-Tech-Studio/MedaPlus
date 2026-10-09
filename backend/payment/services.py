import re
import logging
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher

import requests
from django.conf import settings
from django.db import DatabaseError, IntegrityError
from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce
from django.db import transaction as db_transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from payment.ocr import extract_reference_from_image
from notification.choices import NotificationType
from notification.services import notify
from team_booking.models import TeamBookingPayment
from team_booking.services import _display_name, _try_finalize_if_all_paid

from .choices import PaymentMode, PaymentStatus, SupportedBank
from .exceptions import DuplicateTransactionError, PaymentProviderError, PaymentValidationError
from .models import (
    PAYER_PHONE_REQUIRED_BANKS,
    SUFFIX_REQUIRED_BANKS,
    WALLET_BANKS,
    PayerBankSuffix,
    PaymentTransaction,
    PitchOwnerBankAccount,
    PitchOwnerPaymentProfile,
)

logger = logging.getLogger(__name__)


class PaymentNotFound(PaymentValidationError):
    """No such payment for this owner."""


class AccountNumberRequired(PaymentValidationError):
    """The payer must type the account number they paid from. The marker text
    'account_number_required' is what the form looks for."""

    def __init__(self):
        super().__init__("Please enter the account number you paid from. [account_number_required]")


class InvalidOwnerPassword(PaymentValidationError):
    """The pitch owner typed a wrong password."""


class ReferenceAlreadyVerified(DuplicateTransactionError):
    """The same transaction reference is already saved with status VERIFIED."""

    def __init__(self, reference_number: str):
        super().__init__(f"The transaction {reference_number} is already verified.")
        self.reference_number = reference_number

VERIFY_ET_BASE_URL = getattr(settings, "VERIFY_ET_BASE_URL", "https://verify.et")
VERIFY_ET_API_KEY = getattr(settings, "VERIFY_ET_API_KEY", "")
VERIFY_ET_TIMEOUT_SECONDS = 30
VERIFY_ET_WAIT_MS = 20000

# ─────────────────────────────────────────────────────────────────────────────
# RULE: a payment is rejected if the bank says it was made MORE THAN this many
# hours BEFORE payment started on our side. Payment "started" =
#   solo booking  -> the moment "Occupy / Cash booking" was clicked
#                    (SoloBookingHold.created_at)
#   team booking  -> the moment the owner clicked "Start Payment"
#                    (TeamBookingPayment.created_at)
# Both are exposed by PaymentTransaction.reference_date (see models.py).
# Change the number in settings.py / .env, nothing else needs to move.
# ─────────────────────────────────────────────────────────────────────────────
MAX_PAYMENT_TIME_ALLOWED_HOURS = getattr(settings, "MAX_PAYMENT_TIME_ALLOWED_HOURS", 5)

STALE_PROCESSING_MINUTES = 10
MAX_BANK_RETRIES = 2

# settings.py -> PAYMENT_DEBUG_PRINT = True  prints, in the terminal, what is sent to
# verify.et (account digits + transaction id) and what it answers. Defaults to DEBUG.
PAYMENT_DEBUG_PRINT = bool(getattr(settings, "PAYMENT_DEBUG_PRINT", getattr(settings, "DEBUG", False)))


def _dbg(*lines) -> None:
    if PAYMENT_DEBUG_PRINT:
        for line in lines:
            print(line, flush=True)

# settings.py -> CHECK_NAME_FOR_PAYMENT = True / False
#   True : the SENDER name on the bank receipt must match the payer's profile name,
#          otherwise the payment waits in the pitch owner's review table.
#   False: that sender-name check is skipped (a mother / father / friend may pay).
# (The RECEIVER-name check - money went to the owner's account - is always on.)
CHECK_NAME_FOR_PAYMENT = bool(getattr(settings, "CHECK_NAME_FOR_PAYMENT", False))


def _call_verify_et(*, payload: dict, idempotency_key: str) -> requests.Response:
    if not VERIFY_ET_API_KEY:
        raise PaymentProviderError("VERIFY_ET_API_KEY is not configured.")
    _dbg(
        "──────── sending to verify.et ────────",
        f'bank: "{payload.get("bank", "")}"',
        f'account number: "{payload.get("suffix", "")}"',
        f'transaction id: "{payload.get("reference", "")}"',
    )
    response = requests.post(
        f"{VERIFY_ET_BASE_URL}/api/verify",
        params={"waitMs": VERIFY_ET_WAIT_MS},
        json=payload,
        headers={
            "x-api-key": VERIFY_ET_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        },
        timeout=VERIFY_ET_TIMEOUT_SECONDS,
    )
    _dbg(f"──────── verify.et answered: HTTP {response.status_code} ────────", response.text[:3000])
    return response


def _poll_verify_et(*, request_id: str) -> requests.Response:
    response = requests.get(
        f"{VERIFY_ET_BASE_URL}/api/verify/{request_id}",
        headers={"x-api-key": VERIFY_ET_API_KEY},
        timeout=VERIFY_ET_TIMEOUT_SECONDS,
    )
    _dbg(f"──────── verify.et status check: HTTP {response.status_code} ────────", response.text[:3000])
    return response


def _response_get(result_item: dict, *candidate_keys: str) -> str:
    """verify.et's JSON key casing isn't fully pinned down from the
    docs alone — try every reasonable variant of a field name rather
    than assuming one exact key. Looks at the top level first, then
    inside "bankSpecific".
    """
    sources = [result_item]
    nested = result_item.get("bankSpecific")
    if isinstance(nested, dict):
        sources.append(nested)
    for source in sources:
        for key in candidate_keys:
            if key in source and source[key] not in (None, ""):
                return str(source[key])
    return ""


# ─────────────────────────────────────────────────────────────────────────────
# RECEIVER NAME CHECK
# ─────────────────────────────────────────────────────────────────────────────

_NAME_TITLES = {
    "mr", "mrs", "ms", "miss", "dr", "prof", "sir", "ato", "wro", "weyzero",
    "woizero", "w", "ro", "abba", "memhir",
}


def _name_tokens(name: str) -> list:
    """'Mr Yeabsira  Tesfaye-Asefa' -> ['yeabsira', 'tesfaye', 'asefa']"""
    text = re.sub(r"[\W\d_]+", " ", (name or "").lower(), flags=re.UNICODE)
    return [t for t in text.split() if t and t not in _NAME_TITLES]


def _names_match(expected: str, actual: str) -> bool:
    """True when both names describe the same person.

    - ignores case, titles (Mr/Ato/...), punctuation and word order
    - tolerates small spelling differences per word (similarity >= 0.85)
    - the SHORTER name must be fully contained in the longer one, so
      "Yeabsira Tesfaye" matches "Mr Yeabsira Tesfaye Asefa"
    - a one-word name can never prove identity (unless both are that one word)
    """
    a, b = _name_tokens(expected), _name_tokens(actual)
    if not a or not b:
        return False
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(short) < 2 and len(long_) > 1:
        return False

    remaining = list(long_)
    for token in short:
        best = max(remaining, key=lambda t: SequenceMatcher(None, token, t).ratio(), default=None)
        if best is None or SequenceMatcher(None, token, best).ratio() < 0.85:
            return False
        remaining.remove(best)
    return True


def _receiver_name_from(result_item: dict) -> str:
    return _response_get(
        result_item,
        "receiverName", "receiver_name", "creditedPartyName", "credited_party_name",
        "beneficiaryName", "beneficiary_name",
    )


# ─────────────────────────────────────────────────────────────────────────────
# SENDER IDENTITY (sender name on the receipt vs the payer's profile name)
# ─────────────────────────────────────────────────────────────────────────────

# identity outcomes that go to the admin review queue instead of rejecting
_REVIEW_IDENTITY_REASONS = {"sender_identity_missing_in_response", "sender_name_mismatch"}


def _payer_full_name(payer) -> str:
    getter = getattr(payer, "get_full_name", None)
    full = getter() if callable(getter) else ""
    if not full:
        full = f"{getattr(payer, 'first_name', '')} {getattr(payer, 'last_name', '')}".strip()
    return full or ""


def _check_sender_name(transaction, result_item: dict) -> str:
    """'' = fine / can't judge, otherwise a review reason."""
    if not CHECK_NAME_FOR_PAYMENT:
        return ""
    payer_name = _payer_full_name(transaction.payer)
    if len(_name_tokens(payer_name)) < 2:
        return ""  # profile has no full name -> nothing reliable to compare
    sender = _response_get(result_item, "senderName", "sender_name", "payerName")
    if not sender:
        return "sender_identity_missing_in_response"
    return "" if _names_match(payer_name, sender) else "sender_name_mismatch"

def _check_sender_identity(transaction, result_item: dict) -> str:
    """'' = pass, otherwise a reason. CBE / BOA only (wallets are unchanged).

    The suffix is the pitch owner's now, so it proves nothing about the payer;
    the sender name on the receipt vs the payer's profile name is the check.
    """
    if transaction.bank not in SUFFIX_REQUIRED_BANKS:
        return ""
    return _check_sender_name(transaction, result_item)


# ─────────────────────────────────────────────────────────────────────────────
# STATUS HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _drop_screenshot_file(transaction: PaymentTransaction) -> None:
    """Screenshots are kept only for payments that succeed (or wait for review)."""
    try:
        if transaction.screenshot:
            transaction.screenshot.delete(save=False)
    except Exception:
        logger.exception("Could not delete screenshot file for transaction %s", transaction.id)


def _discard_row(transaction: PaymentTransaction) -> None:
    """Remove an attempt that never produced an answer, file included."""
    _drop_screenshot_file(transaction)
    transaction.delete()


def _recover_or_discard(transaction: PaymentTransaction) -> PaymentTransaction:
    """After an UNEXPECTED error. If the payment already reached VERIFIED
    (money confirmed; only a follow-up step such as booking sync failed) the row
    must never be deleted: log loudly and return it. Otherwise remove the dead
    attempt so the payer can retry at once."""
    try:
        transaction.refresh_from_db()
    except PaymentTransaction.DoesNotExist:
        raise PaymentProviderError("Something went wrong while verifying this payment. Please try again.")
    if transaction.status == PaymentStatus.VERIFIED:
        logger.critical(
            "Payment %s is VERIFIED but a follow-up step failed — check the booking by hand.",
            transaction.id,
        )
        return transaction
    _discard_row(transaction)
    raise PaymentProviderError("Something went wrong while verifying this payment. Please try again.")


def _reject(transaction: PaymentTransaction, reason: str) -> PaymentTransaction:
    _drop_screenshot_file(transaction)
    transaction.status = PaymentStatus.REJECTED
    transaction.rejection_reason = reason
    transaction.processed_at = timezone.now()
    transaction.save(update_fields=["status", "rejection_reason", "processed_at", "screenshot", "updated_at"])
    return transaction


def _needs_review(transaction: PaymentTransaction, reason: str) -> PaymentTransaction:
    transaction.status = PaymentStatus.NEEDS_REVIEW
    transaction.rejection_reason = reason
    transaction.processed_at = timezone.now()
    transaction.save(update_fields=["status", "rejection_reason", "processed_at", "updated_at"])
    return transaction


def _target_filter(transaction: PaymentTransaction) -> dict:
    if transaction.booking_id:
        return {"booking_id": transaction.booking_id}
    if transaction.team_booking_payment_id:
        return {"team_booking_payment_id": transaction.team_booking_payment_id}
    return {"solo_booking_hold_id": transaction.solo_booking_hold_id}


def _handle_verified_conflict(transaction: PaymentTransaction) -> PaymentTransaction:
    """A uniqueness constraint fired on the final VERIFIED save.
    Same reference used elsewhere -> reject (replay). This target
    (booking / team share / solo hold) already paid with a DIFFERENT
    reference -> real money moved twice, so it goes to manual review
    for a refund decision instead of a silent reject.
    """
    transaction.refresh_from_db()

    other = (
        PaymentTransaction.objects.filter(status=PaymentStatus.VERIFIED, **_target_filter(transaction))
        .exclude(id=transaction.id)
        .first()
    )
    same_payment = other is not None and (
        other.bank == transaction.bank and other.reference_number == transaction.reference_number
    )
    if other is not None and not same_payment:
        return _needs_review(transaction, "booking_already_paid_duplicate_payment")
    return _reject(transaction, "duplicate_transaction")


# ─────────────────────────────────────────────────────────────────────────────
# THE CHECKS (run after verify.et answered, or on a stored verify.et answer)
# ─────────────────────────────────────────────────────────────────────────────

def _apply_verification_result(
    *, transaction: PaymentTransaction, result_item: dict | None
) -> PaymentTransaction:
    """Order of checks:
      0. provider gave an answer / bank was reachable
      1. bank says success + verified
      2. currency is ETB
      3. RECEIVER NAME == account-holder name the super admin saved for
         this bank account
      4. PAYMENT TIME: not made more than MAX_PAYMENT_TIME_ALLOWED_HOURS
         before payment started
      5. amount equals what is owed
      6. sender name on the receipt matches the payer's profile name
         (CBE / BOA; a mismatch goes to manual review)
      7. save as VERIFIED (DB constraints block any reuse of the reference)
    """
    if result_item is None:
        return _reject(transaction, "no_result_from_provider")

    err = result_item.get("error")
    if isinstance(err, dict) and (err.get("retryable") or err.get("code") == "upstream_unavailable"):
        return _reject(transaction, "bank_unavailable")

    if result_item.get("status") != "success" or not result_item.get("verified"):
        return _reject(transaction, "not_verified")

    currency = (result_item.get("currency") or _response_get(result_item, "currency")).upper()
    if currency and currency != "ETB":
        return _reject(transaction, "currency_mismatch")

    # ── 3. receiver name ────────────────────────────────────────────────
    owner_account = transaction.owner_bank_account
    if owner_account is None:
        return _needs_review(transaction, "owner_account_missing")

    receiver_name = _receiver_name_from(result_item)
    if receiver_name:
        if not _names_match(owner_account.account_holder_name, receiver_name):
            logger.warning(
                "Payment %s rejected: receiver name %r does not match account holder %r",
                transaction.id, receiver_name, owner_account.account_holder_name,
            )
            return _reject(transaction, "receiver_name_mismatch")
    else:
        # This bank's answer carries no receiver name (some wallets): fall back to
        # verify.et's own account matcher against the settlementAccount we sent.
        match = result_item.get("settlementAccountMatch")
        if not isinstance(match, dict):
            return _needs_review(transaction, "receiver_name_missing_in_response")
        if not match.get("matched"):
            return _reject(transaction, "receiver_mismatch")

    # ── 4. payment time ─────────────────────────────────────────────────
    txn_time_raw = (
        result_item.get("transactionDateIsoUtc")
        or result_item.get("timestamp")
        or _response_get(result_item, "transactionDateIsoUtc")
    )
    txn_time = parse_datetime(txn_time_raw) if txn_time_raw else None
    if txn_time is None:
        return _needs_review(transaction, "timestamp_missing_in_response")

    now = timezone.now()
    if txn_time > now + timedelta(minutes=5):
        return _reject(transaction, "timestamp_in_future")

    reference_date = transaction.reference_date  # when payment STARTED
    earliest_allowed = reference_date - timedelta(hours=MAX_PAYMENT_TIME_ALLOWED_HOURS)
    if txn_time < earliest_allowed:
        logger.warning(
            "Payment %s rejected as transaction_too_old: paid at %s, payment started at %s, "
            "earliest allowed %s (limit %sh)",
            transaction.id, txn_time, reference_date, earliest_allowed, MAX_PAYMENT_TIME_ALLOWED_HOURS,
        )
        return _reject(transaction, "transaction_too_old")

    # ── 5. amount ───────────────────────────────────────────────────────
    raw_amount = result_item.get("amount")
    if raw_amount is None:
        raw_amount = result_item.get("amountValue")
    if raw_amount is None:
        return _needs_review(transaction, "amount_missing_in_response")
    try:
        amount_dec = Decimal(str(raw_amount))
    except InvalidOperation:
        return _reject(transaction, "amount_unreadable")
    if amount_dec != transaction.amount_expected:
        return _reject(transaction, "amount_mismatch")

    # ── 6. sender identity ──────────────────────────────────────────────
    identity_failure = _check_sender_identity(transaction, result_item or {})
    if identity_failure in _REVIEW_IDENTITY_REASONS:
        return _needs_review(transaction, identity_failure)  # a human decides; don't reject a genuine payer
    if identity_failure:
        return _reject(transaction, identity_failure)

    # ── 7. save ─────────────────────────────────────────────────────────
    # Store the bank's own canonical reference so the same payment can't be
    # re-submitted under a different spelling of its identifier.
    canonical = (result_item.get("referenceNumber") or "").strip().upper()
    if canonical:
        transaction.reference_number = canonical[:64]

    transaction.verified_amount = amount_dec
    transaction.verified_transaction_at = txn_time
    transaction.status = PaymentStatus.VERIFIED
    transaction.processed_at = now
    try:
        with db_transaction.atomic():
            transaction.save()
    except IntegrityError:
        return _handle_verified_conflict(transaction)

    _sync_team_booking_payment(transaction)
    _sync_solo_booking_hold(transaction)
    _notify_payer_of_completion(transaction)
    _remember_payer_suffix(transaction)
    return transaction


def _resolve_payment_target(*, booking=None, team_booking_payment=None, solo_booking_hold=None) -> dict:
    provided = [x for x in (booking, team_booking_payment, solo_booking_hold) if x is not None]
    if len(provided) != 1:
        raise PaymentValidationError("Provide exactly one payment target.")
    if booking is not None:
        return {"pitch_owner": booking.pitch.tenant.owner, "amount_expected": booking.total_price}
    if team_booking_payment is not None:
        from pitches.models import Pitch
        pitch = Pitch.objects.select_related("tenant").get(id=team_booking_payment.request.pitch_id)
        return {"pitch_owner": pitch.tenant.owner, "amount_expected": team_booking_payment.amount}
    return {"pitch_owner": solo_booking_hold.pitch.tenant.owner, "amount_expected": solo_booking_hold.total_price}


def _format_payment_when(selections: list) -> str:
    if not selections:
        return "the booked time"
    first = selections[0]
    try:
        start = parse_datetime(first["start_iso"])
        if start and timezone.is_naive(start):
            start = timezone.make_aware(start, timezone.get_current_timezone())
        label = timezone.localtime(start).strftime("%a, %d %b, %I:%M %p") if start else first.get("start_iso", "")
    except Exception:
        label = first.get("start_iso", "")
    if len(selections) > 1:
        label += f" (+{len(selections) - 1} more slot{'s' if len(selections) > 2 else ''})"
    return label


def _build_completion_context(transaction: PaymentTransaction) -> dict:
    """One shared source of truth for 'what does this completed
    payment mean', used both for the payer's notification text and
    for what the frontend's completion popup displays.
    """
    amount = transaction.verified_amount or transaction.amount_expected

    if transaction.solo_booking_hold_id:
        hold = transaction.solo_booking_hold
        return {
            "kind": "solo",
            "pitch_name": hold.pitch.name,
            "when_label": _format_payment_when(hold.selections),
            "amount": str(amount),
        }
    if transaction.team_booking_payment_id:
        request = transaction.team_booking_payment.request
        return {
            "kind": "team",
            "pitch_name": request.pitch_name,
            "team_name": request.team.name,
            "when_label": _format_payment_when(request.selections),
            "amount": str(amount),
        }
    return {
        "kind": "booking",
        "pitch_name": transaction.booking.pitch.name,
        "when_label": "",
        "amount": str(amount),
    }


def _notify_payer_of_completion(transaction: PaymentTransaction) -> None:
    ctx = _build_completion_context(transaction)
    if ctx["kind"] == "solo":
        body = f"You paid {ctx['amount']} Br for {ctx['pitch_name']}. Booked for {ctx['when_label']}."
    elif ctx["kind"] == "team":
        body = f"You paid {ctx['amount']} Br for {ctx['team_name']} at {ctx['pitch_name']} on {ctx['when_label']}."
    else:
        body = f"You paid {ctx['amount']} Br for {ctx['pitch_name']}."

    notify(
        recipient=transaction.payer,
        notification_type=NotificationType.PAYMENT_CONFIRMATION,
        title="Payment completed",
        body=body,
        data={"payment_transaction_id": str(transaction.id)},
        send_push=False,
    )


def get_pending_payment_completion_for_user(user):
    return (
        PaymentTransaction.objects.filter(
            payer=user, status=PaymentStatus.VERIFIED, completion_acknowledged=False
        )
        .order_by("-processed_at")
        .first()
    )


def get_payment_completion_payload(transaction: PaymentTransaction) -> dict:
    ctx = _build_completion_context(transaction)
    ctx["transaction_id"] = str(transaction.id)
    return ctx


def acknowledge_payment_completion(*, transaction_id, user) -> None:
    PaymentTransaction.objects.filter(id=transaction_id, payer=user).update(completion_acknowledged=True)


def _sync_solo_booking_hold(transaction: PaymentTransaction) -> None:
    if not transaction.solo_booking_hold_id or transaction.status != PaymentStatus.VERIFIED:
        return
    from bookings.services import finalize_solo_booking
    finalize_solo_booking(hold_id=transaction.solo_booking_hold_id)


def _sync_team_booking_payment(transaction: PaymentTransaction) -> None:
    """When a PaymentTransaction tied to a TeamBookingPayment reaches
    VERIFIED, this is the real-money confirmation that replaces the
    old fake pay_for_booking() stub.
    """
    if not transaction.team_booking_payment_id or transaction.status != PaymentStatus.VERIFIED:
        return

    mark_payment_verified_from_gateway(team_booking_payment_id=transaction.team_booking_payment_id)


def _last_digits(number: str, length: int) -> str:
    digits = re.sub(r"\D", "", number or "")
    return digits[-length:] if len(digits) >= length else ""


def _owner_suffix_for(sender_bank: str, owner_account) -> str:
    """Last digits of the PITCH OWNER's account / phone (CBE 8, BOA 5)."""
    length = SUFFIX_REQUIRED_BANKS.get(sender_bank)
    if not length:
        return ""
    digits = _last_digits(owner_account.account_number or owner_account.phone_number or "", length)
    if not digits:
        raise PaymentValidationError(
            "The pitch owner's account number for this bank looks incomplete. "
            "Please contact support so it can be corrected."
        )
    return digits


# Only a SAME-BANK CBE payment can be opened with the receiver's digits: CBE's receipt
# system only knows accounts that belong to CBE. For any other combination (CBE -> BOA,
# CBE -> telebirr, anything from BOA) the digits must be the PAYER's own account.
def _owner_digits_can_work(sender_bank: str, pay_to_bank: str) -> bool:
    return sender_bank == SupportedBank.CBE and pay_to_bank == SupportedBank.CBE


def _saved_suffix_for(payer, bank: str) -> str:
    """The digits we remembered for this player and bank, or ''.
    Reading them is a bonus: if the table is missing (migrations not run yet) or the
    database hiccups, the payment simply carries on without them."""
    try:
        with db_transaction.atomic():  # savepoint: a failed query cannot poison the request
            return (
                PayerBankSuffix.objects.filter(payer=payer, bank=bank)
                .values_list("suffix", flat=True).first() or ""
            )
    except DatabaseError:
        logger.warning(
            "Remembered account digits are unavailable - run `python manage.py migrate`. "
            "Continuing without them."
        )
        return ""


def _resolve_sender_suffix(*, payer, bank, pay_to_bank, owner_account, sender_account_number, typed_suffix):
    """-> (suffix, source). source: 'payer' | 'saved' | 'owner' | ''.
    Order: what the payer just typed -> digits we remembered from their last
    successful payment -> the owner's digits (CBE -> CBE only) -> ask the payer."""
    length = SUFFIX_REQUIRED_BANKS.get(bank)
    if not length:
        return "", ""

    typed = _last_digits(sender_account_number, length) or (
        typed_suffix if typed_suffix.isdigit() and len(typed_suffix) == length else ""
    )
    if (sender_account_number or typed_suffix) and not typed:
        raise PaymentValidationError("Please enter your full account number.")
    if typed:
        return typed, "payer"

    saved = _saved_suffix_for(payer, bank)
    if saved:
        return saved, "saved"

    if _owner_digits_can_work(bank, pay_to_bank):
        return _owner_suffix_for(bank, owner_account), "owner"

    raise AccountNumberRequired()


def _remember_payer_suffix(transaction: PaymentTransaction) -> None:
    """After a VERIFIED payment made with the PAYER's own digits, keep only those
    last digits (never the full number) so next time they are not asked again."""
    try:
        length = SUFFIX_REQUIRED_BANKS.get(transaction.bank)
        if not length or not transaction.account_suffix:
            return
        owner_digits = ""
        if transaction.owner_bank_account_id:
            try:
                owner_digits = _owner_suffix_for(transaction.bank, transaction.owner_bank_account)
            except PaymentValidationError:
                pass
        if transaction.account_suffix == owner_digits:
            return  # that was the owner's digits, nothing personal to remember
        with db_transaction.atomic():
            PayerBankSuffix.objects.update_or_create(
                payer_id=transaction.payer_id, bank=transaction.bank,
                defaults={"suffix": transaction.account_suffix},
            )
    except Exception:
        logger.exception("Could not remember the payer's account digits")


def get_saved_sender_banks(user) -> list:
    try:
        with db_transaction.atomic():
            return list(PayerBankSuffix.objects.filter(payer=user).values_list("bank", flat=True))
    except DatabaseError:
        logger.warning("Remembered account digits are unavailable - run `python manage.py migrate`.")
        return []


def _build_verify_payload(*, bank, reference_number, owner_account, account_suffix, phone_number) -> dict:
    payload = {
        "bank": bank,
        "reference": reference_number,
        "settlementAccount": owner_account.settlement_identifier,
    }
    if bank in SUFFIX_REQUIRED_BANKS and account_suffix:
        payload["suffix"] = account_suffix
    if bank in PAYER_PHONE_REQUIRED_BANKS:
        payload["phoneNumber"] = phone_number
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# STORED verify.et ANSWERS (so we never pay for / wait on the same lookup twice)
# ─────────────────────────────────────────────────────────────────────────────

def _first_result_item(data):
    """verify.et's status endpoint may return the result as a dict, a list,
    or nested under result/results/data. Always return ONE dict (or None)."""
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict):
        return None
    for key in ("result", "results", "data"):
        inner = data.get(key)
        if isinstance(inner, list):
            inner = inner[0] if inner else None
        if isinstance(inner, dict):
            return {**data, **inner}
    return data


def _extract_result_item(body):
    """One result dict out of a stored verify.et response body (sync or polled)."""
    if not isinstance(body, dict):
        return None
    item = _first_result_item(body.get("data")) if body.get("data") else None
    if item is None:
        verification = body.get("verification")
        if isinstance(verification, dict) and isinstance(verification.get("result"), dict):
            item = verification["result"]
    return item


def _find_stored_provider_result(*, bank: str, reference_number: str):
    """If we ALREADY hold a bank-confirmed answer for this bank + reference
    (from any earlier attempt, by anyone), return (body, result_item) so the
    checks can run on it WITHOUT calling verify.et again. Failures
    (e.g. 'bank unavailable') are never reused — only confirmed payments."""
    rows = (
        PaymentTransaction.objects
        .filter(bank=bank, reference_number=reference_number, verify_response__isnull=False)
        .order_by("-submitted_at")[:10]
    )
    for row in rows:
        item = _extract_result_item(row.verify_response)
        if item and item.get("verified") is True:
            result_item = dict(item)
            result_item["status"] = "success"
            return row.verify_response, result_item
    return None


# ─────────────────────────────────────────────────────────────────────────────
# OCR CROSS-CHECK
# ─────────────────────────────────────────────────────────────────────────────

# OCR commonly confuses visually similar characters, especially on a
# compressed phone screenshot — a byte-exact match is too brittle for
# a real receipt. Both sides of the comparison get normalized through
# this table before checking containment.
_OCR_CONFUSION_MAP = str.maketrans({
    "O": "0", "D": "0", "Q": "0",
    "I": "1", "L": "1",
    "S": "5",
    "B": "8",
    "Z": "2",
    "G": "6",
})


def _ocr_normalize(text: str) -> str:
    text = re.sub(r"\s+", "", text.upper())
    return text.translate(_OCR_CONFUSION_MAP)


def _reference_appears_in_receipt(reference_number: str, raw_text: str) -> bool:
    if not raw_text:
        return False
    return _ocr_normalize(reference_number) in _ocr_normalize(raw_text)


# ─────────────────────────────────────────────────────────────────────────────
# SUBMIT
# ─────────────────────────────────────────────────────────────────────────────

def submit_manual_bank_payment(
    *,
    payer,
    bank: str,
    screenshot,
    reference_number: str,
    account_suffix: str = "",
    phone_number: str = "",
    booking=None,
    team_booking_payment=None,
    solo_booking_hold=None,
    pay_to_bank: str = "",
    sender_account_number: str = "",
) -> PaymentTransaction:
    """`bank`       = the bank / wallet the payer paid FROM (its receipt is verified).
    `pay_to_bank` = which of the pitch owner's accounts was paid INTO (defaults to
    `bank`). They differ for cross-bank transfers, e.g. a CBE app paying a BOA account.
    """
    pay_to_bank = pay_to_bank or bank

    reference_number = (reference_number or "").strip().upper()
    if not reference_number:
        raise PaymentValidationError("reference_number is required.")

    if bank == SupportedBank.ZEMEN or pay_to_bank == SupportedBank.ZEMEN:
        raise PaymentValidationError(
            "Zemen Bank can't be verified automatically yet — ask the pitch owner for another bank/wallet."
        )

    # ── RULE 1: our own database FIRST ──────────────────────────────────
    # A reference that already belongs to a VERIFIED payment is refused here,
    # before OCR (CPU) and before verify.et (money / time). This is what stops
    # Player B from re-using Player A's transaction number.
    already_verified = PaymentTransaction.objects.filter(
        bank=bank, reference_number=reference_number, status=PaymentStatus.VERIFIED
    ).exists()
    if already_verified:
        raise DuplicateTransactionError("This transaction reference has already been used.")

    # Tie the typed reference number to what's actually IN the
    # uploaded image. Without this, any unrelated image plus a
    # manually-typed reference number sails straight through to
    # verify.et — verify.et only ever checks the reference string
    # itself, never the screenshot.
    screenshot.seek(0)
    try:
        ocr_check = extract_reference_from_image(image_file=screenshot, bank_hint=bank)
        ocr_available = True
    except Exception:
        logger.exception("OCR cross-check failed to run for a payment submission")
        ocr_check = {"raw_text": ""}
        ocr_available = False
    screenshot.seek(0)  # reset the pointer so the file can still be saved normally below

    if ocr_available and not _reference_appears_in_receipt(reference_number, ocr_check.get("raw_text", "")):
        logger.warning(
            "Receipt cross-check failed — typed reference %r not found in OCR text: %r",
            reference_number, ocr_check.get("raw_text", ""),
        )
        raise PaymentValidationError(
            "We couldn't find this transaction number in the uploaded screenshot. "
            "Please upload the actual payment confirmation screenshot."
        )
    if not ocr_available:
        logger.error(
            "OCR is unavailable — submitting payment WITHOUT the screenshot cross-check "
            "(reference=%r). Fix the OCR engine as soon as possible.",
            reference_number,
        )

    if bank in PAYER_PHONE_REQUIRED_BANKS and not phone_number:
        raise PaymentValidationError(f"{bank} requires a phone number.")

    # `account_suffix` is only filled by a payer who was asked for it after a failed
    # automatic attempt (see below); normally it stays empty.
    account_suffix = (account_suffix or "").strip()
    if bank not in PAYER_PHONE_REQUIRED_BANKS:
        phone_number = ""

    target = _resolve_payment_target(
        booking=booking, team_booking_payment=team_booking_payment, solo_booking_hold=solo_booking_hold
    )
    pitch_owner = target["pitch_owner"]
    amount_expected = target["amount_expected"]

    already_paid_qs = PaymentTransaction.objects.filter(status=PaymentStatus.VERIFIED)
    if booking is not None:
        already_paid_qs = already_paid_qs.filter(booking=booking)
    elif team_booking_payment is not None:
        already_paid_qs = already_paid_qs.filter(team_booking_payment=team_booking_payment)
    else:
        already_paid_qs = already_paid_qs.filter(solo_booking_hold=solo_booking_hold)
    if already_paid_qs.exists():
        raise PaymentValidationError("This has already been paid.")

    profile = getattr(pitch_owner, "payment_profile", None)
    if profile is None or profile.payment_mode != PaymentMode.MANUAL_BANK:
        raise PaymentValidationError("This pitch owner is not set up for manual bank payments.")

    owner_account = PitchOwnerBankAccount.objects.filter(
        owner=pitch_owner, bank=pay_to_bank, is_active=True
    ).first()
    if owner_account is None:
        raise PaymentValidationError("Pitch owner has no active account registered for this bank.")

    # The digits verify.et needs (CBE 8, BOA 5; wallets none): see _resolve_sender_suffix.
    account_suffix, suffix_source = _resolve_sender_suffix(
        payer=payer, bank=bank, pay_to_bank=pay_to_bank, owner_account=owner_account,
        sender_account_number=sender_account_number, typed_suffix=account_suffix,
    )
    _dbg(
        "──────── new payment ────────",
        f"paid from: {bank}  ->  paid to: {pay_to_bank}",
        f"account digits source: {suffix_source or 'not needed'}",
    )

    # Do we already hold a bank-confirmed answer for this reference?
    stored = _find_stored_provider_result(bank=bank, reference_number=reference_number)

    # A retry must ALWAYS be possible. Only a VERIFIED payment blocks a reference
    # (checked above). Any earlier attempt still PENDING/PROCESSING for this
    # reference (an abandoned tab, a poll that never finished, a crash...) is
    # closed here and replaced by this fresh attempt.
    now = timezone.now()
    try:
        with db_transaction.atomic():
            for old in PaymentTransaction.objects.select_for_update().filter(
                bank=bank,
                reference_number=reference_number,
                status__in=[PaymentStatus.PENDING, PaymentStatus.PROCESSING],
            ):
                # Never cancel ANOTHER payer's fresh attempt (someone could abuse that to
                # race for a payment that isn't theirs). Your own attempts, and anyone's
                # stale ones, are always replaced.
                if old.payer_id != payer.id and (now - old.submitted_at) < timedelta(minutes=STALE_PROCESSING_MINUTES):
                    raise DuplicateTransactionError(
                        "This transaction is being checked right now for another payment. "
                        "Please try again in a few minutes."
                    )
                _drop_screenshot_file(old)
                old.status = PaymentStatus.REJECTED
                old.rejection_reason = "superseded_by_retry"
                old.processed_at = now
                old.save(update_fields=["status", "rejection_reason", "processed_at", "screenshot", "updated_at"])
            transaction_row = PaymentTransaction.objects.create(
                booking=booking,
                team_booking_payment=team_booking_payment,
                solo_booking_hold=solo_booking_hold,
                payer=payer,
                pitch_owner=pitch_owner,
                amount_expected=amount_expected,
                payment_mode=PaymentMode.MANUAL_BANK,
                bank=bank,
                owner_bank_account=owner_account,
                screenshot=screenshot,
                reference_number=reference_number,
                account_suffix=account_suffix,
                payer_phone_number=phone_number,
                status=PaymentStatus.PENDING,
            )
    except IntegrityError:
        # Only possible if the very same reference was submitted in the same
        # instant; the next try goes through.
        raise DuplicateTransactionError(
            "This transaction is being checked right now. Please wait a few seconds and try again."
        )

    # ── stored answer: run every check on it, NO call to verify.et ──────
    if stored is not None:
        stored_body, stored_item = stored
        try:
            transaction_row.verify_request_id = (stored_body or {}).get("requestId", "") if isinstance(stored_body, dict) else ""
            transaction_row.verify_response = stored_body
            transaction_row.save(update_fields=["verify_request_id", "verify_response", "updated_at"])
            logger.info("Using stored verify.et answer for %s %s (no API call)", bank, reference_number)
            return _apply_verification_result(transaction=transaction_row, result_item=stored_item)
        except Exception:
            logger.exception("Failed applying stored verify.et answer for transaction %s", transaction_row.id)
            return _recover_or_discard(transaction_row)

    # ── no stored answer: call verify.et ────────────────────────────────
    payload = _build_verify_payload(
        bank=bank, reference_number=reference_number,
        owner_account=owner_account, account_suffix=account_suffix, phone_number=phone_number,
    )

    transaction_row.status = PaymentStatus.PROCESSING
    transaction_row.save(update_fields=["status", "updated_at"])

    try:
        response = _call_verify_et(payload=payload, idempotency_key=str(transaction_row.id))
    except requests.RequestException as exc:
        logger.exception("verify.et unreachable for transaction %s", transaction_row.id)
        _discard_row(transaction_row)
        raise PaymentProviderError("We couldn't reach the verification service. Please try again in a moment.")

    try:
        if response.status_code not in (200, 202):
            return _reject(transaction_row, f"provider_error_{response.status_code}")

        body = response.json()
        transaction_row.verify_request_id = body.get("requestId", "")
        transaction_row.verify_response = body
        transaction_row.save(update_fields=["verify_request_id", "verify_response", "updated_at"])

        if response.status_code == 202:
            return transaction_row

        data = body.get("data") or []
        result_item = data[0] if data else None
        return _apply_verification_result(transaction=transaction_row, result_item=result_item)
    except Exception:
        # ANY unexpected failure here — a malformed response, a bug
        # on our side, anything — must never leave a dead row sitting
        # around blocking retries. The dead attempt is removed so the payer
        # can retry at once (a VERIFIED payment is never removed).
        logger.exception("Unexpected error finishing verification for transaction %s", transaction_row.id)
        return _recover_or_discard(transaction_row)


# ─────────────────────────────────────────────────────────────────────────────
# QUEUED (202) PATH
# ─────────────────────────────────────────────────────────────────────────────

def _retry_verification(transaction):
    """The bank didn't answer verify.et (retryable). Send a NEW verification
    request automatically instead of failing the payer. Returns the updated
    transaction, or None when out of retries / can't retry."""
    prev = transaction.verify_response if isinstance(transaction.verify_response, dict) else {}
    retries = int(prev.get("_retries", 0))
    account = transaction.owner_bank_account
    if retries >= MAX_BANK_RETRIES or account is None:
        return None

    payload = _build_verify_payload(
        bank=transaction.bank,
        reference_number=transaction.reference_number,
        owner_account=account,
        account_suffix=transaction.account_suffix,
        phone_number=transaction.payer_phone_number,
    )

    try:
        response = _call_verify_et(
            payload=payload, idempotency_key=f"{transaction.id}-retry{retries + 1}"
        )
        if response.status_code not in (200, 202):
            logger.warning("verify.et retry returned %s: %s", response.status_code, response.text[:300])
            return None
        new_body = response.json()
    except (requests.RequestException, PaymentProviderError, ValueError):
        return None

    new_body["_retries"] = retries + 1
    transaction.verify_request_id = new_body.get("requestId", "")
    transaction.verify_response = new_body
    transaction.save(update_fields=["verify_request_id", "verify_response", "updated_at"])

    if response.status_code == 200:
        data = new_body.get("data") or []
        return _apply_verification_result(
            transaction=transaction, result_item=data[0] if data else None
        )
    return transaction  # queued again; the frontend keeps polling


def check_pending_payment(*, transaction: PaymentTransaction) -> PaymentTransaction:
    """For the 202/queued path (CBE usually lands here)."""
    if transaction.status != PaymentStatus.PROCESSING or not transaction.verify_request_id:
        return transaction

    if timezone.now() - transaction.submitted_at > timedelta(minutes=STALE_PROCESSING_MINUTES):
        return _needs_review(transaction, "provider_never_completed")

    try:
        response = _poll_verify_et(request_id=transaction.verify_request_id)
    except requests.RequestException:
        return transaction

    if response.status_code != 200:
        logger.warning("verify.et poll returned %s for %s", response.status_code, transaction.id)
        return transaction

    try:
        body = response.json()
    except ValueError:
        return transaction

    logger.info("verify.et poll body for %s: %s", transaction.id, body)

    data = _first_result_item(body.get("data") if isinstance(body, dict) else body)
    if data is None:
        return transaction

    processing = str(data.get("processingStatus") or data.get("processing_status") or "").lower()

    if processing in ("failed", "error"):
        err = data.get("error") if isinstance(data.get("error"), dict) else {}
        if err.get("retryable") or err.get("code") == "upstream_unavailable":
            retried = _retry_verification(transaction)
            if retried is not None:
                return retried
            transaction.verify_response = body
            transaction.save(update_fields=["verify_response", "updated_at"])
            return _reject(transaction, "bank_unavailable")
        transaction.verify_response = body
        transaction.save(update_fields=["verify_response", "updated_at"])
        return _reject(transaction, "no_result_from_provider")

    if processing != "completed":
        return transaction

    result_item = dict(data)
    result_item["status"] = "success" if data.get("verified") else (data.get("status") or "failed")
    result_item.setdefault("currency", "ETB")
    result_item["transactionDateIsoUtc"] = (
        data.get("transactionDateIsoUtc") or data.get("timestamp") or data.get("transactionDate")
    )

    transaction.verify_response = body
    return _apply_verification_result(transaction=transaction, result_item=result_item)


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN / SETUP
# ─────────────────────────────────────────────────────────────────────────────

def configure_payment_profile(
    *, owner, configured_by, payment_mode: str, gateway_provider: str = "", gateway_merchant_ref: str = ""
) -> PitchOwnerPaymentProfile:
    if payment_mode == PaymentMode.GATEWAY and not gateway_provider:
        raise PaymentValidationError("gateway_provider is required for GATEWAY mode.")
    if payment_mode != PaymentMode.GATEWAY:
        gateway_provider = ""
        gateway_merchant_ref = ""

    profile, _ = PitchOwnerPaymentProfile.objects.update_or_create(
        owner=owner,
        defaults={
            "payment_mode": payment_mode,
            "gateway_provider": gateway_provider,
            "gateway_merchant_ref": gateway_merchant_ref,
            "configured_by": configured_by,
            "configured_at": timezone.now(),
        },
    )
    return profile


def upsert_bank_account(
    *,
    owner,
    bank: str,
    account_holder_name: str,
    account_number: str = "",
    phone_number: str = "",
) -> PitchOwnerBankAccount:
    if bank in WALLET_BANKS and not phone_number:
        raise PaymentValidationError(f"{bank} requires a phone number.")
    if bank not in WALLET_BANKS and not account_number:
        raise PaymentValidationError(f"{bank} requires an account number.")

    # This name is what every payment's receiver is compared against, so it
    # must be a real full name exactly as the bank shows it.
    if len(_name_tokens(account_holder_name)) < 2:
        raise PaymentValidationError(
            "Enter the account holder's full name (at least two words) exactly as the bank shows it."
        )

    existing = PitchOwnerBankAccount.objects.filter(owner=owner, bank=bank, is_active=True).first()
    if existing:
        existing.account_holder_name = account_holder_name
        existing.account_number = account_number
        existing.phone_number = phone_number
        existing.save(update_fields=["account_holder_name", "account_number", "phone_number", "updated_at"])
        return existing

    return PitchOwnerBankAccount.objects.create(
        owner=owner,
        bank=bank,
        account_holder_name=account_holder_name,
        account_number=account_number,
        phone_number=phone_number,
    )


def deactivate_bank_account(*, bank_account: PitchOwnerBankAccount) -> PitchOwnerBankAccount:
    bank_account.is_active = False
    bank_account.save(update_fields=["is_active", "updated_at"])
    return bank_account


def get_payment_info_for_owner(*, owner) -> dict:
    """What a payer's checkout screen needs: which mode, and if
    MANUAL_BANK, the active accounts to pay into.
    """
    profile = getattr(owner, "payment_profile", None)
    mode = profile.payment_mode if profile else PaymentMode.NOT_CONFIGURED
    accounts = []
    if mode == PaymentMode.MANUAL_BANK:
        accounts = list(PitchOwnerBankAccount.objects.filter(owner=owner, is_active=True))
    return {"payment_mode": mode, "bank_accounts": accounts}


def resolve_needs_review(
    *, transaction: PaymentTransaction, resolved_by, approve: bool, note: str = ""
) -> PaymentTransaction:
    """Manual admin decision for a transaction the automated checks
    couldn't safely resolve either way (see NEEDS_REVIEW in
    _apply_verification_result). Deliberately requires a human and a
    note — this path exists precisely because the system refused to
    guess, so the resolution shouldn't be a silent one-click either.
    """
    if transaction.status != PaymentStatus.NEEDS_REVIEW:
        raise PaymentValidationError("Only a NEEDS_REVIEW transaction can be resolved this way.")
    if not note:
        raise PaymentValidationError("A note is required when resolving a manual review.")

    if approve:
        transaction.status = PaymentStatus.VERIFIED
        transaction.processed_at = timezone.now()
        transaction.rejection_reason = f"manual_review_approved:{resolved_by.id}:{note}"
        try:
            with db_transaction.atomic():
                transaction.save()
        except IntegrityError:
            transaction.refresh_from_db()
            raise PaymentValidationError(
                "Cannot approve: this booking already has a verified payment, or this reference was already used."
            )
        _sync_team_booking_payment(transaction)
        _sync_solo_booking_hold(transaction)
        return transaction

    transaction.status = PaymentStatus.REJECTED
    transaction.rejection_reason = f"manual_review_rejected:{resolved_by.id}:{note}"
    transaction.processed_at = timezone.now()
    transaction.save(update_fields=["status", "rejection_reason", "processed_at", "updated_at"])
    return transaction


_PHONE_RE = re.compile(r"^(?:\+?251|0)?([79][0-9]{8})$")


def normalize_ethiopian_phone(raw: str):
    cleaned = re.sub(r"[\s\-]", "", raw or "")
    match = _PHONE_RE.match(cleaned)
    return f"251{match.group(1)}" if match else None


def get_bank_requirement(bank: str) -> dict:
    """What the payer's form must ask for, per bank — single source of
    truth for the frontend, derived from the same constants the
    verification code uses, so the two can never drift apart.
    """
    needs_phone = bank in PAYER_PHONE_REQUIRED_BANKS
    return {
        "bank": bank,
        "label": SupportedBank(bank).label,
        "supported": bank != SupportedBank.ZEMEN,
        # The suffix is the pitch owner's and is added by the server, so the
        # payer's form never asks for it.
        "requires_account_suffix": False,
        "account_suffix_length": None,
        "account_suffix_help": "",
        "requires_phone_number": needs_phone,
        "phone_number_help": "The CBE Birr phone number you paid from." if needs_phone else "",
    }


def get_bank_requirements() -> list:
    return [get_bank_requirement(b.value) for b in SupportedBank]


def mark_payment_verified_from_gateway(*, team_booking_payment_id) -> None:
    """Called by the payment app the instant a REAL PaymentTransaction
    for this share reaches VERIFIED — this is the actual confirmation
    that money moved, replacing the old instant-fake pay_for_booking().
    """
    try:
        payment = TeamBookingPayment.objects.select_related("request").get(
            id=team_booking_payment_id, status=PaymentStatus.PENDING
        )
    except TeamBookingPayment.DoesNotExist:
        return

    payment.mark_paid()
    notify(
        recipient=payment.request.created_by,
        notification_type=NotificationType.TEAM_BOOKING_PAYMENT_RECEIVED,
        title="Payment received",
        body=f"{_display_name(payment.payer)} paid for {payment.request.pitch_name}.",
        data={"team_booking_request_id": str(payment.request.id)},
        send_push=False,
    )
    _try_finalize_if_all_paid(payment.request)



# ─────────────────────────────────────────────────────────────────────────────
# PITCH OWNER: "Payment Detail" table + approve / reject
# ─────────────────────────────────────────────────────────────────────────────

OWNER_TABLE_PAGE_SIZE = 10
OWNER_TABLE_FILTERS = {"all", "verified", "needs_review", "rejected"}


def payment_time_from_response(transaction: PaymentTransaction):
    """When the bank says the payment was made (works for rows still in review)."""
    if transaction.verified_transaction_at:
        return transaction.verified_transaction_at
    item = _extract_result_item(transaction.verify_response)
    if not item:
        return None
    raw = item.get("transactionDateIsoUtc") or item.get("timestamp") or _response_get(item, "transactionDateIsoUtc")
    return parse_datetime(raw) if raw else None


def _owner_visible_payments(pitch_id):
    """Every payment of ONE pitch the owner cares about: verified, waiting for
    review, and the ones the owner / admin rejected by hand. (Automatic rejections
    are just failed attempts and are not listed.)"""
    on_this_pitch = (
        Q(booking__pitch_id=pitch_id)
        | Q(team_booking_payment__request__pitch_id=str(pitch_id))  # stored as text there
        | Q(solo_booking_hold__pitch_id=pitch_id)
    )
    shown = Q(status__in=[PaymentStatus.VERIFIED, PaymentStatus.NEEDS_REVIEW]) | (
        Q(status=PaymentStatus.REJECTED)
        & (Q(rejection_reason__startswith="owner_rejected") | Q(rejection_reason__startswith="manual_review_rejected"))
    )
    return PaymentTransaction.objects.filter(on_this_pitch).filter(shown)


def _start_of_day(day):
    """Midnight (server time zone) at the start of a calendar date."""
    return timezone.make_aware(datetime.combine(day, datetime.min.time()), timezone.get_current_timezone())


def _apply_owner_table_filters(queryset, *, search: str, date_from, date_to):
    """Search: every word must match the player's first name, last name, phone, the
    transaction reference or the amount. Dates: from is INCLUDED, to is NOT included
    (so from 9 Nov, to 10 Nov = the 9th only). The date used is the time the payment
    was made (the bank's time when known, otherwise when it was submitted)."""
    for word in (search or "").split()[:6]:
        condition = (
            Q(payer__first_name__icontains=word)
            | Q(payer__last_name__icontains=word)
            | Q(payer__phone__icontains=word)
            | Q(reference_number__icontains=word)
        )
        digits = re.sub(r"\D", "", word)
        if len(digits) >= 7:  # 0911223344 must also find +251911223344
            condition |= Q(payer__phone__icontains=digits[-9:])
        try:
            amount = Decimal(word.replace(",", ""))
            if amount.is_finite() and abs(amount) < Decimal("100000000"):
                condition |= Q(verified_amount=amount) | Q(amount_expected=amount)
        except InvalidOperation:
            pass
        queryset = queryset.filter(condition)

    if date_from or date_to:
        queryset = queryset.annotate(_when=Coalesce("verified_transaction_at", "submitted_at"))
        if date_from:
            queryset = queryset.filter(_when__gte=_start_of_day(date_from))
        if date_to:
            queryset = queryset.filter(_when__lt=_start_of_day(date_to))
    return queryset


def list_pitch_payments(
    *, pitch_id, status_filter: str = "all", page: int = 1, page_size: int = OWNER_TABLE_PAGE_SIZE,
    search: str = "", date_from=None, date_to=None,
) -> dict:
    """3 queries in total (counts, page rows with payer / account / team joined in).
    The chip counts follow the search and the dates too."""
    status_filter = status_filter if status_filter in OWNER_TABLE_FILTERS else "all"
    page = max(int(page or 1), 1)

    base = _apply_owner_table_filters(
        _owner_visible_payments(pitch_id), search=search, date_from=date_from, date_to=date_to,
    )
    raw_counts = {row["status"]: row["n"] for row in base.values("status").annotate(n=Count("id"))}
    counts = {
        "verified": raw_counts.get(PaymentStatus.VERIFIED, 0),
        "needs_review": raw_counts.get(PaymentStatus.NEEDS_REVIEW, 0),
        "rejected": raw_counts.get(PaymentStatus.REJECTED, 0),
    }
    total = sum(counts.values()) if status_filter == "all" else counts[status_filter]

    rows_qs = base
    if status_filter != "all":
        rows_qs = rows_qs.filter(status=status_filter)

    offset = (page - 1) * page_size
    rows = list(
        rows_qs
        .select_related("payer", "owner_bank_account", "team_booking_payment__request__team")
        .annotate(_priority=Case(
            When(status=PaymentStatus.NEEDS_REVIEW, then=Value(0)),
            default=Value(1), output_field=IntegerField(),
        ))
        .order_by("_priority", "-submitted_at")[offset: offset + page_size]
    )
    return {"results": rows, "total": total, "page": page, "page_size": page_size, "counts": counts}


def _lock_owner_payment(transaction_id, owner) -> PaymentTransaction:
    try:
        return PaymentTransaction.objects.select_for_update().get(id=transaction_id, pitch_owner_id=owner.id)
    except PaymentTransaction.DoesNotExist:
        raise PaymentNotFound("Payment not found.")


def _ensure_can_become_verified(transaction: PaymentTransaction) -> None:
    if (
        PaymentTransaction.objects
        .filter(bank=transaction.bank, reference_number=transaction.reference_number, status=PaymentStatus.VERIFIED)
        .exclude(id=transaction.id)
        .exists()
    ):
        raise ReferenceAlreadyVerified(transaction.reference_number)
    if (
        PaymentTransaction.objects
        .filter(status=PaymentStatus.VERIFIED, **_target_filter(transaction))
        .exclude(id=transaction.id)
        .exists()
    ):
        raise PaymentValidationError("This booking / share is already paid by another verified payment.")


def owner_resolve_payment(*, transaction_id, owner, action: str) -> PaymentTransaction:
    """The pitch owner approves or rejects a payment that is waiting for review."""
    if action not in ("approve", "reject"):
        raise PaymentValidationError("Unknown action.")

    with db_transaction.atomic():
        transaction = _lock_owner_payment(transaction_id, owner)
        if transaction.status != PaymentStatus.NEEDS_REVIEW:
            raise PaymentValidationError("This payment is no longer waiting for review.")

        now = timezone.now()
        if action == "reject":
            _drop_screenshot_file(transaction)
            transaction.status = PaymentStatus.REJECTED
            transaction.rejection_reason = f"owner_rejected:{owner.id}"
            transaction.processed_at = now
            transaction.save(update_fields=["status", "rejection_reason", "processed_at", "screenshot", "updated_at"])
            return transaction

        _ensure_can_become_verified(transaction)

        item = _extract_result_item(transaction.verify_response) or {}
        raw_amount = item.get("amount") if item.get("amount") is not None else item.get("amountValue")
        try:
            transaction.verified_amount = Decimal(str(raw_amount)) if raw_amount is not None else transaction.amount_expected
        except InvalidOperation:
            transaction.verified_amount = transaction.amount_expected
        transaction.verified_transaction_at = payment_time_from_response(transaction)
        transaction.status = PaymentStatus.VERIFIED
        transaction.rejection_reason = f"owner_approved:{owner.id}"
        transaction.processed_at = now
        try:
            with db_transaction.atomic():
                transaction.save()
        except IntegrityError:
            _ensure_can_become_verified(transaction)  # raises the precise reason
            raise PaymentValidationError("This payment can't be approved because it conflicts with another one.")

    # booking / team-share follow-ups run after the row lock is released
    _sync_team_booking_payment(transaction)
    _sync_solo_booking_hold(transaction)
    _notify_payer_of_completion(transaction)
    return transaction


def owner_reverse_verified_payment(*, transaction_id, owner, password: str) -> PaymentTransaction:
    """The pitch owner changes a VERIFIED payment to REJECTED. Needs the owner's
    own account password (stored hashed, checked with Django's check_password).

    NOTE: this only changes the payment record. A team share already marked paid
    or a solo booking already created is NOT cancelled here - that belongs to the
    booking / team_booking services.
    """
    if not owner.check_password(password or ""):
        raise InvalidOwnerPassword("Incorrect password.")

    with db_transaction.atomic():
        transaction = _lock_owner_payment(transaction_id, owner)
        if transaction.status != PaymentStatus.VERIFIED:
            raise PaymentValidationError("Only a verified payment can be rejected this way.")
        transaction.status = PaymentStatus.REJECTED
        transaction.rejection_reason = f"owner_rejected_verified:{owner.id}"
        transaction.processed_at = timezone.now()
        transaction.save(update_fields=["status", "rejection_reason", "processed_at", "updated_at"])

    logger.warning(
        "Owner %s reversed VERIFIED payment %s (booking / share is NOT cancelled automatically).",
        owner.id, transaction.id,
    )
    return transaction