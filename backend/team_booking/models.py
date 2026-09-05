import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class TeamBookingRequestStatus(models.TextChoices):
    PENDING = "pending", "Pending"                       # 20-min play-confirmation window open
    EXPIRED = "expired", "Expired"                        # window closed, owner hasn't acted yet
    PAYMENT_PENDING = "payment_pending", "Payment Pending"  # 10-min payment window open, slots held
    BOOKED = "booked", "Booked"                            # fully paid, real Booking rows created
    UNAVAILABLE = "unavailable", "Pitch Unavailable"        # owner tried to finalize, slot was taken
    CANCELLED = "cancelled", "Cancelled"


class MemberConfirmationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    DECLINED = "declined", "Declined"


class TeamBookingRequestQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(status=TeamBookingRequestStatus.PENDING)

    def expired_but_not_marked(self):
        return self.pending().filter(expires_at__lte=timezone.now())

    def for_team(self, team):
        return self.filter(team=team)


TeamBookingRequestManager = models.Manager.from_queryset(TeamBookingRequestQuerySet)


class TeamBookingRequest(models.Model):
    """One row per 'owner picked a team and hit Confirm' action from
    PitchDetail's booking popup. This is a POLL to the team asking who
    can play — NOT a confirmed pitch booking. Creating a real Booking
    row (payment, real availability lock) is deliberately deferred to
    later work, so a request nobody confirms never touches those
    tables at all.

    `pitch_id` / `pitch_name` are stored loosely (id + snapshot string)
    rather than a real FK to the pitches app, to keep this app
    independent of that app's model location. Swap to a real FK later
    if you want DB-level referential integrity.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    pitch_id = models.CharField(max_length=64)
    pitch_name = models.CharField(max_length=200)

    team = models.ForeignKey(
        "team.Team", on_delete=models.CASCADE, related_name="booking_requests"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_booking_requests_created",
    )

    booking_type = models.CharField(max_length=10)  # HOURLY / WEEKLY / MONTHLY
    selections = models.JSONField(default=list)  # [{"start_iso": ..., "end_iso": ...}, ...]
    notes = models.TextField(blank=True, default="")

    price_per_member = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    member_count_at_creation = models.PositiveIntegerField()

    status = models.CharField(
        max_length=16,
        choices=TeamBookingRequestStatus.choices,
        default=TeamBookingRequestStatus.PENDING,
    )

    # ---- 20-minute play-confirmation window ----
    expires_at = models.DateTimeField()
    summary_sent = models.BooleanField(default=False)
    # Set True once the owner has SEEN the post-20-min summary popup
    # and either started payment or is still deciding. Prevents the
    # same mandatory popup from re-appearing after they've moved past
    # it into the payment phase.
    owner_action_taken = models.BooleanField(default=False)

    # ---- 10-minute payment window ----
        # ---- payment window (10 min initially; 5 min for a "remind"
    # round; 10 min again for a "recalculate" round) ----
    payment_started_at = models.DateTimeField(null=True, blank=True)
    payment_expires_at = models.DateTimeField(null=True, blank=True)
    payment_round = models.PositiveIntegerField(default=1)
    # True once payment_expires_at has passed with unpaid members
    # still outstanding — drives the mandatory owner popup.
    payment_timeout_needs_owner_action = models.BooleanField(default=False)

    final_booking_code = models.CharField(max_length=12, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TeamBookingRequestManager()

    class Meta:
        db_table = "team_booking_request"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["team", "status"]),
            models.Index(fields=["status", "expires_at"]),
        ]

    def __str__(self):
        return f"TeamBookingRequest({self.pitch_name} / team={self.team_id} / {self.status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def mark_expired(self, *, save: bool = True) -> None:
        self.status = TeamBookingRequestStatus.EXPIRED
        if save:
            self.save(update_fields=["status", "updated_at"])

    @property
    def is_payment_expired(self) -> bool:
        return bool(self.payment_expires_at) and timezone.now() >= self.payment_expires_at


class TeamBookingConfirmationQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(status=MemberConfirmationStatus.PENDING)

    def for_user(self, user):
        return self.filter(member=user)


TeamBookingConfirmationManager = models.Manager.from_queryset(TeamBookingConfirmationQuerySet)


class TeamBookingConfirmation(models.Model):
    """One row per team member per TeamBookingRequest — the 'can you
    play?' state for that specific person. Created for every ACTIVE
    member at request-creation time, including the owner (who is
    auto-confirmed since they're the one who asked).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    request = models.ForeignKey(
        TeamBookingRequest, on_delete=models.CASCADE, related_name="confirmations"
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_booking_confirmations",
    )

    status = models.CharField(
        max_length=10,
        choices=MemberConfirmationStatus.choices,
        default=MemberConfirmationStatus.PENDING,
    )
    responded_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = TeamBookingConfirmationManager()

    class Meta:
        db_table = "team_booking_confirmation"
        constraints = [
            models.UniqueConstraint(
                fields=["request", "member"], name="uniq_confirmation_per_request_member"
            ),
        ]
        indexes = [
            models.Index(fields=["member", "status"]),
            models.Index(fields=["request", "status"]),
        ]

    def __str__(self):
        return f"{self.member_id} -> {self.request_id} ({self.status})"

    def mark_confirmed(self, *, save: bool = True) -> None:
        self.status = MemberConfirmationStatus.CONFIRMED
        self.responded_at = timezone.now()
        if save:
            self.save(update_fields=["status", "responded_at"])

    def mark_declined(self, *, save: bool = True) -> None:
        self.status = MemberConfirmationStatus.DECLINED
        self.responded_at = timezone.now()
        if save:
            self.save(update_fields=["status", "responded_at"])


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"
    COVERED_BY_OWNER = "covered_by_owner", "Covered by Owner"
    EXCLUDED = "excluded", "Excluded"  # didn't pay, team recalculated without them


