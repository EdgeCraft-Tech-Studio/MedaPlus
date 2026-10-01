from django.db import models


class SupportedBank(models.TextChoices):
    CBE = "cbe", "Commercial Bank of Ethiopia"
    BOA = "boa", "Bank of Abyssinia"
    TELEBIRR = "telebirr", "Telebirr"
    MPESA = "mpesa", "M-Pesa"
    CBEBIRR = "cbebirr", "CBE Birr"
    DASHEN = "dashen", "Dashen Bank"
    AWASH = "awash", "Awash Bank"
    SIINQEE = "siinqee", "Siinqee Bank"
    KAAFIEBIRR = "kaafiebirr", "Kaafi eBirr"
    ZEMEN = "zemen", "Zemen Bank"


class PaymentMode(models.TextChoices):
    NOT_CONFIGURED = "not_configured", "Not Configured"
    GATEWAY = "gateway", "Automated Gateway"
    MANUAL_BANK = "manual_bank", "Manual Bank Transfer"


class GatewayProvider(models.TextChoices):
    CHAPA = "chapa", "Chapa"
    SANTIMPAY = "santimpay", "SantimPay"
    ARIFPAY = "arifpay", "ArifPay"


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PROCESSING = "processing", "Processing"
    VERIFIED = "verified", "Verified"
    REJECTED = "rejected", "Rejected"
    NEEDS_REVIEW = "needs_review", "Needs Manual Review"
    EXPIRED = "expired", "Expired"
