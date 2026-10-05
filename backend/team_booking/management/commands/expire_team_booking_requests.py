from django.core.management.base import BaseCommand

from team_booking.services import (
    expire_stale_requests_and_notify_owners,
    sweep_payment_timeouts,
    sweep_pitch_conflicts_and_notify_owners,
)
from bookings.services import sweep_solo_booking_timeouts


class Command(BaseCommand):
    """Run every minute via cron:

        * * * * * cd /path/to/project && python manage.py expire_team_booking_requests
    """
    help = "Sweeps the 20-min confirm window, 10-min payment window, and solo booking holds."

    def handle(self, *args, **options):
        expire_stale_requests_and_notify_owners()
        sweep_payment_timeouts()
        sweep_pitch_conflicts_and_notify_owners()
        sweep_solo_booking_timeouts()
        self.stdout.write(self.style.SUCCESS("Team booking sweep complete."))