class TeamServiceError(Exception):
    """Base class for all teams-domain service errors. Catch this in
    views/serializers to translate into an appropriate HTTP response,
    instead of catching bare Exception.
    """


class RosterFullError(TeamServiceError):
    """Raised when an operation would push a team's active member
    count past max_roster_size.
    """


class TeamPrivateError(TeamServiceError):
    """Raised when a public join-request pathway is attempted against
    a PRIVATE team.
    """


class AlreadyMemberError(TeamServiceError):
    """Raised when the target user already has an ACTIVE membership
    on the team.
    """


class DuplicatePendingRequestError(TeamServiceError):
    """Raised when a user already has a PENDING join request or a
    PENDING direct invitation for the same team.
    """


class InvitationNotRedeemableError(TeamServiceError):
    """Raised when accepting/declining an invitation that is not
    PENDING, or is PENDING but expired.
    """


class NotTeamOwnerError(TeamServiceError):
    """Raised when an action requires OWNER role and the acting
    membership does not have it.
    """


class InsufficientPermissionError(TeamServiceError):
    """Raised when an action requires OWNER/ADMIN management
    permissions and the acting membership does not have them.
    """


class OwnerMustTransferBeforeLeavingError(TeamServiceError):
    """Raised when the OWNER attempts to leave without transferring
    ownership first.
    """
