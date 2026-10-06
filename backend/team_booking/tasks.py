from celery import shared_task

from .services import (
    expire_stale_requests_and_notify_owners,
    sweep_payment_timeouts,
    sweep_pitch_conflicts_and_notify_owners,
)
from bookings.services import sweep_solo_booking_timeouts


@shared_task
def team_booking_sweep():
    expire_stale_requests_and_notify_owners()
    sweep_payment_timeouts()
    sweep_pitch_conflicts_and_notify_owners()
    sweep_solo_booking_timeouts()