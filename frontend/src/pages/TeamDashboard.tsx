import { useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import styles from "./css/TeamDashboard.module.css";
import {
  BackArrowIcon, GlobeIcon, LockIcon, UsersIcon, VersusIcon, MapPinIcon, TrophyIcon, SettingsIcon,
} from "./Icons";
import ManageRoster from "./ManageRoster";
import { mockTeamDetail, mockRoster, mockInvitations, mockJoinRequests } from "./teamMockData";

type TabKey = "overview" | "roster" | "matches" | "bookings" | "tournaments" | "settings";

export default function TeamDashboard() {
  const { teamId } = useParams<{ teamId: string }>();
  const [tab, setTab] = useState<TabKey>("roster");

  if (!teamId || !mockTeamDetail[teamId]) {
    // TODO: replace with a real 404 / "team not found" page once available
    return <Navigate to="/teams" replace />;
  }

  const team = mockTeamDetail[teamId];
  const roster = mockRoster[teamId] || [];
  const invitations = mockInvitations[teamId] || [];
  const joinRequests = mockJoinRequests[teamId] || [];

  const canManage = team.myRole === "OWNER" || team.myRole === "ADMIN";
  const pendingInvitesCount = invitations.filter((i) => i.status === "PENDING").length;
  const pendingRequestsCount = joinRequests.filter((r) => r.status === "PENDING").length;

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; count?: number; ownerOnly?: boolean }[] = [
    { key: "overview", label: "Overview", icon: UsersIcon },
    { key: "roster", label: "Manage roster", icon: UsersIcon, count: pendingInvitesCount + pendingRequestsCount || undefined },
    { key: "matches", label: "Matches", icon: VersusIcon },
    { key: "bookings", label: "Bookings", icon: MapPinIcon },
    { key: "tournaments", label: "Tournaments", icon: TrophyIcon },
    { key: "settings", label: "Settings", icon: SettingsIcon, ownerOnly: true },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.headerBand}>
        <div className={styles.headerInner}>
          <div className={styles.headerTop}>
            <Link to="/teams" className={styles.backLink}>
              <BackArrowIcon width={13} height={13} />
              All teams
            </Link>
          </div>

          <span className={styles.logo}>
            {team.logo ? <img src={team.logo} alt="" /> : team.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>

          <div className={styles.headerText}>
            <div className={styles.nameRow}>
              <span className={styles.teamName}>{team.name}</span>
              <span className={styles.visBadge}>
                {team.visibility === "public" ? <GlobeIcon width={11} height={11} /> : <LockIcon width={11} height={11} />}
                {team.visibility === "public" ? "Public" : "Private"}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span>{team.sport}</span>
              <span>{team.homeArea}</span>
              <span>{team.activeCount}/{team.capacity} active players</span>
            </div>
          </div>

          <span className={styles.roleBadgeHeader}>
            {team.myRole === "OWNER" ? "Owner" : team.myRole === "ADMIN" ? "Admin" : "Member"}
          </span>
        </div>
      </div>

      <div className={styles.tabBar}>
        <div className={styles.tabBarInner}>
          {tabs.filter((t) => !t.ownerOnly || team.myRole === "OWNER").map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
                onClick={() => setTab(t.key)}
              >
                <Icon width={14} height={14} />
                {t.label}
                {!!t.count && <span className={styles.tabCount}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.content}>
        {tab === "overview" && (
          <OverviewTab team={team} rosterCount={roster.length} onGoToRoster={() => setTab("roster")} />
        )}

        {tab === "roster" && (
          <ManageRoster
            team={team}
            roster={roster}
            invitations={invitations}
            joinRequests={joinRequests}
            canManage={canManage}
          />
        )}

        {tab === "matches" && (
          <Placeholder icon={VersusIcon} text="This team's matches will show up here." ctaLabel="Make a match" ctaTo="/match/create" />
        )}
        {tab === "bookings" && (
          <Placeholder icon={MapPinIcon} text="This team's pitch bookings will show up here." ctaLabel="Find a pitch" ctaTo="/discover/pitches" />
        )}
        {tab === "tournaments" && (
          <Placeholder icon={TrophyIcon} text="Tournament registrations for this team will show up here." ctaLabel="Browse tournaments" ctaTo="/discover/tournaments" />
        )}
        {tab === "settings" && (
          <Placeholder icon={SettingsIcon} text="Team settings — name, visibility, capacity, and ownership transfer." ctaLabel="" ctaTo="" />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  team, rosterCount, onGoToRoster,
}: { team: ReturnType<typeof mockTeamDetail>[string]; rosterCount: number; onGoToRoster: () => void }) {
  return (
    <div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{rosterCount}</div>
          <div className={styles.statLabel}>Active players</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{team.capacity - rosterCount}</div>
          <div className={styles.statLabel}>Open roster spots</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>0</div>
          <div className={styles.statLabel}>Upcoming matches</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>0</div>
          <div className={styles.statLabel}>Tournaments joined</div>
        </div>
      </div>

      {team.description && (
        <>
          <div className={styles.sectionTitle}>About</div>
          <div className={styles.aboutCard}>{team.description}</div>
        </>
      )}

      <div className={styles.sectionTitle}>Team details</div>
      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Skill level</div>
          <div className={styles.infoValue}>{team.skillLevel}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Age category</div>
          <div className={styles.infoValue}>{team.ageCategory || "No preference"}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Visibility</div>
          <div className={styles.infoValue}>{team.visibility === "public" ? "Public" : "Private"}</div>
        </div>
      </div>

      <button className={styles.sectionTitle} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grass)" }} onClick={onGoToRoster}>
        Go to Manage Roster →
      </button>
    </div>
  );
}

function Placeholder({
  icon: Icon, text, ctaLabel, ctaTo,
}: { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; text: string; ctaLabel: string; ctaTo: string }) {
  return (
    <div className={styles.placeholderCard}>
      <span className={styles.placeholderIconWrap}><Icon width={22} height={22} /></span>
      <p>{text}</p>
      {ctaLabel && <Link to={ctaTo} style={{ color: "var(--grass)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>{ctaLabel}</Link>}
    </div>
  );
}
