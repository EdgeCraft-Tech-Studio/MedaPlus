from rest_framework.throttling import UserRateThrottle


class ReceiptExtractionThrottle(UserRateThrottle):
    """OCR is CPU work done on your server, not an external network
    wait — under concurrent abuse it competes for CPU directly with
    every other request being handled. Needs its own limit, separate
    from payment submission. Configure via
    DEFAULT_THROTTLE_RATES = {'receipt_extraction': '20/hour'}.
    """

    scope = "receipt_extraction"


class PaymentSubmitThrottle(UserRateThrottle):
    """Limits how many payment attempts one user can submit — each
    one calls the external verify.et API, which has its own rate
    limits/credits per your account.
    Configure via DEFAULT_THROTTLE_RATES = {'payment_submit': '30/hour'}.
    """

    scope = "payment_submit"
