import logging

from rest_framework import status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def session_required(view_method):
    """
    Decorator for views that need request.current_session.

    WHY THIS EXISTS IN core/utils/decorators.py:
    Both ChangePasswordView and ConfirmPhoneChangeView in profile_views.py
    need it, AND LogoutView in auth_views.py needs it too.
    Defining it in either views file and importing it into the other
    causes a circular import. Defining it here gives every app
    clean access with no circular dependency.

    WHAT IT DOES:
    - Reads request.current_session via getattr — never raises AttributeError
    - If None → returns 401 with diagnostic message telling developer
      exactly which middleware to check
    - If present → sets it back on request and calls the view method normally

    USAGE:
        from core.utils.decorators import session_required

        class MyView(APIView):
            @session_required
            def post(self, request):
                session = request.current_session  # guaranteed here
    """
    def wrapper(self, request, *args, **kwargs):
        session = getattr(request, 'current_session', None)
        if not session:
            logger.error(
                f'{self.__class__.__name__}: request.current_session is not set. '
                f'Verify that SessionAuthMiddleware is listed in settings.MIDDLEWARE '
                f'and is running before this view is reached.'
            )
            return Response(
                {'detail': 'Session not found. Please login again.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        request.current_session = session
        return view_method(self, request, *args, **kwargs)

    # Preserve the original method name and docstring.
    # Without these, Django URL resolver and DRF schema generation
    # see a function named 'wrapper' instead of 'post' or 'patch'
    # which breaks reverse() calls and API documentation.
    wrapper.__name__ = view_method.__name__
    wrapper.__doc__  = view_method.__doc__
    return wrapper