import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import styles from "./css/TeamDashboard.module.css";
import {
  BackArrowIcon, GlobeIcon, LockIcon, UsersIcon, VersusIcon,
  MapPinIcon, TrophyIcon, SettingsIcon,
} from "./Icons";
import ManageRoster from "./ManageRoster"; 
import {
  getTeamDashboard, getRoster, getInvitations, getJoinRequests, updateTeam,
  type TeamDashboardData, type RosterMember, type TeamInvitationItem, type JoinRequestItem,
  type UpdateTeamPayload,
} from "../lib/team";
import { getAreaName } from "../lib/geocode";
import MatchesTab from "./MatchesTab";
import TourGuide from "../tours/TourGuide";

type TabKey = "overview" | "roster" | "matches" | "bookings" | "tournaments" | "settings";

const SKILL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const AGE_LABEL: Record<string, string> = {
  open: "Open — no age limit",
  u18: "Under 18",
  u21: "Under 21",
  adult: "Adult",
  other: "Other",
};

const DAY_LABEL: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const PLAY_TIME_LABEL: Record<string, string> = {
  morning: "Morning (6–11)",
  afternoon: "Afternoon (11–5)",
  evening: "Evening (5–10)",
};

const SKILL_OPTIONS = Object.entries(SKILL_LABEL).map(([value, label]) => ({ value, label }));
const AGE_OPTIONS = Object.entries(AGE_LABEL).map(([value, label]) => ({ value, label }));
const PLAY_TIME_OPTIONS = Object.entries(PLAY_TIME_LABEL).map(([value, label]) => ({ value, label }));
const DAY_OPTIONS = Object.entries(DAY_LABEL).map(([value, label]) => ({ value, label }));
const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

// Mirrors Team.MAX_ROSTER_SIZE_CAP on the backend — keep these in sync.
const MIN_ROSTER_SIZE = 1;
const MAX_ROSTER_SIZE_CAP = 50;

const EDIT_MAP_DEFAULT_CENTER = { lat: 8.9806, lng: 38.7578 }; // Addis Ababa

/* ---------------------------------------------------------------------- */
/* Skeleton loading state — mirrors header band + tab bar + overview       */
/* grid layout so nothing "jumps" once real data arrives.                  */
/* ---------------------------------------------------------------------- */

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`${styles.shimmer} ${className}`} />;
}

function TeamDashboardSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-live="polite">
      <div className={styles.headerBand}>
        <div className={styles.headerInner}>
          <div className={styles.headerTop}>
            <SkeletonBlock className={styles.skelBackLink} />
          </div>

          <SkeletonBlock className={styles.skelLogo} />

          <div className={styles.headerText}>
            <SkeletonBlock className={styles.skelTeamName} />
            <SkeletonBlock className={styles.skelMetaRow} />
          </div>

          <SkeletonBlock className={styles.skelRoleBadge} />
        </div>
      </div>

      <div className={styles.tabBar}>
        <div className={styles.tabBarInner}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className={styles.skelTab} />
          ))}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.statsGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div className={styles.statCard} key={i}>
              <SkeletonBlock className={styles.skelStatValue} />
              <SkeletonBlock className={styles.skelStatLabel} />
            </div>
          ))}
        </div>

        <SkeletonBlock className={styles.skelSectionTitle} />
        <SkeletonBlock className={styles.skelAboutCard} />

        <SkeletonBlock className={styles.skelSectionTitle} />
        <div className={styles.infoGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div className={styles.infoItem} key={i}>
              <SkeletonBlock className={styles.skelInfoLabel} />
              <SkeletonBlock className={styles.skelInfoValue} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
      const isManager = detail.my_role === "owner" || detail.my_role === "admin";

      if (isManager) {
        const [rosterData, invitesData, requestsData] = await Promise.all([
          getRoster(currentSlug),
          getInvitations(currentSlug),
          getJoinRequests(currentSlug),
        ]);
        setRoster(rosterData);
        setInvitations(invitesData);
        setJoinRequests(requestsData);
      } else {
        // Members: only fetch the active roster. Invitations and join
        // requests are owner/admin-only data — don't request them for
        // a role that can't see or act on them.
        const rosterData = await getRoster(currentSlug);
        setRoster(rosterData);
        setInvitations([]);
        setJoinRequests([]);
      }
    } catch (err) {
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
    return <TeamDashboardSkeleton />;
  }

  const pendingInvitesCount = invitations.filter((i) => i.status === "pending").length;
  const pendingRequestsCount = joinRequests.filter((r) => r.status === "pending").length;

  const isManager = team.my_role === "owner" || team.my_role === "admin";

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; count?: number; ownerOnly?: boolean; managerOnly?: boolean; tourKey?: string }[] = [
    { key: "overview", label: "Overview", icon: UsersIcon, tourKey: "team-overview" },
    { key: "roster", label: "Manage roster", icon: UsersIcon, count: pendingInvitesCount + pendingRequestsCount || undefined, tourKey: "team-roster" },
    { key: "matches", label: "Matches", icon: VersusIcon, tourKey: "team-matches" },
    { key: "bookings", label: "Bookings", icon: MapPinIcon, managerOnly: true, tourKey: "team-bookings" },
    { key: "tournaments", label: "Tournaments", icon: TrophyIcon, managerOnly: true },
    { key: "settings", label: "Settings", icon: SettingsIcon, ownerOnly: true },
  ];
  function handleLocationClick() {
    // TODO: open map view / directions using team.latitude / team.longitude
  }

  return (
    <div className={styles.page}>
      {/* Mounted only after the dashboard has loaded and the role is known,
          so role-gated tabs are already in the DOM. TourGuide drops any
          step whose target isn't there — a member simply gets a shorter
          tour, with no missing-target breakage. The roster sub-steps
          resolve because "roster" is this page's default tab. */}
      <TourGuide page="teamDashboard" waitForPage="appshell" />

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
              <span>{team.area || team.city}</span>
              <span>{team.active_member_count}/{team.max_roster_size} active players</span>
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
            {team.my_role === "owner" ? "Owner" : "Admin"}
          </span>
        </div>
      </div>

      <div className={styles.tabBar}>
        <div className={styles.tabBarInner}>
          {tabs
            .filter((t) => !t.managerOnly || isManager)
            .filter((t) => !t.ownerOnly || team.my_role === "owner")
            .map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
                onClick={() => setTab(t.key)}
                data-tour={t.tourKey ? `tour-${t.tourKey}` : undefined}
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
          <OverviewTab
            team={team}
            rosterCount={roster.length}
            onGoToRoster={() => setTab("roster")}
            slug={slug}
            canEdit={isManager}
            onTeamUpdated={(updated) => setTeam(updated)}
          />
        )}

                {tab === "roster" && (
          <ManageRoster
            team={team}
            roster={roster}
            invitations={invitations}
            joinRequests={joinRequests}
            canManage={isManager}
            slug={slug}
            onRosterChange={() => loadDashboard(slug)}
          />
        )}

        {tab === "matches" && <MatchesTab team={team} canManage={isManager} />}

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

function EditPencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

/* ---------------- edit-mode location picker ---------------- */

function buildEditPinIcon() {
  const html = `
    <div class="team-edit-pin">
      <svg width="30" height="38" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 1C7.8 1 1.2 7.4 1.2 15.4c0 9.8 14.8 23.6 14.8 23.6s14.8-13.8 14.8-23.6C30.8 7.4 24.2 1 16 1z"
          fill="#3fae7f" stroke="rgba(0,0,0,0.25)" stroke-width="1.2"/>
        <circle cx="16" cy="15.4" r="6.2" fill="#fff"/>
        <circle cx="16" cy="15.4" r="2.6" fill="#3fae7f"/>
      </svg>
    </div>`;
  return L.divIcon({ html, className: "team-edit-pin-marker", iconSize: [30, 38], iconAnchor: [15, 38], popupAnchor: [0, -34] });
}

function EditLocationClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function EditMapFlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

