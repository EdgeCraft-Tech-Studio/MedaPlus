import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import styles from "./css/TeamDashboard.module.css";
import {
  BackArrowIcon, GlobeIcon, LockIcon, UsersIcon, VersusIcon,
  MapPinIcon, TrophyIcon, SettingsIcon,
} from "./Icons";
import ManageRoster from "./ManageRoster";
import {
  getTeamDashboard, getRoster, getInvitations, getJoinRequests,
  type TeamDashboardData, type RosterMember, type TeamInvitationItem, type JoinRequestItem,
} from "../lib/team";

type TabKey = "overview" | "roster" | "matches" | "bookings" | "tournaments" | "settings";

export default function TeamDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const [tab, setTab] = useState<TabKey>("roster");

  const [team, setTeam] = useState<TeamDashboardData | null>(null);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitationItem[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  async function loadDashboard(currentSlug: string) {
    try {
      const detail = await getTeamDashboard(currentSlug);
      setTeam(detail);
      const [rosterData, invitesData, requestsData] = await Promise.all([
        getRoster(currentSlug),
        getInvitations(currentSlug),
        getJoinRequests(currentSlug),
      ]);
      setRoster(rosterData);
      setInvitations(invitesData);
      setJoinRequests(requestsData);
    } catch (err) {
      // 403 = not owner/admin (backend-enforced), 404 = team doesn't exist —
      // either way, no access. This is the frontend reaction to the real
      // server-side security check, not the check itself.
      setDenied(true);
      console.error("Failed to load team dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    loadDashboard(slug);
  }, [slug]);

  if (!slug || denied) {
    return <Navigate to="/teams" replace />;
  }

  if (loading || !team) {
    return <div className={styles.page} aria-busy="true" />;
  }

  const pendingInvitesCount = invitations.filter((i) => i.status === "pending").length;
  const pendingRequestsCount = joinRequests.filter((r) => r.status === "pending").length;

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; count?: number; ownerOnly?: boolean }[] = [
    { key: "overview", label: "Overview", icon: UsersIcon },
    { key: "roster", label: "Manage roster", icon: UsersIcon, count: pendingInvitesCount + pendingRequestsCount || undefined },
    { key: "matches", label: "Matches", icon: VersusIcon },
    { key: "bookings", label: "Bookings", icon: MapPinIcon },
    { key: "tournaments", label: "Tournaments", icon: TrophyIcon },
    { key: "settings", label: "Settings", icon: SettingsIcon, ownerOnly: true },
  ];

  function handleLocationClick() {
    // TODO: open map view / directions using team.latitude / team.longitude
  }

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
                {team.visibility === "public" ? "Public" : team.visibility === "request" ? "Request to join" : "Private"}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span>{team.sport}</span>
              <span>{team.area || team.city}</span>
              <span>{team.activeMemberCount}/{team.maxRosterSize} active players</span>
              {team.latitude != null && team.longitude != null && (
                <button
                  type="button"
                  onClick={handleLocationClick}
                  title="View location"
                  style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: 0 }}
                >
                  <MapPinIcon width={14} height={14} />
                </button>
              )}
            </div>
          </div>

          <span className={styles.roleBadgeHeader}>
            {team.myRole === "owner" ? "Owner" : "Admin"}
          </span>
        </div>
      </div>

      <div className={styles.tabBar}>
        <div className={styles.tabBarInner}>
          {tabs.filter((t) => !t.ownerOnly || team.myRole === "owner").map((t) => {
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
            canManage={true}
            slug={slug}
            onRosterChange={() => loadDashboard(slug)}
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
}: { team: TeamDashboardData; rosterCount: number; onGoToRoster: () => void }) {
  return (
    <div>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{rosterCount}</div>
          <div className={styles.statLabel}>Active players</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{team.maxRosterSize - rosterCount}</div>
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
          <div className={styles.infoValue}>
            {team.visibility === "public" ? "Public" : team.visibility === "request" ? "Request to join" : "Private"}
          </div>
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