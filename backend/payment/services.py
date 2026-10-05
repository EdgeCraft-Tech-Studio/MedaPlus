import re
import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings
from django.db import IntegrityError
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
    PaymentTransaction,
    PitchOwnerBankAccount,
    PitchOwnerPaymentProfile,
)

logger = logging.getLogger(__name__)

VERIFY_ET_BASE_URL = getattr(settings, "VERIFY_ET_BASE_URL", "https://verify.et")
VERIFY_ET_API_KEY = getattr(settings, "VERIFY_ET_API_KEY", "")
VERIFY_ET_TIMEOUT_SECONDS = 15
VERIFY_ET_WAIT_MS = 8000


def _call_verify_et(*, payload: dict, idempotency_key: str) -> requests.Response:
    if not VERIFY_ET_API_KEY:
        raise PaymentProviderError("VERIFY_ET_API_KEY is not configured.")
    return requests.post(
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


def _response_get(result_item: dict, *candidate_keys: str) -> str:
    """verify.et's JSON key casing isn't fully pinned down from the
    docs alone — try every reasonable variant of a field name rather
    than assuming one exact key.
    """
    for key in candidate_keys:
        if key in result_item and result_item[key] not in (None, ""):
            return str(result_item[key])
    return ""


def _check_sender_identity(transaction, result_item: dict) -> str:
    """Returns an empty string if the identity check passes (or isn't
    applicable), or a rejection reason string if it fails.

    This is what stops Player B from submitting Player A's real
    screenshot as their own payment: verify.et independently reports
    the real sender's account suffix in its response — this compares
    that against what the submitting payer actually typed in, which
    they'd only know if the account receiving/sending the money is
    genuinely theirs.
    """
    if transaction.bank not in SUFFIX_REQUIRED_BANKS:
        return ""  # wallets (phone-based) checked separately below

    if not transaction.account_suffix:
        return "sender_identity_mismatch"

    suffix_len = SUFFIX_REQUIRED_BANKS[transaction.bank]
    reported = _response_get(
        result_item, "accountSuffix", "account_suffix",
        "senderAccountLast4", "sender_account_last4",
    )
    if not reported:
        # verify.et didn't give us anything to check against — don't
        # silently pass; this bank is supposed to return this field.
        return "sender_identity_mismatch"

    # "Account Suffix" from CBE in your sample is 8 digits even
    # though the submitted suffix field is also 8 digits for CBE —
    # compare the LAST N digits of whichever is longer, since some
    # banks may return the suffix embedded in a longer account string.
    reported_tail = re.sub(r"\D", "", reported)[-suffix_len:]
    submitted_tail = re.sub(r"\D", "", transaction.account_suffix)[-suffix_len:]

    if reported_tail != submitted_tail:
        return "sender_identity_mismatch"
    return ""


def _poll_verify_et(*, request_id: str) -> requests.Response:
    return requests.get(
        f"{VERIFY_ET_BASE_URL}/api/verify/{request_id}",
        headers={"x-api-key": VERIFY_ET_API_KEY},
        timeout=VERIFY_ET_TIMEOUT_SECONDS,
    )


def _reject(transaction: PaymentTransaction, reason: str) -> PaymentTransaction:
    transaction.status = PaymentStatus.REJECTED
    transaction.rejection_reason = reason
    transaction.processed_at = timezone.now()
    transaction.save(update_fields=["status", "rejection_reason", "processed_at", "updated_at"])
    return transaction


def _needs_review(transaction: PaymentTransaction, reason: str) -> PaymentTransaction:
    transaction.status = PaymentStatus.NEEDS_REVIEW
    transaction.rejection_reason = reason
    transaction.processed_at = timezone.now()
    transaction.save(update_fields=["status", "rejection_reason", "processed_at", "updated_at"])
    return transaction


def _handle_verified_conflict(transaction: PaymentTransaction) -> PaymentTransaction:
    """A uniqueness constraint fired on the final VERIFIED save.
    Same reference used elsewhere -> reject (replay). Booking already
    paid with a DIFFERENT reference -> real money moved twice, so it
    goes to manual review for a refund decision instead of a silent reject.
    """
    transaction.refresh_from_db()
    other = (
        PaymentTransaction.objects.filter(booking=transaction.booking, status=PaymentStatus.VERIFIED)
        .exclude(id=transaction.id)
        .first()
    )
    same_payment = other is not None and (
        other.bank == transaction.bank and other.reference_number == transaction.reference_number
    )
    if other is not None and not same_payment:
        return _needs_review(transaction, "booking_already_paid_duplicate_payment")
    return _reject(transaction, "duplicate_transaction")


def _apply_verification_result(
    *, transaction: PaymentTransaction, result_item: dict | None
) -> PaymentTransaction:
    if result_item is None:
        return _reject(transaction, "no_result_from_provider")

    if result_item.get("status") != "success" or not result_item.get("verified"):
        return _reject(transaction, "not_verified")

    currency = (result_item.get("currency") or "").upper()
    if currency and currency != "ETB":
        return _reject(transaction, "currency_mismatch")

    # THE anti-scam check: verify.et's own settlement-account matcher,
    # not a receiver string we'd have to parse (and get wrong)
    # ourselves. A missing match object at all means we can't confirm
    # who received the money — never treated as a pass.
    match = result_item.get("settlementAccountMatch")
    if match is None:
        return _needs_review(transaction, "settlement_match_missing_in_response")
    if not match.get("matched"):
        return _reject(transaction, "receiver_mismatch")

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

    txn_time_raw = result_item.get("transactionDateIsoUtc") or result_item.get("timestamp")
    txn_time = parse_datetime(txn_time_raw) if txn_time_raw else None
    if txn_time is None:
        return _needs_review(transaction, "timestamp_missing_in_response")

    now = timezone.now()
    if txn_time > now + timedelta(minutes=5):
        return _reject(transaction, "timestamp_in_future")

    # The transaction date must match the DAY the booking was made —
    # not just "recent relative to now". Comparing to "now" instead of
    # the booking's own date would let someone submit a stale
    # screenshot days later and still pass, as long as they submitted
    # it "soon" after upload — the actual fraud case being guarded
    # against is an old real payment reused for an unrelated booking,
    # which only the booking's own date catches.
    #
    # ASSUMPTION FLAGGED: booking.created_at exists. Adjust if your
    # real Booking model names this field differently.
    reference_date = transaction.reference_date
    booking_date = timezone.localtime(reference_date).date()
    txn_date = timezone.localtime(txn_time).date()
    if txn_date != booking_date:
        return _reject(transaction, "transaction_date_mismatch")
    if abs((txn_time - reference_date).total_seconds()) > 36 * 3600:
        return _reject(transaction, "transaction_date_mismatch")

    identity_failure = _check_sender_identity(transaction, result_item or {})
    if identity_failure:
        return _reject(transaction, identity_failure)

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

def _sync_solo_booking_hold(transaction: PaymentTransaction) -> None:
    if not transaction.solo_booking_hold_id or transaction.status != PaymentStatus.VERIFIED:
        return
    from bookings.services import finalize_solo_booking
    finalize_solo_booking(hold_id=transaction.solo_booking_hold_id)




def _sync_team_booking_payment(transaction: PaymentTransaction) -> None:
    """When a PaymentTransaction tied to a TeamBookingPayment reaches
    VERIFIED, this is the real-money confirmation that replaces the
    old fake pay_for_booking() stub. Lazy import avoids a circular
    import between this app and team_booking.
    """
    if not transaction.team_booking_payment_id or transaction.status != PaymentStatus.VERIFIED:
        return

    mark_payment_verified_from_gateway(team_booking_payment_id=transaction.team_booking_payment_id)


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
) -> PaymentTransaction:
    
    reference_number = (reference_number or "").strip().upper()
    if not reference_number:
        raise PaymentValidationError("reference_number is required.")

    if bank == SupportedBank.ZEMEN:
        raise PaymentValidationError(
            "Zemen Bank can't be verified automatically yet — ask the pitch owner for another bank/wallet."
        )

    reference_number = (reference_number or "").strip().upper()
    if not reference_number:
        raise PaymentValidationError("reference_number is required.")
    
    # Tie the typed reference number to what's actually IN the
    # uploaded image. Without this, any unrelated image plus a
    # manually-typed reference number sails straight through to
    # verify.et — verify.et only ever checks the reference string
    # itself, never the screenshot. This is a REAL server-side
    # cross-check, not the earlier client-side OCR suggestion (which
    # the payer could freely overwrite).
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

    if bank in SUFFIX_REQUIRED_BANKS:
        expected_len = SUFFIX_REQUIRED_BANKS[bank]
        if not account_suffix or len(account_suffix) != expected_len or not account_suffix.isdigit():
            raise PaymentValidationError(f"{bank} requires an exact {expected_len}-digit account suffix.")
    if bank in PAYER_PHONE_REQUIRED_BANKS and not phone_number:
        raise PaymentValidationError(f"{bank} requires a phone number.")

    if bank not in SUFFIX_REQUIRED_BANKS:
        account_suffix = ""
    if bank not in PAYER_PHONE_REQUIRED_BANKS:
        phone_number = ""

    target = _resolve_payment_target(booking=booking, team_booking_payment=team_booking_payment, solo_booking_hold=solo_booking_hold)
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
        owner=pitch_owner, bank=bank, is_active=True
    ).first()
    if owner_account is None:
        raise PaymentValidationError("Pitch owner has no active account registered for this bank.")

    already_verified = PaymentTransaction.objects.filter(
        bank=bank, reference_number=reference_number, status=PaymentStatus.VERIFIED
    ).exists()
    if already_verified:
        raise DuplicateTransactionError("This transaction reference has already been used.")

    already_in_flight = PaymentTransaction.objects.filter(
        bank=bank,
        reference_number=reference_number,
        status__in=[PaymentStatus.PENDING, PaymentStatus.PROCESSING],
    ).exists()
    if already_in_flight:
        raise DuplicateTransactionError("A verification for this transaction is already in progress.")

    try:
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
        raise DuplicateTransactionError(
            "A verification for this transaction is already in progress or completed."
        )

    payload = {
        "bank": bank,
        "reference": reference_number,
        "settlementAccount": owner_account.settlement_identifier,
    }
    if bank in SUFFIX_REQUIRED_BANKS:
        payload["suffix"] = account_suffix
    if bank in PAYER_PHONE_REQUIRED_BANKS:
        payload["phoneNumber"] = phone_number

    transaction_row.status = PaymentStatus.PROCESSING
    transaction_row.save(update_fields=["status", "updated_at"])

    try:
        response = _call_verify_et(payload=payload, idempotency_key=str(transaction_row.id))
    except requests.RequestException as exc:
        transaction_row.status = PaymentStatus.PENDING
        transaction_row.rejection_reason = "provider_unreachable"
        transaction_row.save(update_fields=["status", "rejection_reason", "updated_at"])
        logger.exception("verify.et unreachable for transaction %s", transaction_row.id)
        raise PaymentProviderError(str(exc))

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
        # around blocking retries. Reverting to PENDING alone wasn't
        # enough: the already_in_flight check treats PENDING as
        # "still in progress" too, so the payer got permanently stuck
        # even though their real payment may have gone through fine.
        # Deleting the row entirely frees the reference number for an
        # immediate clean retry.
        logger.exception("Unexpected error finishing verification for transaction %s", transaction_row.id)
        transaction_row.delete()
        raise PaymentProviderError("Something went wrong while verifying this payment. Please try again.")



