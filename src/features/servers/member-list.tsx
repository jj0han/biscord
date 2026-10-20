import { useMemo } from "react"

import { UserAvatar } from "@/components/user-avatar"
import { ServerActivity } from "@/features/friends/active-now"
import { StyledName } from "@/features/profiles/discord-extras"
import { ProfilePopover } from "@/features/profiles/profile-popover"
import { presenceStore } from "@/features/realtime/presence"
import {
  useMemberRoleAssignments,
  useMembers,
  useRoles,
  useServer,
} from "@/features/servers/queries"
import { UserVoiceMenu } from "@/features/voice/user-voice-menu"
import { displayName } from "@/lib/format"
import { roleColor } from "@/lib/permissions"
import type { Profile, Role } from "@/lib/types"
import { cn } from "@/lib/utils"

type Row = {
  profile: Profile
  nickname: string | null
  color: number
  owner: boolean
}

function MemberRow({
  row,
  serverId,
  offline,
}: {
  row: Row
  serverId: string | null
  offline: boolean
}) {
  return (
    <UserVoiceMenu userId={row.profile.id} serverId={serverId} voice={false}>
      <div>
        <ProfilePopover userId={row.profile.id} serverId={serverId} side="left">
          <button
            type="button"
            style={
              row.profile.nameplate_url
                ? { backgroundImage: `url(${row.profile.nameplate_url})` }
                : undefined
            }
            className={cn(
              "group/play flex h-11 w-full items-center gap-3 rounded-md bg-cover bg-right bg-no-repeat px-2 text-left transition-colors hover:bg-hover compact:h-9 spacious:h-13",
              offline && "opacity-30 hover:opacity-100"
            )}
          >
            <UserAvatar
              profile={row.profile}
              size="md"
              showStatus={!offline}
              decoration
              still
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className="truncate font-medium text-interactive"
                style={{ color: roleColor(row.color) }}
              >
                {row.color ? (
                  displayName(row.profile, row.nickname)
                ) : (
                  <StyledName
                    profile={row.profile}
                    name={displayName(row.profile, row.nickname)}
                  />
                )}
                {row.owner && <span className="ml-1 text-warning">♛</span>}
              </span>
              {row.profile.custom_status && !offline && (
                <span className="truncate text-xs text-muted-foreground">
                  {row.profile.custom_status}
                </span>
              )}
            </span>
          </button>
        </ProfilePopover>
      </div>
    </UserVoiceMenu>
  )
}

function Section({
  title,
  rows,
  serverId,
  offline = false,
}: {
  title: string
  rows: Row[]
  serverId: string | null
  offline?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="px-2 pt-6 pb-1 text-xs font-semibold text-muted-foreground uppercase">
        {title} — {rows.length}
      </h3>
      {rows.map((row) => (
        <MemberRow
          key={row.profile.id}
          row={row}
          serverId={serverId}
          offline={offline}
        />
      ))}
    </div>
  )
}

/** Right-hand member list, grouped by hoisted role then online/offline. */
export function MemberList({
  serverId,
  className,
}: {
  serverId: string
  className?: string
}) {
  const server = useServer(serverId)
  const members = useMembers(serverId)
  const roles = useRoles(serverId)
  const assignments = useMemberRoleAssignments(serverId)
  const presence = presenceStore.useStore((s) => s)

  const groups = useMemo(() => {
    const roleById = new Map((roles ?? []).map((r) => [r.id, r]))
    const hoisted = (roles ?? []).filter((r) => r.hoist && !r.is_default)
    const buckets = new Map<string, Row[]>(hoisted.map((r) => [r.id, []]))
    const online: Row[] = []
    const offline: Row[] = []

    for (const member of members ?? []) {
      const memberRoles = (assignments ?? [])
        .filter((a) => a.user_id === member.user_id)
        .map((a) => roleById.get(a.role_id))
        .filter((r): r is Role => !!r)
        .sort((a, b) => b.position - a.position)

      const row: Row = {
        profile: member.profile,
        nickname: member.nickname,
        color: memberRoles.find((r) => r.color)?.color ?? 0,
        owner: member.user_id === server?.owner_id,
      }

      const isOnline = (presence[member.user_id] ?? "offline") !== "offline"
      if (!isOnline) {
        offline.push(row)
        continue
      }
      const top = memberRoles.find((r) => r.hoist)
      if (top && buckets.has(top.id)) buckets.get(top.id)!.push(row)
      else online.push(row)
    }

    const byName = (a: Row, b: Row) =>
      displayName(a.profile, a.nickname).localeCompare(
        displayName(b.profile, b.nickname)
      )

    return {
      hoisted: hoisted.map((r) => ({
        role: r,
        rows: buckets.get(r.id)!.sort(byName),
      })),
      online: online.sort(byName),
      offline: offline.sort(byName),
    }
  }, [members, roles, assignments, presence, server?.owner_id])

  return (
    <aside
      className={cn(
        "flex w-66 shrink-0 scrollbar-thin flex-col overflow-y-auto border-l border-border bg-sidebar px-2 pb-4",
        className
      )}
    >
      <ServerActivity serverId={serverId} />
      {groups.hoisted.map(({ role, rows }) => (
        <Section
          key={role.id}
          title={role.name}
          rows={rows}
          serverId={serverId}
        />
      ))}
      <Section title="Disponível" rows={groups.online} serverId={serverId} />
      <Section
        title="Offline"
        rows={groups.offline}
        serverId={serverId}
        offline
      />
    </aside>
  )
}

/** Group DM member list. */
export function RecipientList({ recipients }: { recipients: Profile[] }) {
  const presence = presenceStore.useStore((s) => s)
  const rows = recipients.map((profile) => ({
    profile,
    nickname: null,
    color: 0,
    owner: false,
  }))
  return (
    <aside className="flex w-66 shrink-0 scrollbar-thin flex-col overflow-y-auto border-l border-border bg-sidebar px-2 pb-4">
      <Section
        title="Membros"
        rows={rows.filter(
          (r) => (presence[r.profile.id] ?? "offline") !== "offline"
        )}
        serverId={null}
      />
      <Section
        title="Offline"
        rows={rows.filter(
          (r) => (presence[r.profile.id] ?? "offline") === "offline"
        )}
        serverId={null}
        offline
      />
    </aside>
  )
}
