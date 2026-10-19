import { useParticipants } from "@livekit/components-react"
import {
  CaretDownIcon,
  CaretUpIcon,
  GearSixIcon,
  HashIcon,
  MicrophoneSlashIcon,
  SpeakerHighIcon,
  UserPlusIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import type { Participant } from "livekit-client"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { HeadphonesSlashIcon } from "@/components/icons"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/user-avatar"
import { SidebarShell } from "@/features/layout/sidebar-shell"
import { markRead, unreadQuery } from "@/features/messages/queries"
import { useChannelUnread } from "@/features/messages/unread"
import { ProfilePopover } from "@/features/profiles/profile-popover"
import { useProfile } from "@/features/profiles/queries"
import { mutedChannelsStore } from "@/features/realtime/muted-channels"
import { ChannelSettingsDialog } from "@/features/servers/channel-dialogs"
import { useHideMuted } from "@/features/servers/hide-muted"
import { InviteDialog } from "@/features/servers/invite-dialog"
import {
  useChannels,
  useMember,
  usePermissions,
  useServer,
} from "@/features/servers/queries"
import { ServerMenuItems, useServerMenu } from "@/features/servers/server-menu"
import { useSpeaking } from "@/features/voice/speaking"
import { UserVoiceMenu } from "@/features/voice/user-voice-menu"
import {
  joinVoice,
  useChannelVoiceStates,
  useVoice,
} from "@/features/voice/voice-store"
import { displayName } from "@/lib/format"
import { Permission } from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"
import { supabase } from "@/lib/supabase"
import type { Channel, VoiceState } from "@/lib/types"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ServerHeader({ serverId }: { serverId: string }) {
  const server = useServer(serverId)
  const menu = useServerMenu(serverId)
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-sidebar-border px-2">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-left font-semibold text-header transition-colors hover:bg-hover"
              />
            }
          >
            <span className="truncate">{server?.name}</span>
            {open ? (
              <CaretUpIcon weight="bold" className="size-4 shrink-0" />
            ) : (
              <CaretDownIcon weight="bold" className="size-4 shrink-0" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" sideOffset={4} align="start">
            <ServerMenuItems menu={menu} kind="dropdown" />
          </DropdownMenuContent>
        </DropdownMenu>
        {menu.canInvite && (
          <button
            type="button"
            aria-label="Convidar para o servidor"
            onClick={() => menu.open("invite")}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-interactive hover:bg-hover hover:text-interactive-hover"
          >
            <UserPlusIcon className="size-5" />
          </button>
        )}
      </div>
      {menu.dialogs}
    </>
  )
}

// ---------------------------------------------------------------------------
// Voice users nested under a voice channel
// ---------------------------------------------------------------------------

function LiveSpeakingAvatar({
  participant,
  profile,
}: {
  participant: Participant
  profile: ReturnType<typeof useProfile>
}) {
  const speaking = useSpeaking(participant.identity)
  return <UserAvatar profile={profile ?? null} size="sm" speaking={speaking} />
}

function VoiceUser({
  state,
  serverId,
  participant,
}: {
  state: VoiceState
  serverId: string
  participant: Participant | undefined
}) {
  const profile = useProfile(state.user_id)
  const member = useMember(serverId, state.user_id)
  return (
    <UserVoiceMenu userId={state.user_id} serverId={serverId}>
      <div>
        <ProfilePopover userId={state.user_id} serverId={serverId}>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-interactive hover:bg-hover hover:text-interactive-hover"
          >
            {participant ? (
              <LiveSpeakingAvatar participant={participant} profile={profile} />
            ) : (
              <UserAvatar profile={profile ?? null} size="sm" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {displayName(profile, member?.nickname)}
            </span>
            {state.streaming && (
              <span className="rounded-sm bg-danger px-1 text-[10px] font-bold text-primary-foreground uppercase">
                Ao vivo
              </span>
            )}
            {state.video && <VideoCameraIcon className="size-4" />}
            {state.muted && !state.deafened && (
              <MicrophoneSlashIcon className="size-4 text-channel-icon" />
            )}
            {state.deafened && (
              <HeadphonesSlashIcon className="size-4 text-channel-icon" />
            )}
          </button>
        </ProfilePopover>
      </div>
    </UserVoiceMenu>
  )
}

function VoiceUsers({ channel }: { channel: Channel }) {
  const serverId = channel.server_id!
  const states = useChannelVoiceStates(serverId, channel.id)
  const { connection } = useVoice()
  const participants = useParticipants()

  const byIdentity = useMemo(
    () =>
      connection?.channelId === channel.id
        ? new Map(participants.map((p) => [p.identity, p]))
        : new Map<string, Participant>(),
    [participants, connection?.channelId, channel.id]
  )

  if (states.length === 0) return null
  return (
    <div className="flex flex-col pb-1 pl-6">
      {states.map((state) => (
        <VoiceUser
          key={state.user_id}
          state={state}
          serverId={serverId}
          participant={byIdentity.get(state.user_id)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drag & drop ordering
// ---------------------------------------------------------------------------

type Layout = {
  loose: Channel[]
  categories: { category: Channel; channels: Channel[] }[]
}

/** Where a dragged item will land: before `id`, or inside category `into`. */
type DropTarget =
  | { kind: "before"; id: string }
  | { kind: "into"; categoryId: string }
  | { kind: "end" }

const DRAG_TYPE = "application/x-biscord-channel"

function buildLayout(channels: Channel[]): Layout {
  const byPosition = (a: Channel, b: Channel) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at)
  return {
    loose: channels
      .filter((c) => c.type !== "category" && !c.parent_id)
      .sort(byPosition),
    categories: channels
      .filter((c) => c.type === "category")
      .sort(byPosition)
      .map((category) => ({
        category,
        channels: channels
          .filter((c) => c.parent_id === category.id)
          .sort(byPosition),
      })),
  }
}

/** Applies a drop and returns the new positions/parents for every item. */
function applyDrop(layout: Layout, dragged: Channel, target: DropTarget) {
  const loose = layout.loose.filter((c) => c.id !== dragged.id)
  let categories = layout.categories
    .filter(({ category }) => category.id !== dragged.id)
    .map(({ category, channels }) => ({
      category,
      channels: channels.filter((c) => c.id !== dragged.id),
    }))

  if (dragged.type === "category") {
    const moving = layout.categories.find((g) => g.category.id === dragged.id)!
    const index =
      target.kind === "before"
        ? categories.findIndex((g) => g.category.id === target.id)
        : -1
    categories =
      index === -1
        ? [...categories, moving]
        : [...categories.slice(0, index), moving, ...categories.slice(index)]
  } else if (target.kind === "into") {
    const group = categories.find((g) => g.category.id === target.categoryId)
    group?.channels.unshift(dragged)
  } else if (target.kind === "end") {
    loose.push(dragged)
  } else {
    const lists = [loose, ...categories.map((g) => g.channels)]
    const list = lists.find((l) => l.some((c) => c.id === target.id)) ?? loose
    list.splice(
      list.findIndex((c) => c.id === target.id),
      0,
      dragged
    )
  }

  return [
    ...loose.map((c, i) => ({ id: c.id, position: i, parent_id: "" })),
    ...categories.flatMap(({ category, channels }, i) => [
      { id: category.id, position: i, parent_id: "" },
      ...channels.map((c, j) => ({
        id: c.id,
        position: j,
        parent_id: category.id,
      })),
    ]),
  ]
}

type DragProps = {
  draggable: boolean
  dragging: string | null
  setDragging: (id: string | null) => void
  dropTarget: DropTarget | null
  setDropTarget: (target: DropTarget | null) => void
  onDrop: (target: DropTarget) => void
  isCategory: (id: string) => boolean
}

function dragHandlers(item: Channel, target: DropTarget, drag: DragProps) {
  if (!drag.draggable) return {}
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, item.id)
      e.dataTransfer.effectAllowed = "move"
      drag.setDragging(item.id)
    },
    onDragEnd: () => {
      drag.setDragging(null)
      drag.setDropTarget(null)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!drag.dragging || drag.dragging === item.id) return
      e.preventDefault()
      e.stopPropagation()
      drag.setDropTarget(target)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      drag.onDrop(target)
    },
  }
}

function sameTarget(a: DropTarget | null, b: DropTarget) {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === "before" && b.kind === "before") return a.id === b.id
  if (a.kind === "into" && b.kind === "into")
    return a.categoryId === b.categoryId
  return true
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** "2:25:10" since the first person joined, like Discord's voice timer. */
function ElapsedTime({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const total = Math.max(
    0,
    Math.floor((now - new Date(since).getTime()) / 1000)
  )
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    <span className="text-xs text-success tabular-nums">
      {h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`}
    </span>
  )
}

function ChannelRow({
  channel,
  active,
  drag,
}: {
  channel: Channel
  active: boolean
  drag: DragProps
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermissions(channel.server_id)
  const { unread, mentions } = useChannelUnread(channel.id)
  const [dialog, setDialog] = useState<"invite" | "settings" | null>(null)
  const serverId = channel.server_id!

  const Icon = channel.type === "voice" ? SpeakerHighIcon : HashIcon
  const voiceStates = useChannelVoiceStates(
    channel.type === "voice" ? serverId : null,
    channel.id
  )
  const occupied = voiceStates.length > 0
  const target: DropTarget = { kind: "before", id: channel.id }

  const open = () => {
    if (channel.type === "voice") {
      void joinVoice(channel.id, serverId)
    }
    navigate({
      to: "/channels/$serverId/$channelId",
      params: { serverId, channelId: channel.id },
    })
  }

  const markAsRead = async () => {
    await markRead(channel.id)
    await qc.invalidateQueries({ queryKey: unreadQuery.queryKey })
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            "group/channel relative",
            drag.dragging === channel.id && "opacity-40"
          )}
          {...dragHandlers(channel, target, drag)}
        >
          {sameTarget(drag.dropTarget, target) && (
            <span className="absolute inset-x-1 -top-px h-0.5 rounded-full bg-primary" />
          )}
          {unread && !active && (
            <span className="absolute top-1/2 -left-2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-header" />
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => e.key === "Enter" && open()}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-channel-icon transition-colors hover:bg-hover hover:text-interactive-hover",
              active &&
                "bg-selected text-header hover:bg-selected hover:text-header",
              unread && !active && "text-header"
            )}
          >
            <Icon
              weight={channel.type === "voice" ? "fill" : "bold"}
              className={cn("size-5 shrink-0", occupied && "text-success")}
            />
            <span className="min-w-0 flex-1 truncate">{channel.name}</span>
            {occupied && (
              <ElapsedTime
                since={voiceStates.reduce(
                  (min, s) => (s.joined_at < min ? s.joined_at : min),
                  voiceStates[0].joined_at
                )}
              />
            )}
            {mentions > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-primary-foreground">
                {mentions}
              </span>
            )}
            <span
              className={cn(
                "hidden items-center gap-1",
                active ? "flex" : "group-hover/channel:flex"
              )}
            >
              {can(Permission.CreateInvite) && (
                <button
                  type="button"
                  aria-label="Criar convite"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDialog("invite")
                  }}
                  className="text-interactive hover:text-interactive-hover"
                >
                  <UserPlusIcon className="size-4" />
                </button>
              )}
              {can(Permission.ManageChannels) && (
                <button
                  type="button"
                  aria-label="Editar canal"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDialog("settings")
                  }}
                  className="text-interactive hover:text-interactive-hover"
                >
                  <GearSixIcon className="size-4" />
                </button>
              )}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {channel.type === "text" && (
            <ContextMenuItem onClick={markAsRead} disabled={!unread}>
              Marcar como lida
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => setDialog("invite")}>
            Convidar para o servidor
          </ContextMenuItem>
          {can(Permission.ManageChannels) && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => setDialog("settings")}>
                Editar canal
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(channel.id)}
          >
            Copiar ID do canal
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {channel.type === "voice" && <VoiceUsers channel={channel} />}
      <InviteDialog
        serverId={serverId}
        open={dialog === "invite"}
        onOpenChange={(o) => setDialog(o ? "invite" : null)}
      />
      <ChannelSettingsDialog
        channel={channel}
        open={dialog === "settings"}
        onOpenChange={(o) => setDialog(o ? "settings" : null)}
      />
    </>
  )
}

function Category({
  category,
  channels,
  activeId,
  drag,
}: {
  category: Channel
  channels: Channel[]
  activeId: string | undefined
  drag: DragProps
}) {
  const storageKey = `category-collapsed:${category.id}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true"
    } catch {
      return false
    }
  })
  const { can } = usePermissions(category.server_id)
  const [editing, setEditing] = useState(false)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(storageKey, String(next))
    } catch {
      // collapsed state is a convenience
    }
  }

  // collapsed categories still show the active channel, like Discord
  const visible = collapsed
    ? channels.filter((c) => c.id === activeId)
    : channels

  // dragging a category drops it before this one; a channel drops inside
  const target: DropTarget =
    drag.dragging && drag.isCategory(drag.dragging)
      ? { kind: "before", id: category.id }
      : { kind: "into", categoryId: category.id }
  const categoryLandsHere = sameTarget(drag.dropTarget, {
    kind: "before",
    id: category.id,
  })

  return (
    <div className="flex flex-col gap-0.5 pt-4">
      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            "relative flex items-center rounded-md pr-2",
            drag.dragging === category.id && "opacity-40",
            sameTarget(drag.dropTarget, {
              kind: "into",
              categoryId: category.id,
            }) && "bg-primary/15"
          )}
          {...dragHandlers(category, target, drag)}
        >
          {categoryLandsHere && (
            <span className="absolute inset-x-1 -top-2 h-0.5 rounded-full bg-primary" />
          )}
          <button
            type="button"
            onClick={toggle}
            className="flex flex-1 items-center gap-0.5 py-0.5 text-xs font-semibold text-channel-icon uppercase hover:text-interactive-hover"
          >
            <CaretDownIcon
              weight="bold"
              className={cn(
                "size-3 transition-transform",
                collapsed && "-rotate-90"
              )}
            />
            <span className="truncate">{category.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={toggle}>
            {collapsed ? "Expandir categoria" : "Recolher categoria"}
          </ContextMenuItem>
          {can(Permission.ManageChannels) && (
            <ContextMenuItem onClick={() => setEditing(true)}>
              Editar categoria
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(category.id)}
          >
            Copiar ID da categoria
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {visible.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          active={channel.id === activeId}
          drag={drag}
        />
      ))}
      <ChannelSettingsDialog
        channel={category}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  )
}

