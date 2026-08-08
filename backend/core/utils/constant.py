from django.db import models


class REVOKE_REASON_CHOICES(models.TextChoices):
    
    REVOKE_LOGOUT = 'logout', 'User Logout'
    REVOKE_PASSWORD_CHANGE = 'password_change', 'Password Changed'
    REVOKE_ADMIN_ACTION = 'admin_action', 'Admin Action'
    REVOKE_SESSION_CONFLICT = 'session_conflict', 'Session Conflict — New Device Login'
    REVOKE_SCHOOL_SUSPENDED = 'school_suspended', 'School Suspended'
    REVOKE_ORG_SUSPENDED = 'org_suspended', 'Organization Suspended'
    REVOKE_FAMILY_SUSPENDED = 'family_suspended', 'Family Suspended'
    REVOKE_USER_DELETED = 'user_deleted', 'User Account Deleted'
    REVOKE_FAMILY_DELETED = 'family_deleted', 'Family Record Deleted'
    REVOKE_PHONE_CHANGED = 'phone_changed', 'Phone Number Changed'
    REVOKE_SECURITY_ACTION = 'security_action', 'Security Action'
    REVOKE_PRE_CREATE_CLEANUP = 'pre_create_cleanup', 'Pre-Create Cleanup'
    REVOKE_SYSTEM = 'system', 'System Cleanup'


class AccountType(models.TextChoices):
    ASSET = 'asset', 'Asset'
    LIABILITY = 'liability', 'Liability'
    EQUITY = 'equity', 'Equity'
    REVENUE = 'revenue', 'Revenue'
    EXPENSE = 'expense', 'Expense'


class NormalBalance(models.TextChoices):
    DEBIT = 'debit', 'Debit'
    CREDIT = 'credit', 'Credit'


class DiscountType(models.TextChoices):
    PERCENTAGE = 'percentage', 'Percentage'
    FIXED = 'fixed', 'Fixed'


class Category(models.TextChoices):
    TUITION = 'tuition', 'Tuition'
    TRANSPORT = 'transport', 'Transport'
    EXAM = 'exam', 'Exam'
    EXTRA = 'extra', 'Extra'


class BillingFrequency(models.TextChoices):
    MONTHLY = 'monthly', 'Monthly'
    TERMLY = 'termly', 'Termly'
    ANNUALLY = 'annually', 'Annually'
    ONE_TIME = 'one_time', 'One Time'


