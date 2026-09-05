from django.core.management.base import BaseCommand

from team_booking.services import (
    expire_stale_requests_and_notify_owners,
    sweep_payment_timeouts,
)


class Command(BaseCommand):
    """Run every minute via cron:

        * * * * * cd /path/to/project && python manage.py expire_team_booking_requests
    """
    help = "Sweeps both the 20-min confirm window and the 10-min payment window."
 
    def handle(self, *args, **options):
        expire_stale_requests_and_notify_owners()
        sweep_payment_timeouts()
        self.stdout.write(self.style.SUCCESS("Team booking sweep complete."))