import firebase_admin
from django.conf import settings
from firebase_admin import credentials

_initialized = False


def ensure_firebase_initialized() -> None:
    """Lazy, idempotent init — only runs the first time a push is
    actually attempted, not at Django startup, so a project that
    never sends a push never needs valid Firebase credentials just
    to boot (useful for local dev without a service account file).

    Requires FIREBASE_CREDENTIALS_PATH in settings, pointing at your
    Firebase service account JSON. Not set up for you here since I
    don't have that file or its path — add it to settings before
    this is called for real.
    """
    global _initialized
    if _initialized:
        return
    if not firebase_admin._apps:
        cred_path = getattr(settings, "FIREBASE_CREDENTIALS_PATH", None)
        if not cred_path:
            raise RuntimeError(
                "FIREBASE_CREDENTIALS_PATH is not set in settings — "
                "point it at your Firebase service account JSON file."
            )
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    _initialized = True
