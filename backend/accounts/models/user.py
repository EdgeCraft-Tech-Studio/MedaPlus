from datetime import timedelta
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

# django-mongodb-backend==6.0.2
# Same rules as before: no Meta.indexes, no Meta.constraints, no db_index=True
# anywhere. id stays a UUIDField primary key.
#
# Latest change: USERNAME_FIELD switched from 'phone' to 'username'.
#   - Added `username` (unique=True) as the login identifier.
#   - REQUIRED_FIELDS now includes 'phone' (was just first_name/last_name),
#     since phone is still required/unique but is no longer USERNAME_FIELD,
#     so Django won't collect it automatically without being told to.
#   - get_by_natural_key() now looks up by username, not phone.
#   - create_user()/create_superuser()/created_user() now take `username`
#     as the primary identifier and `phone` as an explicit required arg
#     (previously phone was the primary identifier).
# Earlier fix, still in place: create_user()/create_superuser() set
# role/is_approved from extra_fields so OWNER accounts can be created
# through the manager, not just by hand-editing after create_user().


class UserQueryset(models.QuerySet):

    def is_active(self):
        return self.filter(active=True, deleted_at__isnull=True)

    def is_deleted(self, phone):
        return self.filter(phone=phone, deleted_at__isnull=False)

    def is_platform_admin(self):
        return self.filter(
            platform_admin=True,
            deleted_at__isnull=True
        )

    def is_admin(self):
        return self.filter(
            is_staff=True,
            deleted_at__isnull=True
        )

    def is_blocked(self):
        return self.filter(blocked_until__gt=timezone.now())

    def by_phone(self, phone):
        return self.filter(
            phone=phone,
            deleted_at__isnull=True
        )


