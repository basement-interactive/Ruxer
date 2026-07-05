// MemberList: the right-side panel listing guild members grouped by online
// status and hoisted role. Clicking a member opens their profile popup.
//
// For big guilds (member_count >= 1000) the list is lazy: instead of pulling
// every member up front, the GuildsStore subscribes to index ranges via op 14
// LAZY_REQUEST and the server pushes GUILD_MEMBERS_CHUNK events covering only
// those indices. As the user scrolls we extend the subscribed ranges so more
// members flow in.

import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { ui, guilds, presence, buildUserContextMenu } from "../stores";
import type { ContextMenuItem } from "../stores";
import type { Member } from "../types";
import { Avatar } from "../components/Avatar";
import "./MemberList.css";

// How many additional member indices to subscribe to per scroll-to-bottom.
const RANGE_PAGE = 100;

export const MemberList = observer(function MemberList() {
  const guild = ui.currentGuild;
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!guild) return null;
  const allMembers = guilds.membersByGuild.get(guild.id) ?? [];
  if (allMembers.length === 0) {
    return (
      <aside className="member-list">
        <div className="member-list-empty muted">Loading members…</div>
      </aside>
    );
  }

  // Build groups: hoisted roles (highest position first), then a default
  // "Online" group, then "Offline". A member goes under the highest hoisted
  // role they hold; offline members always go to Offline regardless of role.
  const groups = buildMemberGroups(guild, allMembers);

  // On scroll, if we're near the bottom and this is a big guild with a lazy
  // member list, subscribe to the next range so more members flow in.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const memberCount = guild.member_count ?? 0;
    if (memberCount < 1000) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 200;
    if (!nearBottom) return;
    const covered = guilds.subscribedRangesByGuild.get(guild.id) ?? [];
    const maxCovered = covered.reduce((m, r) => Math.max(m, r[1]), 0);
    // Don't ask for ranges past the member count.
    if (maxCovered >= memberCount - 1) return;
    const nextStart = maxCovered + 1;
    const nextEnd = Math.min(nextStart + RANGE_PAGE - 1, memberCount - 1);
    guilds.subscribeMemberRanges(guild.id, [[nextStart, nextEnd]]);
  };

  return (
    <aside className="member-list">
      <div className="member-list-scroll" ref={scrollRef} onScroll={onScroll}>
        {groups.map((g) => (
          <MemberGroup
            key={g.key}
            title={`${g.title} — ${g.members.length}`}
            members={g.members}
            offline={g.key === "offline"}
          />
        ))}
      </div>
    </aside>
  );
});

interface MemberGroupData {
  key: string;
  title: string;
  members: Member[];
}

// Group members the way Fluxer does: one group per HOISTED role (highest
// position first), then a default "Online" group, then "Offline". Each online
// member is placed under the highest hoisted role they hold; offline members
// all go to "Offline".
function buildMemberGroups(
  guild: { id: string; roles: { id: string; name: string; position: number; hoist?: boolean }[] },
  members: Member[],
): MemberGroupData[] {
  const hoisted = (guild.roles ?? [])
    .filter((r) => r.hoist && r.id !== guild.id)
    .sort((a, b) => b.position - a.position);

  const groups: MemberGroupData[] = hoisted.map((r) => ({ key: r.id, title: r.name, members: [] }));
  const groupByRoleId = new Map(groups.map((g) => [g.key, g]));
  const online: Member[] = [];
  const offline: Member[] = [];

  for (const m of members) {
    if (!presence.isOnline(m.user.id)) {
      offline.push(m);
      continue;
    }
    // Highest hoisted role this member holds (groups are already position-desc).
    const target = hoisted.find((r) => m.roles.includes(r.id));
    if (target) groupByRoleId.get(target.id)!.members.push(m);
    else online.push(m);
  }

  const result = groups.filter((g) => g.members.length > 0);
  if (online.length > 0) result.push({ key: "online", title: "Online", members: online });
  if (offline.length > 0) result.push({ key: "offline", title: "Offline", members: offline });
  return result;
}

// Renders one already-built group (header + flat member rows). The grouping
// itself is done once in buildMemberGroups — this component does NOT re-group.
const MemberGroup = observer(function MemberGroup({
  title,
  members,
  offline = false,
}: {
  title: string;
  members: Member[];
  offline?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div className="member-group">
      <div className="member-group-title">{title}</div>
      {members.map((m) => (
        <MemberRow key={m.user.id} member={m} offline={offline} />
      ))}
    </div>
  );
});

const MemberRow = observer(function MemberRow({
  member,
  offline = false,
}: {
  member: Member;
  offline?: boolean;
}) {
  const name = member.nick ?? member.user.global_name ?? member.user.username;
  return (
    <button
      className={`member-row ${offline ? "offline" : ""}`}
      onClick={(e) => ui.openProfile(member.user.id, { x: e.clientX, y: e.clientY }, ui.currentGuild?.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        const items: ContextMenuItem[] = buildMemberContextMenu(member, e.clientX, e.clientY);
        ui.openContextMenu(items, { x: e.clientX, y: e.clientY });
      }}
    >
      <div className="member-row-inner">
        <span className="member-row-content">
          <div className="member-row-avatar">
            <Avatar user={member.user} size={32} showStatus />
          </div>
          <div className="member-row-info">
            <div className="member-row-namebox">
              <span className="member-row-name nowrap" style={{ color: authorColor(member) }}>
                {name}
              </span>
              {member.user.bot && <span className="bot-badge">BOT</span>}
            </div>
          </div>
        </span>
      </div>
    </button>
  );
});

function buildMemberContextMenu(member: Member, x: number, y: number): ContextMenuItem[] {
  return buildUserContextMenu(member.user, x, y);
}

function authorColor(member: Member): string {
  const guild = ui.currentGuild;
  if (guild) {
    const colored = guild.roles
      .filter((r) => member.roles.includes(r.id) && r.color !== 0)
      .sort((a, b) => b.position - a.position)[0];
    if (colored) return intToHex(colored.color);
  }
  return "var(--text-normal)";
}

function intToHex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}