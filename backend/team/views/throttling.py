from rest_framework.throttling import UserRateThrottle


class InvitationCreateThrottle(UserRateThrottle):
    """Applies to creating DIRECT/LINK/CODE invitations. Without this,
    a single compromised or malicious owner account can spam every
    user on the platform with direct invitations, or mint unlimited
    reusable links. Configure the actual rate in settings via
    DEFAULT_THROTTLE_RATES = {'invitation_create': '30/hour'}.
    """

    scope = "invitation_create"


class CodeRedemptionThrottle(UserRateThrottle):
    """Applies specifically to the 'enter a join code' endpoint.
    Join codes (e.g. 'LIONS-82KF') are short and human-typeable by
    design (§14) — which also makes them guessable. As the platform
    grows and more codes exist concurrently, brute-forcing one by
    submitting random guesses becomes a real attack a single
    per-invitation rate limit can't stop (the attacker just tries a
    different code each time). This throttle limits how many *guess
    attempts total* one authenticated user can make, independent of
    which code they're guessing.
    Configure via DEFAULT_THROTTLE_RATES = {'code_redeem': '10/min'}.
    """

    scope = "code_redeem"


class JoinRequestCreateThrottle(UserRateThrottle):
    """Prevents a user from mass-spamming join requests across many
    teams (or repeatedly cancel+recreate to bump themselves back to
    the top of an owner's review queue).
    Configure via DEFAULT_THROTTLE_RATES = {'join_request_create': '50/day'}.
    """

    scope = "join_request_create"