class TeamBookingPaymentQuerySet(models.QuerySet):
    def for_request(self, request):
        return self.filter(request=request)

    def for_user(self, user):
        return self.filter(payer=user)

    def unpaid(self):
        return self.filter(status=PaymentStatus.PENDING)


TeamBookingPaymentManager = models.Manager.from_queryset(TeamBookingPaymentQuerySet)


class TeamBookingPayment(models.Model):
    """One row per person who owes money for a TeamBookingRequest —
    created only for members whose TeamBookingConfirmation is
    CONFIRMED, plus one row for the owner. Declined/non-responding
    members never get a row here; their share is folded directly
    into the owner's `amount` when the owner chooses to cover them
    (see services.start_payment_phase).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    request = models.ForeignKey(
        TeamBookingRequest, on_delete=models.CASCADE, related_name="payments"
    )
    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="team_booking_payments"
    )
    is_owner = models.BooleanField(default=False)

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    paid_at = models.DateTimeField(null=True, blank=True)

    # A "round" is one payment attempt cycle. Round 1 is the original
    # 10-min window. If the owner recalculates after a timeout, paid
    # members get a NEW row at round+1 for their top-up share — their
    # original round-1 row stays PAID untouched, so the record of what
    # they already paid is never overwritten or lost.
    round = models.PositiveIntegerField(default=1)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = TeamBookingPaymentManager()

    class Meta:
        db_table = "team_booking_payment"
        constraints = [
            models.UniqueConstraint(
                fields=["request", "payer", "round"], name="uniq_payment_per_request_payer_round"
            ),
        ]
        indexes = [
            models.Index(fields=["request", "status"]),
            models.Index(fields=["payer", "status"]),
        ]

    def __str__(self):
        return f"{self.payer_id} owes {self.amount} for {self.request_id} ({self.status})"

    def mark_paid(self, *, save: bool = True) -> None:
        self.status = PaymentStatus.PAID
        self.paid_at = timezone.now()
        if save:
            self.save(update_fields=["status", "paid_at"])

    def mark_covered(self, *, save: bool = True) -> None:
        self.status = PaymentStatus.COVERED_BY_OWNER
        self.paid_at = timezone.now()
        if save:
            self.save(update_fields=["status", "paid_at"])