class Invoice_Status(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    ISSUED = 'issued', 'Issued'
    PARTIAL = 'partial', 'Partial'
    PAID = 'paid', 'Paid'
    OVERDUE = 'overdue', 'Overdue'
    CANCELLED = 'cancelled', 'Cancelled'


class ReferenceType(models.TextChoices):
    INVOICE = 'invoice', 'Invoice'
    PAYMENT = 'payment', 'Payment'
    REFUND = 'refund', 'Refund'
    ADJUSTMENT = 'adjustment', 'Adjustment'


class Payment_Intent_Status(models.TextChoices):
    PENDING = 'pending', 'Pending'
    INITIATED = 'initiated', 'Initiated'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'
    EXPIRED = 'expired', 'Expired'


class Payment_Intent_GatewayName(models.TextChoices):
    TELEBIRR = 'telebirr', 'Telebirr'
    CBE_BIRR = 'cbe_birr', 'CBE Birr'
    ABYSSINIA = 'abyssinia', 'Abyssinia'


class PaymentMethod(models.TextChoices):
    CASH = 'cash', 'Cash'
    TELEBIRR = 'telebirr', 'Telebirr'
    CBE_BIRR = 'cbe_birr', 'CBE Birr'
    ABYSSINIA = 'abyssinia', 'Abyssinia'


class Payment_Status(models.TextChoices):
    PENDING = 'pending', 'Pending'
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'
    REFUNDED = 'refunded', 'Refunded'


class Refund_Status(models.TextChoices):
    PENDING = 'pending', 'Pending'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'


class EventType(models.TextChoices):
    SUCCESS = 'success', 'Success'
    FAILED = 'failed', 'Failed'
    REFUND = 'refund', 'Refund'


class JobType(models.TextChoices):
    PAYMENT_RETRY = 'payment_retry', 'Payment Retry'
    WEBHOOK_RETRY = 'webhook_retry', 'Webhook Retry'
    SMS_DELIVERY = 'sms_delivery', 'SMS Delivery'
    INVOICE_GENERATION = 'invoice_generation', 'Invoice Generation'
    EMAIL = 'email', 'Email'


class Job_Status(models.TextChoices):
    PENDING = 'pending', 'Pending'
    PROCESSING = 'processing', 'Processing'
    COMPLETED = 'completed', 'Completed'
    FAILED = 'failed', 'Failed'


class Notification_Type(models.TextChoices):
    PAYMENT = 'payment', 'Payment'
    GRADE = 'grade', 'Grade'
    ATTENDANCE = 'attendance', 'Attendance'
    INVOICE = 'invoice', 'Invoice'
    SYSTEM = 'system', 'System'
    ANNOUNCEMENT = 'announcement', 'Announcement'
    EMERGENCY = 'emergency', 'Emergency'


class Notification_Priority(models.TextChoices):
    LOW = 'low', 'Low'
    MEDIUM = 'medium', 'Medium'
    HIGH = 'high', 'High'
    URGENT = 'urgent', 'Urgent'


class Sms_Status(models.TextChoices):
    PENDING = 'pending', 'Pending'
    SENT = 'sent', 'Sent'
    DELIVERED = 'delivered', 'Delivered'
    FAILED = 'failed', 'Failed'


class Sms_Provider(models.TextChoices):
    ETHIOTELECOM = 'ethiotelecom', 'Ethio Telecom'
    AFRICAN_TECH = 'african_tech', 'African Tech'


class PermissionLevel(models.TextChoices):
    FULL = 'full', 'Full'
    VIEW_ONLY = 'view_only', 'View Only'
    FINANCIAL_ONLY = 'financial_only', 'Financial Only'


class OrganizationType(models.TextChoices):
    SINGLE_BRANCH = 'SINGLE_BRANCH', 'Single Branch'
    MULTI_BRANCH = 'MULTI_BRANCH', 'Multi Branch'
    FRANCHISE = 'FRANCHISE', 'Franchise'
    NETWORK = 'NETWORK', 'School Network'


class Organization_Status(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    INACTIVE = 'INACTIVE', 'Inactive'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    PENDING_VERIFICATION = 'PENDING_VERIFICATION', 'Pending Verification'


class School_Status(models.TextChoices):
    ACTIVE = 'active', 'Active'
    SUSPENDED = 'suspended', 'Suspended'
    ARCHIVED = 'archived', 'Archived'


class Enrollment_Status(models.TextChoices):
    ACTIVE = 'active', 'Active'
    TRANSFERRED = 'transferred', 'Transferred'
    COMPLETED = 'completed', 'Completed'


class RegistrationStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    ACTIVE = 'active', 'Active'
    BLOCKED = 'blocked', 'Blocked'


class PhoneType(models.TextChoices):
    PRIMARY = 'primary', 'Primary'
    SECONDARY = 'secondary', 'Secondary'


class Student_Status(models.TextChoices):
    ACTIVE = 'active', 'Active'
    WITHDRAWN = 'withdrawn', 'Withdrawn'
    GRADUATED = 'graduated', 'Graduated'
    SUSPENDED = 'suspended', 'Suspended'


class DeviceType(models.TextChoices):
    Android = "android", "Android"
    Ios = "ios", "Ios"
    MOBILE = 'mobile', 'Mobile'
    TABLET = 'tablet', 'Tablet'
    DESKTOP = 'desktop', 'Desktop'
    WEB = 'web', 'Web'


class Resource_Actions(models.TextChoices):
    CREATE = 'create', 'Create'
    READ = 'read', 'Read'
    UPDATE = 'update', 'Update'
    DELETE = 'delete', 'Delete'
    LIST = 'list', 'List'
    APPROVE = 'approve', 'Approve'
    EXPORT = 'export', 'Export'
    ASSIGN = 'assign', 'Assign'
    FINALIZE = 'finalize', 'Finalize'
    CANCEL = 'cancel', 'Cancel'
    REVOKE = 'revoke', 'Revoke'