from django.urls import path

from .views import (
    BookedPitchSummaryView,
    ConfirmTeamBookingView,
    DeclineTeamBookingView,
    MyActiveTeamBookingsView,
    MyConfirmationDetailView,
    MyPaymentDetailView,
    PayForBookingView,
    PendingOwnerActionView,
    PendingPaymentView,
    PendingTeamBookingConfirmationView,
    ResolveConfirmSummaryView,
    ResolvePaymentTimeoutView,
    TeamBookingRequestCreateView,
    TeamBookingRequestLiveDetailView,
)

urlpatterns = [
    path("bookings/team-request/", TeamBookingRequestCreateView.as_view()),
    path("bookings/team-request/pending-confirmation/", PendingTeamBookingConfirmationView.as_view()),
    path("bookings/team-request/pending-owner-action/", PendingOwnerActionView.as_view()),
    path("bookings/team-request/pending-payment/", PendingPaymentView.as_view()),
    path("bookings/team-request/my-active/", MyActiveTeamBookingsView.as_view()),
    path("bookings/team-request/<uuid:request_id>/confirm/", ConfirmTeamBookingView.as_view()),
    path("bookings/team-request/<uuid:request_id>/decline/", DeclineTeamBookingView.as_view()),
    path("bookings/team-request/<uuid:request_id>/resolve-confirm-summary/", ResolveConfirmSummaryView.as_view()),
    path("bookings/team-request/<uuid:request_id>/pay/", PayForBookingView.as_view()),
    path("bookings/team-request/<uuid:request_id>/resolve-payment-timeout/", ResolvePaymentTimeoutView.as_view()),
    path("bookings/team-request/<uuid:request_id>/live/", TeamBookingRequestLiveDetailView.as_view()),
    path("bookings/team-request/<uuid:request_id>/my-confirmation/", MyConfirmationDetailView.as_view()),
    path("bookings/team-request/<uuid:request_id>/my-payment/", MyPaymentDetailView.as_view()),
    path("bookings/team-request/<uuid:request_id>/booked-summary/", BookedPitchSummaryView.as_view()),
]