function TeamEditLocationField({
  latitude, longitude, area, onLocationChange,
}: {
  latitude: number | null;
  longitude: number | null;
  area: string;
  onLocationChange: (lat: number, lng: number, area: string) => void;
}) {
  const [geocoding, setGeocoding] = useState(false);
  const center = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : EDIT_MAP_DEFAULT_CENTER;

  async function handlePick(lat: number, lng: number) {
    setGeocoding(true);
    const name = await getAreaName(lat, lng);
    setGeocoding(false);
    // Always commit the pin even if geocoding fails — never silently
    // drop the user's placement.
    onLocationChange(lat, lng, name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }

  return (
    <div className={styles.editMapField}>
      <div className={styles.editMapBox}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={latitude != null ? 15 : 12}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <EditLocationClickHandler onPick={handlePick} />
          <EditMapFlyTo lat={latitude} lng={longitude} />
          {latitude != null && longitude != null && (
            <Marker
              position={[latitude, longitude]}
              icon={buildEditPinIcon()}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = (e.target as L.Marker).getLatLng();
                  handlePick(m.lat, m.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {latitude != null && longitude != null ? (
        <div className={styles.editMapConfirm}>
          <MapPinIcon width={14} height={14} />
          <span>{geocoding ? "Finding the area name…" : (area || "Pin dropped — name it below")}</span>
        </div>
      ) : (
        <div className={styles.editMapEmpty}>
          <MapPinIcon width={14} height={14} />
          Tap the map to move your home ground — drag the pin to fine-tune
        </div>
      )}
    </div>
  );
}

/* ---------------- overview tab (view + edit) ---------------- */

interface EditFormState {
  name: string;
  description: string;
  sport: string;
  skillLevel: string;
  ageCategory: string;
  visibility: string;
  area: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  maxRosterSize: string;
  preferredDays: string[];
  playTime: string;
}

function buildEditForm(team: TeamDashboardData): EditFormState {
  return {
    name: team.name,
    description: team.description || "",
    sport: team.sport,
    skillLevel: team.skill_level || "",
    ageCategory: team.age_category || "open",
    visibility: team.visibility,
    area: team.area || "",
    city: team.city || "",
    latitude: team.latitude,
    longitude: team.longitude,
    maxRosterSize: String(team.max_roster_size),
    preferredDays: team.preferred_days || [],
    playTime: team.play_time || "",
  };
}

function OverviewTab({
  team, rosterCount, onGoToRoster, slug, canEdit, onTeamUpdated,
}: {
  team: TeamDashboardData;
  rosterCount: number;
  onGoToRoster: () => void;
  slug: string;
  canEdit: boolean;
  onTeamUpdated: (updated: TeamDashboardData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditFormState>(() => buildEditForm(team));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [fieldErrs, setFieldErrs] = useState<Partial<Record<keyof EditFormState, string>>>({});

  function setField<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrs[key]) setFieldErrs((e) => ({ ...e, [key]: undefined }));
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      preferredDays: f.preferredDays.includes(day)
        ? f.preferredDays.filter((d) => d !== day)
        : [...f.preferredDays, day],
    }));
  }

  function startEdit() {
    setForm(buildEditForm(team));
    setFieldErrs({});
    setSaveErr("");
    setEditing(true);
  }

  function cancelEdit() {
    setForm(buildEditForm(team));
    setFieldErrs({});
    setSaveErr("");
    setEditing(false);
  }

  function validate(): Partial<Record<keyof EditFormState, string>> {
    const e: Partial<Record<keyof EditFormState, string>> = {};
    if (!form.name.trim()) e.name = "Team name is required.";
    else if (form.name.trim().length < 3) e.name = "Team name must be at least 3 characters.";
    else if (form.name.trim().length > 40) e.name = "Team name must be under 40 characters.";
    if (form.description.length > 220) e.description = "Keep the description under 220 characters.";
    if (!form.sport.trim()) e.sport = "Sport is required.";
    if (!form.skillLevel) e.skillLevel = "Choose a skill level.";
    if (form.latitude == null || form.longitude == null || !form.area.trim()) {
      e.area = "Select the team's home ground on the map, then confirm the area name.";
    }
    if (!form.maxRosterSize) e.maxRosterSize = "Capacity is required.";
    else if (!/^\d+$/.test(form.maxRosterSize)) e.maxRosterSize = "Capacity must be a whole number.";
    else if (Number(form.maxRosterSize) < MIN_ROSTER_SIZE) e.maxRosterSize = "A team needs at least one member.";
    else if (Number(form.maxRosterSize) > MAX_ROSTER_SIZE_CAP) e.maxRosterSize = `Capacity can't exceed ${MAX_ROSTER_SIZE_CAP}.`;
    if (Number(form.maxRosterSize) < rosterCount) e.maxRosterSize = `Capacity can't be lower than the ${rosterCount} active players already on the team.`;
    return e;
  }

  async function handleSave() {
    const v = validate();
    setFieldErrs(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    setSaveErr("");
    try {
      const payload: UpdateTeamPayload = {
        name: form.name.trim(),
        description: form.description.trim(),
        sport: form.sport.trim(),
        area: form.area.trim(),
        city: form.city,
        latitude: form.latitude as number,
        longitude: form.longitude as number,
        skill_level: form.skillLevel,
        age_category: form.ageCategory,
        preferred_days: form.preferredDays,
        play_time: form.playTime,
        max_roster_size: Number(form.maxRosterSize),
        visibility: form.visibility,
        version: team.version,
      };
      const updated = await updateTeam(slug, payload);
      onTeamUpdated(updated);
      setEditing(false);
    } catch (err: any) {
      if (err.response?.status === 400) {
        const raw = err.response.data as Record<string, string[] | string>;
        const flat: Partial<Record<keyof EditFormState, string>> = {};
        Object.entries(raw).forEach(([key, msgs]) => {
          const msg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (key === "latitude" || key === "longitude") flat.area = msg;
          else if (key === "skill_level") flat.skillLevel = msg;
          else if (key === "age_category") flat.ageCategory = msg;
          else if (key === "max_roster_size") flat.maxRosterSize = msg;
          else if (key === "preferred_days") flat.preferredDays = msg as any;
          else if (key === "play_time") flat.playTime = msg;
          else if (key === "version") setSaveErr(msg);
          else if (key in form) flat[key as keyof EditFormState] = msg as any;
        });
        setFieldErrs(flat);
        if (!raw.version) setSaveErr("Please check the highlighted fields and try again.");
      } else {
        setSaveErr("Couldn't save changes. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const skillLabel = team.skill_level ? SKILL_LABEL[team.skill_level] ?? team.skill_level : "Not set";
  const ageLabel = AGE_LABEL[team.age_category] ?? (team.age_category || "Open — no age limit");
  const daysLabel = team.preferred_days.length > 0
    ? team.preferred_days.map((d) => DAY_LABEL[d] ?? d).join(", ")
    : "Not set";
  const playTimeLabel = team.play_time ? PLAY_TIME_LABEL[team.play_time] ?? team.play_time : "Not set";
  const ownerName = team.owner
    ? (`${team.owner.first_name ?? ""} ${team.owner.last_name ?? ""}`.trim() || team.owner.username)
    : "Unknown";
  const createdLabel = new Date(team.created_at).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div>
      {canEdit && (
        <div className={styles.overviewTopBar}>
          <div className={styles.overviewTopBarText}>
            <span className={styles.overviewTopBarTitle}>Team overview</span>
            <span className={styles.overviewTopBarSub}>
              {editing ? "Editing team details" : "Manage your team's public info and settings"}
            </span>
          </div>
          {!editing ? (
            <button type="button" className={styles.editTeamBtn} onClick={startEdit}>
              <EditPencilIcon width={15} height={15} />
              Edit team
            </button>
          ) : (
            <div className={styles.editActions}>
              <button type="button" className={styles.cancelBtn} onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{rosterCount}</div>
          <div className={styles.statLabel}>Active players</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{team.available_slots}</div>
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

      <div className={styles.sectionHeaderRow}>
        <div className={styles.sectionTitle}>About</div>
      </div>
      {editing ? (
        <div className={styles.editAboutWrap}>
          <textarea
            className={styles.editTextarea}
            value={form.description}
            maxLength={220}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="What makes your team, your team?"
          />
          {fieldErrs.description && <div className={styles.fieldErr}>{fieldErrs.description}</div>}
        </div>
      ) : (
        team.description && <div className={styles.aboutCard}>{team.description}</div>
      )}

      <div className={styles.sectionHeaderRow}>
        <div className={styles.sectionTitle}>Team details</div>
        {editing && <span className={styles.editingBadge}>Editing</span>}
      </div>

      {saveErr && <div className={styles.saveErrBanner}>{saveErr}</div>}

      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Name</div>
          {editing ? (
            <>
              <input className={styles.editInput} value={form.name} onChange={(e) => setField("name", e.target.value)} />
              {fieldErrs.name && <div className={styles.fieldErr}>{fieldErrs.name}</div>}
            </>
          ) : (
            <div className={styles.infoValue}>{team.name}</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Sport</div>
          {editing ? (
            <>
              <input className={styles.editInput} value={form.sport} onChange={(e) => setField("sport", e.target.value)} />
              {fieldErrs.sport && <div className={styles.fieldErr}>{fieldErrs.sport}</div>}
            </>
          ) : (
            <div className={styles.infoValue}>{team.sport}</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Skill level</div>
          {editing ? (
            <>
              <select className={styles.editSelect} value={form.skillLevel} onChange={(e) => setField("skillLevel", e.target.value)}>
                <option value="">Select…</option>
                {SKILL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {fieldErrs.skillLevel && <div className={styles.fieldErr}>{fieldErrs.skillLevel}</div>}
            </>
          ) : (
            <div className={styles.infoValue}>{skillLabel}</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Age category</div>
          {editing ? (
            <select className={styles.editSelect} value={form.ageCategory} onChange={(e) => setField("ageCategory", e.target.value)}>
              {AGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <div className={styles.infoValue}>{ageLabel}</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Visibility</div>
          {editing ? (
            <select className={styles.editSelect} value={form.visibility} onChange={(e) => setField("visibility", e.target.value)}>
              {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <div className={styles.infoValue}>{team.visibility === "public" ? "Public" : "Private"}</div>
          )}
        </div>

        {!editing && (
          <div className={styles.infoItem}>
            <div className={styles.infoLabel}>Location</div>
            <div className={styles.infoValue}>{team.area ? `${team.area}, ${team.city}` : team.city}</div>
          </div>
        )}

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Roster capacity</div>
          {editing ? (
            <>
              <input
                type="number"
                min={MIN_ROSTER_SIZE}
                max={MAX_ROSTER_SIZE_CAP}
                className={styles.editInput}
                value={form.maxRosterSize}
                onChange={(e) => setField("maxRosterSize", e.target.value)}
              />
              {fieldErrs.maxRosterSize && <div className={styles.fieldErr}>{fieldErrs.maxRosterSize}</div>}
            </>
          ) : (
            <div className={styles.infoValue}>{team.max_roster_size} players max</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Preferred days</div>
          {editing ? (
            <div className={styles.dayChipGroup}>
              {DAY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`${styles.dayChip} ${form.preferredDays.includes(o.value) ? styles.dayChipActive : ""}`}
                  onClick={() => toggleDay(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.infoValue}>{daysLabel}</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Usual play time</div>
          {editing ? (
            <select className={styles.editSelect} value={form.playTime} onChange={(e) => setField("playTime", e.target.value)}>
              <option value="">Not set</option>
              {PLAY_TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <div className={styles.infoValue}>{playTimeLabel}</div>
          )}
        </div>

        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Owner</div>
          <div className={styles.infoValue}>{ownerName}</div>
        </div>
        <div className={styles.infoItem}>
          <div className={styles.infoLabel}>Team since</div>
          <div className={styles.infoValue}>{createdLabel}</div>
        </div>
      </div>

      {editing && (
        <div className={styles.editLocationSection}>
          <div className={styles.infoLabel} style={{ marginBottom: 8 }}>Home ground</div>
          <TeamEditLocationField
            latitude={form.latitude}
            longitude={form.longitude}
            area={form.area}
            onLocationChange={(lat, lng, area) => {
              setForm((f) => ({ ...f, latitude: lat, longitude: lng, area: area || f.area }));
              if (fieldErrs.area) setFieldErrs((e) => ({ ...e, area: undefined }));
            }}
          />
          <input
            className={styles.editInput}
            style={{ marginTop: 10 }}
            value={form.area}
            onChange={(e) => setField("area", e.target.value)}
            placeholder="Area name — auto-filled from the map, edit if needed"
          />
          {fieldErrs.area && <div className={styles.fieldErr}>{fieldErrs.area}</div>}
        </div>
      )}

      {editing && (
        <div className={styles.bottomSaveRow}>
          <button type="button" className={styles.cancelBtn} onClick={cancelEdit} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {!editing && (
        <button className={styles.sectionTitle} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--grass)" }} onClick={onGoToRoster}>
          Go to Manage Roster →
        </button>
      )}
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