class UserManager(BaseUserManager):

    def get_queryset(self):
        return UserQueryset(self.model, using=self._db)

    def get_by_natural_key(self, username):
        """Required by Django for createsuperuser command"""
        return self.get(username=username)

    def create_user(self, username, first_name, last_name, phone, password, **extra_fields):
        """Create and save a regular user"""
        if not username:
            raise ValueError('The username must be set')
        if not phone:
            raise ValueError('The Phone number must be set')
        if not first_name:
            raise ValueError('First name must be set')
        if not last_name:
            raise ValueError('Last name must be set')
        if not password:
            raise ValueError('Password must be set')

        user = self.model(
            username=username,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            password=password
        )

        # Set boolean/choice fields from extra_fields
        user.role = extra_fields.get('role', UserRole.PLAYER)
        user.is_approved = extra_fields.get('is_approved', False)
        user.platform_admin = extra_fields.get('platform_admin', False)
        user.is_staff = extra_fields.get('is_staff', False)
        user.active = extra_fields.get('active', True)
        user.must_change_password = extra_fields.get('must_change_password', True)
        user.is_superuser = extra_fields.get('is_superuser', False)

        user.save(using=self._db)
        return user

    def create_superuser(self, username, first_name, last_name, phone, password=None, **extra_fields):
        """Create and save a superuser"""
        extra_fields.setdefault('role', UserRole.ADMIN)
        extra_fields.setdefault('is_approved', True)
        extra_fields.setdefault('platform_admin', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('active', True)
        extra_fields.setdefault('must_change_password', False)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('platform_admin') is not True:
            raise ValueError('Superuser must have platform_admin=True.')
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(username, first_name, last_name, phone, password, **extra_fields)

    def created_user(
            self, first_name, last_name, username, phone, password, **extra_fields
    ):
        extra_fields.setdefault('platform_admin', False)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('must_change_password', False)
        return self.create_user(
            username, first_name, last_name, phone, password, **extra_fields
        )

    def is_active(self):
        return self.get_queryset().is_active()

    def is_deleted(self):
        return self.get_queryset().is_deleted()

    def is_platform_admin(self):
        return self.get_queryset().is_platform_admin()

    def by_phone(self, phone):
        return self.get_queryset().by_phone(phone)


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    OWNER = "OWNER", "Pitch Owner"
    PLAYER = "PLAYER", "Player"


class User(AbstractBaseUser, PermissionsMixin):

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.PLAYER)

    # Owners must be approved by admin before their pitches show publicly
    is_approved = models.BooleanField(default=False)

    first_name = models.CharField(max_length=50, null=False)
    last_name = models.CharField(max_length=50, null=False)
    username = models.CharField(
        max_length=20,
        unique=True,
    )
    phone = models.CharField(
        max_length=20,
        unique=True,
    )
    email = models.EmailField(null=True, blank=True, unique=True)
    profile_photo = models.ImageField(
        upload_to='profile_photos/%Y/%m/',
        null=True,
        blank=True,
        help_text='Profile photo — updated via PATCH /accounts/me/photo/'
    )
    password = models.CharField(max_length=128, blank=True, null=False)
    active = models.BooleanField(
        default=True,
        help_text=(
            'check if user can access our system'
        )
    )
    platform_admin = models.BooleanField(
        default=False,
        help_text=(
            'access everything bypass all thing'
        )
    )
    is_staff = models.BooleanField(
        default=False,
        help_text=(
            'Designates whether the user can log into this admin site.'
        )
    )
    must_change_password = models.BooleanField(
        default=True,
        help_text=(
            'force password change for admin when owner create them'
        )
    )
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    blocked_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            'login blocked until - auto-expire'
        )
    )
    last_login_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='last login to system'
    )
    last_login_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text='Ip last successful login'
    )
    created_by_user_id = models.UUIDField(
        null=True,
        blank=True,
        help_text=(
            'who create this account only for admin'
        )
    )
    last_failed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='soft delete data preserve, but user hidden from queries'
    )

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['first_name', 'last_name', 'phone']

    objects = UserManager()

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['first_name']
        # No indexes and no constraints — removed per your request.
        # NOTE: `username` is now unique=True because Django's auth system
        # requires USERNAME_FIELD to be unique (auth.E003) — not optional.
        # `phone` keeps unique=True too since you added it that way; it's
        # no longer forced by Django though, since it's not USERNAME_FIELD
        # anymore — drop it if you want soft-deleted users' phone numbers
        # to become reusable again.

    def __str__(self):
        try:
            return f'{self.first_name} {self.last_name} {self.phone}'
        except:
            return f'{self.phone}'

    # ---- overrides ----

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = UserRole.ADMIN
            self.is_approved = True
        super().save(*args, **kwargs)

    # ---- properties ----

    @property
    def get_short_name(self):
        """ Return the short name for the user. Required by Django admin """
        return self.first_name if self.first_name else self.last_name or "User"

    @property
    def full_name(self):
        """" return user full name """
        if self.first_name and self.last_name:
            return f'{self.first_name} {self.last_name}'

        elif self.first_name:
            return self.first_name

        elif self.last_name:
            return self.last_name

        return "Unknown User"

    @property
    def is_deleted(self):
        """ return boolean """
        return self.deleted_at is not None

    @property
    def is_blocked(self):
        """ return true if blocked """
        if self.blocked_until is None:
            return False
        return timezone.now() < self.blocked_until

    # ------- methods -------
    def soft_delete(self):
        """ data preserved but not exist on queries search """
        self.deleted_at = timezone.now()
        self.active = False
        self.save(update_fields=['deleted_at', 'active'])

    def restore(self):
        """ restore soft deleted user """
        if self.deleted_at is not None:
            self.deleted_at = None
            self.active = True
            self.save(update_fields=['deleted_at', 'active'])

    def block(self, until):
        self.blocked_until = until
        self.save(update_fields=["blocked_until"])

    def un_block(self):
        if self.blocked_until is not None:
            self.blocked_until = None
            self.active = True
            self.save(update_fields=['blocked_until', 'active'])

    def increment_failed_attempts(self):
        self.failed_attempts += 1
        self.last_failed_at = timezone.now()
        if self.failed_attempts >= 5:
            self.block(until=timezone.now() + timedelta(minutes=10))
        self.save(update_fields=["failed_attempts", "last_failed_at"])

    def reset_failed_attempts(self):
        """  """
        self.failed_attempts = 0
        self.save(update_fields=['failed_attempts'])

    def record_login(self, ip_address):
        """ recors of successful login """
        self.last_login_at = timezone.now()
        self.last_login_ip = ip_address
        self.reset_failed_attempts()
        self.un_block()
        self.save(update_fields=['last_login_at', 'last_login_ip', 'failed_attempts'])

    def force_password_change(self):
        """ force new password change for admin """
        self.must_change_password = True
        self.save(update_fields=['must_change_password'])

    def clear_password_change(self):
        """ clear force password """
        self.must_change_password = False
        self.save(update_fields=['must_change_password'])