from django.urls import path

from bookings.views import SoloBookingPaymentInfoView, SubmitSoloBookingPaymentView

from .views import (
    BankRequirementsView,
    ExtractReceiptDataView,
    MyPaymentTransactionsView,
    OwnerBankAccountDeactivateView,
    OwnerBankAccountsView,
    OwnerPaymentInfoView,
    OwnerPaymentProfileView,
    PaymentTransactionDetailView,
    PaymentTransactionPollView,
    ResolveReviewView,
    ReviewQueueView,
    SubmitPaymentView,
    SubmitTeamBookingPaymentView,
    TeamBookingPaymentInfoView,
)

app_name = "payment"

urlpatterns = [
    path(
        "payment/owners/<uuid:owner_id>/payment-info/",
        OwnerPaymentInfoView.as_view(),
        name="owner-payment-info",
    ),
    path(
        "payment/owners/<uuid:owner_id>/profile/",
        OwnerPaymentProfileView.as_view(),
        name="owner-payment-profile",
    ),
    path(
        "payment/owners/<uuid:owner_id>/bank-accounts/",
        OwnerBankAccountsView.as_view(),
        name="owner-bank-accounts",
    ),
    path(
        "payment/owners/<uuid:owner_id>/bank-accounts/<uuid:account_id>/deactivate/",
        OwnerBankAccountDeactivateView.as_view(),
        name="owner-bank-account-deactivate",
    ),
    path("payment/bookings/<uuid:booking_id>/pay/", SubmitPaymentView.as_view(), name="submit-payment"),
    path(
        "payment/team-booking-payments/<uuid:payment_id>/payment-info/",
        TeamBookingPaymentInfoView.as_view(),
        name="team-booking-payment-info",
    ),
    path(
        "payment/team-booking-payments/<uuid:payment_id>/pay/",
        SubmitTeamBookingPaymentView.as_view(),
        name="submit-team-booking-payment",
    ),
    path("payment/bank-requirements/", BankRequirementsView.as_view(), name="bank-requirements"),
    path(
        "payment/extract-receipt-data/",
        ExtractReceiptDataView.as_view(),
        name="extract-receipt-data",
    ),
    path("payment/transactions/mine/", MyPaymentTransactionsView.as_view(), name="my-transactions"),
    path(
        "payment/transactions/<uuid:transaction_id>/",
        PaymentTransactionDetailView.as_view(),
        name="transaction-detail",
    ),
    path(
        "payment/transactions/<uuid:transaction_id>/poll/",
        PaymentTransactionPollView.as_view(),
        name="transaction-poll",
    ),
    path("payment/transactions/review-queue/", ReviewQueueView.as_view(), name="review-queue"),
    path(
        "payment/transactions/<uuid:transaction_id>/resolve-review/",
        ResolveReviewView.as_view(),
        name="resolve-review",
    ),
    path("payment/solo-bookings/<uuid:hold_id>/payment-info/", SoloBookingPaymentInfoView.as_view()),
    path("payment/solo-bookings/<uuid:hold_id>/pay/", SubmitSoloBookingPaymentView.as_view()),
]
