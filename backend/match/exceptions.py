class MatchServiceError(Exception):
    pass


class MatchScheduleConflictError(MatchServiceError):
    """A team or a player already has a CONFIRMED commitment that
    overlaps the requested time window.
    """


class MatchNotJoinableError(MatchServiceError):
    """Match isn't OPEN, is the wrong type for the action, or has no
    remaining capacity.
    """


class MatchFullError(MatchServiceError):
    pass