export function ChannelSidebar({ serverId }: { serverId: string }) {
  const qc = useQueryClient()
  const params = useParams({ strict: false })
  const channels = useChannels(serverId)
  const { can } = usePermissions(serverId)
  const menu = useServerMenu(serverId)
  const hideMuted = useHideMuted(serverId)
  const mutedIds = mutedChannelsStore.useStore((ids) => ids)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const layout = useMemo(() => {
    const all = (channels ?? []).filter(
      (c) => !hideMuted || !mutedIds.includes(c.id) || c.id === params.channelId
    )
    return buildLayout(all)
  }, [channels, hideMuted, mutedIds, params.channelId])

  const drop = async (target: DropTarget) => {
    const dragged = channels?.find((c) => c.id === dragging)
    setDragging(null)
    setDropTarget(null)
    if (!dragged || !channels) return

    const items = applyDrop(buildLayout(channels), dragged, target)
    const key = queryKeys.channels(serverId)
    const previous = qc.getQueryData<Channel[]>(key)
    qc.setQueryData<Channel[]>(key, (list) =>
      list?.map((c) => {
        const item = items.find((i) => i.id === c.id)
        return item
          ? { ...c, position: item.position, parent_id: item.parent_id || null }
          : c
      })
    )
    const { error } = await supabase.rpc("reorder_channels", {
      p_server: serverId,
      p_layout: items,
    })
    if (error) {
      qc.setQueryData(key, previous)
      toast.error("Não foi possível reorganizar os canais.")
    }
  }

  const drag: DragProps = {
    draggable: can(Permission.ManageChannels),
    dragging,
    setDragging,
    dropTarget,
    setDropTarget,
    onDrop: drop,
    isCategory: (id) =>
      channels?.some((c) => c.id === id && c.type === "category") ?? false,
  }

  return (
    <SidebarShell header={<ServerHeader serverId={serverId} />}>
      <ContextMenu>
        <ContextMenuTrigger
          className="flex min-h-full flex-col"
          onDragOver={(e) => {
            if (!dragging) return
            e.preventDefault()
            setDropTarget({ kind: "end" })
          }}
          onDrop={(e) => {
            e.preventDefault()
            void drop({ kind: "end" })
          }}
        >
          <div className="flex flex-col gap-0.5">
            {layout.loose.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                active={channel.id === params.channelId}
                drag={drag}
              />
            ))}
          </div>
          {layout.categories.map(({ category, channels: children }) => (
            <Category
              key={category.id}
              category={category}
              channels={children}
              activeId={params.channelId}
              drag={drag}
            />
          ))}
          <div className="min-h-8 flex-1" />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ServerMenuItems menu={menu} kind="context" variant="sidebar" />
        </ContextMenuContent>
      </ContextMenu>
      {menu.dialogs}
    </SidebarShell>
  )
}
