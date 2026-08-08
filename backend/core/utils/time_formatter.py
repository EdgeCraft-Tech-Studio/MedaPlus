from django.utils import timezone


def format_lockout_duration(locked_until):
    """
    Returns a short human string showing only ONE unit — hours, minutes,
    or seconds, whichever fits best. Never mixes units (no '3 minutes
    20 seconds'). Capped at 1 hour max.
    """
    remaining = locked_until - timezone.now()
    total_seconds = max(0, int(remaining.total_seconds()))
    total_seconds = min(total_seconds, 3600)  # hard cap at 1 hour

    if total_seconds >= 3600:
        return "1 hour"

    if total_seconds >= 60:
        minutes = -(-total_seconds // 60)  # ceiling division, so 61s -> 2 minutes, not 1
        return f"{minutes} minute{'s' if minutes != 1 else ''}"

    return f"{total_seconds} second{'s' if total_seconds != 1 else ''}"