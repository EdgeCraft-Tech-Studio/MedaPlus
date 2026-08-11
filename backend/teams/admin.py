from django.contrib import admin

from .models import Team, TeamInvitation, TeamJoinRequest, TeamMembership


class TeamMembershipInline(admin.TabularInline):
    model = TeamMembership
    extra = 0
    fields = ("user", "role", "status", "joined_at")
    readonly_fields = ("joined_at",)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "sport",
        "visibility",
        "city",
        "area",
        "active_member_count",
        "max_roster_size",
        "is_active",
        "created_at",
    )
    list_filter = ("sport", "visibility", "is_active", "skill_level", "age_category")
    search_fields = ("name", "city", "area")
    inlines = [TeamMembershipInline]

    @admin.display(description="Active members")
    def active_member_count(self, obj):
        return obj.active_member_count


@admin.register(TeamMembership)
class TeamMembershipAdmin(admin.ModelAdmin):
    list_display = ("team", "user", "role", "status", "joined_at")
    list_filter = ("role", "status")
    search_fields = ("team__name", "user__username")


@admin.register(TeamInvitation)
class TeamInvitationAdmin(admin.ModelAdmin):
    list_display = (
        "team",
        "invitation_type",
        "invited_user",
        "invited_by",
        "status",
        "created_at",
        "expires_at",
    )
    list_filter = ("invitation_type", "status")
    search_fields = ("team__name", "invited_user__username", "token", "code")


@admin.register(TeamJoinRequest)
class TeamJoinRequestAdmin(admin.ModelAdmin):
    list_display = ("team", "user", "status", "created_at", "reviewed_by")
    list_filter = ("status",)
    search_fields = ("team__name", "user__username")