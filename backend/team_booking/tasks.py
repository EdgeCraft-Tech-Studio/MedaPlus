from celery import shared_task

from .services import (
    expire_stale_requests_and_notify_owners,
    sweep_payment_timeouts,
    sweep_pitch_conflicts_and_notify_owners,
)


@shared_task
def team_booking_sweep():
    expire_stale_requests_and_notify_owners()
    sweep_payment_timeouts()
    sweep_pitch_conflicts_and_notify_owners()