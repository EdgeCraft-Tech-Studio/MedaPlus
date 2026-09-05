from django.db import models


class NotificationType(models.TextChoices):
    """One flat enum, namespaced by prefix in the value string itself
    (team_*, chat_*, match_*) rather than a separate 'category' field
    — simple to filter on (`type__startswith='team_'`), simple to
    read in logs/admin, and each specific type is what the frontend
    actually branches on to decide icon/copy/navigation anyway.
    """

    # --- Team ---
    TEAM_INVITATION_RECEIVED = "team_invitation_received", "Team Invitation Received"
    TEAM_INVITATION_ACCEPTED = "team_invitation_accepted", "Invitation Accepted"
    TEAM_INVITATION_DECLINED = "team_invitation_declined", "Invitation Declined"
    TEAM_JOIN_REQUEST_RECEIVED = "team_join_request_received", "New Join Request"
    TEAM_JOIN_REQUEST_APPROVED = "team_join_request_approved", "Join Request Approved"
    TEAM_JOIN_REQUEST_REJECTED = "team_join_request_rejected", "Join Request Rejected"
    TEAM_ROLE_CHANGED = "team_role_changed", "Your Role Changed"
    TEAM_MEMBER_REMOVED = "team_member_removed", "Removed From Team"
    TEAM_OWNERSHIP_TRANSFERRED = "team_ownership_transferred", "You Are Now Team Owner"

    # --- Chat ---
    CHAT_MESSAGE_RECEIVED = "chat_message_received", "New Message"

        # --- Match ---
    MATCH_CHALLENGE_ACCEPTED = "match_challenge_accepted", "Challenge Accepted"
    MATCH_PLAYER_JOINED = "match_player_joined", "Player Joined Your Match"
    MATCH_CONFIRMED = "match_confirmed", "Match Confirmed"
    MATCH_CANCELLED = "match_cancelled", "Match Cancelled"
    MATCH_REMINDER = "match_reminder", "Upcoming Match Reminder"

        # --- Team booking (owner asks team "can you play?") ---
    TEAM_BOOKING_REQUEST_RECEIVED = "team_booking_request_received", "Team Booking Request"
    TEAM_BOOKING_MEMBER_RESPONDED = "team_booking_member_responded", "Member Responded"
    TEAM_BOOKING_SUMMARY = "team_booking_summary", "Booking Response Summary"
    TEAM_BOOKING_PAYMENT_REQUEST = "team_booking_payment_request", "Payment Requested"
    TEAM_BOOKING_PAYMENT_RECEIVED = "team_booking_payment_received", "Payment Received"
    TEAM_BOOKING_PITCH_BOOKED = "team_booking_pitch_booked", "Pitch Booked"
    TEAM_BOOKING_PITCH_UNAVAILABLE = "team_booking_pitch_unavailable", "Pitch Unavailable"
    # --- Fallback ---
    SYSTEM = "system", "System"