def check_pending_payment(*, transaction: PaymentTransaction) -> PaymentTransaction:
    """For the 202/queued path. Re-map the status endpoint's shape
    into the same shape _apply_verification_result expects. The
    documented example for this endpoint is thinner than the
    synchronous response — if the real response is missing
    settlementAccountMatch/amount, this correctly lands on
    NEEDS_REVIEW rather than guessing either way.
    """
    if transaction.status != PaymentStatus.PROCESSING or not transaction.verify_request_id:
        return transaction

    try:
        response = _poll_verify_et(request_id=transaction.verify_request_id)
    except requests.RequestException:
        return transaction

    if response.status_code != 200:
        return transaction

    body = response.json()
    data = body.get("data") or {}
    if data.get("processingStatus") != "completed":
        return transaction

    result_item = {
        "status": data.get("status"),
        "verified": data.get("verified"),
        "currency": data.get("currency", "ETB"),
        "amount": data.get("amount"),
        "settlementAccountMatch": data.get("settlementAccountMatch"),
        "transactionDateIsoUtc": data.get("completedAt"),
    }
    transaction.verify_response = body
    return _apply_verification_result(transaction=transaction, result_item=result_item)


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
    suffix_length = SUFFIX_REQUIRED_BANKS.get(bank)
    needs_phone = bank in PAYER_PHONE_REQUIRED_BANKS
    return {
        "bank": bank,
        "label": SupportedBank(bank).label,
        "supported": bank != SupportedBank.ZEMEN,
        "requires_account_suffix": suffix_length is not None,
        "account_suffix_length": suffix_length,
        "account_suffix_help": (
            f"Last {suffix_length} digits of the account you paid from." if suffix_length else ""
        ),
        "requires_phone_number": needs_phone,
        "phone_number_help": "The CBE Birr phone number you paid from." if needs_phone else "",
    }


def get_bank_requirements() -> list:
    return [get_bank_requirement(b.value) for b in SupportedBank]


def mark_payment_verified_from_gateway(*, team_booking_payment_id) -> None:
    """Called by the payment app once a REAL PaymentTransaction for
    this share reaches VERIFIED. This is what actually confirms money
    moved — it replaces the old pay_for_booking() stub, which just
    faked a payment instantly with no real verification behind it.
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