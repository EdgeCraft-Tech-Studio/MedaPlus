from django.contrib.auth import get_user_model
from django.db.models import Q
from django.db.models.functions import Lower

from ..models import TeamMembership


import re

PHONE_RE = re.compile(r"^\+251[79]\d{8}$")


def normalize_ethiopian_phone(raw: str) -> str | None:
    """Accepts 09XXXXXXXX, 07XXXXXXXX, 2519XXXXXXXX, 2517XXXXXXXX,
    or already-formatted +2519XXXXXXXX / +2517XXXXXXXX, and returns
    the canonical +2519XXXXXXXX / +2517XXXXXXXX form used in the DB.
    Returns None if the input doesn't resolve to a valid Ethiopian
    mobile number shape.
    """
    raw = raw.strip()
    if not raw:
        return None

    digits_only = re.sub(r"[^\d]", "", raw)

    if raw.startswith("+"):
        candidate = "+" + digits_only
    elif digits_only.startswith("251") and len(digits_only) == 12:
        candidate = "+" + digits_only
    elif digits_only.startswith("0") and len(digits_only) == 10:
        candidate = "+251" + digits_only[1:]
    else:
        return None

    return candidate if PHONE_RE.fullmatch(candidate) else None

User = get_user_model()

MAX_SEARCH_RESULTS = 20


def search_users_for_invite(*, team, query: str):
    """Exact, case-insensitive match on username/first_name/last_name
    (via Lower() expression indexes)

    Excludes anyone already an ACTIVE member of `team`
    """
    query_lower = query.lower()

    conditions = (
        Q(username_lower=query_lower)
        | Q(first_name_lower=query_lower)
        | Q(last_name_lower=query_lower)
    )

    normalized_phone = normalize_ethiopian_phone(query)
    if normalized_phone:
        conditions |= Q(phone=normalized_phone)

    active_member_ids = TeamMembership.objects.active_for_team(team).values_list(
        "user_id", flat=True
    )

    return (
        User.objects.is_active()
        .annotate(
            username_lower=Lower("username"),
            first_name_lower=Lower("first_name"),
            last_name_lower=Lower("last_name"),
        )
        .filter(conditions)
        .exclude(id__in=active_member_ids)
        .order_by("first_name", "last_name")[:MAX_SEARCH_RESULTS]
    )