from accounts.services.session_services import SessionService, REVOKE_REASON_CHOICES

class ProfileService:
    
    def change_password(self, user, new_password, current_session_id):
        # 1. update password — already validated by serializer
        user.set_password(new_password)
        user.must_change_password = False
        user.failed_attempts = 0
        user.blocked_until   = None
        user.save(update_fields=[
            'password',
            'must_change_password', 
            'failed_attempts',
            'blocked_until'
        ])
        
        # 2. revoke all other sessions — user stays logged in here
        SessionService.revoke_all_sessions(
            user_id=user.id,
            reason=REVOKE_REASON_CHOICES.REVOKE_PASSWORD_CHANGE,
            exclude_session_id=current_session_id
        )