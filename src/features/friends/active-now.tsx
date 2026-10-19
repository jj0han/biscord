import { SpeakerHighIcon } from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"

import { ServerIcon } from "@/components/server-icon"
import { UserAvatar } from "@/components/user-avatar"
import { useFriends } from "@/features/dms/dm-sidebar"
import { useProfile } from "@/features/profiles/queries"
import { useChannels, useServer } from "@/features/servers/queries"
import { DM_SCOPE, voiceStatesStore } from "@/features/voice/voice-store"
import { displayName } from "@/lib/format"
import type { VoiceState } from "@/lib/types"

function Participant({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  return (
    <span className="rounded-full ring-2 ring-card">
      <UserAvatar profile={profile ?? null} size="sm" />
    </span>
  )
}

function LiveBadge() {
  return (
    <span className="rounded-sm bg-danger px-1 text-[10px] leading-4 font-bold text-primary-foreground uppercase">
      Ao vivo
    </span>
  )
}

function groupByChannel(states: VoiceState[]) {
  const byChannel = new Map<string, VoiceState[]>()
  for (const state of states) {
    byChannel.set(state.channel_id, [
      ...(byChannel.get(state.channel_id) ?? []),
      state,
    ])
  }
  return byChannel
}

function VoiceCard({
  scope,
  channelId,
  states,
  friendIds,
}: {
  scope: string
  channelId: string
  states: VoiceState[]
  friendIds: Set<string>
}) {
  const server = useServer(scope)
  const channel = useChannels(scope)?.find((c) => c.id === channelId)
  const firstFriend = useProfile(
    states.find((s) => friendIds.has(s.user_id))?.user_id
  )

  if (!server) return null
  const streaming = states.some((s) => s.streaming)

  return (
    <Link
      to="/channels/$serverId/$channelId"
      params={{ serverId: scope, channelId }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-hover"
    >
      <div className="flex items-center gap-3">
        <UserAvatar
          profile={firstFriend ?? null}
          size="lg"
          showStatus
          surface="card"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-header">
            {displayName(firstFriend)}
            {states.length > 1 && ` e mais ${states.length - 1}`}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {streaming ? "Transmitindo" : "Em um canal de voz"}
            {streaming && <LiveBadge />}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-md bg-background p-2">
        <ServerIcon
          name={server.name}
          iconUrl={server.icon_url}
          className="size-8 rounded-lg text-xs"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-header">
            {server.name}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <SpeakerHighIcon className="size-3" />
            {channel?.name}
          </span>
        </div>
        <div className="flex -space-x-2">
          {states.slice(0, 4).map((s) => (
            <Participant key={s.user_id} userId={s.user_id} />
          ))}
        </div>
      </div>
    </Link>
  )
}

/** Right column of the friends page: friends hanging out in voice right now. */
export function ActiveNow() {
  const { friends } = useFriends()
  const scopes = voiceStatesStore.useStore((s) => s)

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends])

  const cards = useMemo(() => {
    const result: { scope: string; channelId: string; states: VoiceState[] }[] =
      []
    for (const [scope, states] of Object.entries(scopes)) {
      if (scope === DM_SCOPE) continue
      for (const [channelId, list] of groupByChannel(states)) {
        if (list.some((s) => friendIds.has(s.user_id))) {
          result.push({ scope, channelId, states: list })
        }
      }
    }
    return result
  }, [scopes, friendIds])

  return (
    <aside className="hidden w-90 shrink-0 scrollbar-thin flex-col gap-4 overflow-y-auto border-l border-border p-4 lg:flex">
      <h2 className="text-xl font-bold text-header">Ativo agora</h2>
      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <span className="font-semibold text-header">
            Está quieto por enquanto...
          </span>
          <span className="text-sm text-muted-foreground">
            Quando um amigo entrar em um canal de voz, vamos mostrar aqui!
          </span>
        </div>
      ) : (
        cards.map((card) => (
          <VoiceCard
            key={`${card.scope}:${card.channelId}`}
            {...card}
            friendIds={friendIds}
          />
        ))
      )}
    </aside>
  )
}

const NO_STATES: VoiceState[] = []

/** "Atividade" at the top of a server's member list: who's in voice now. */
export function ServerActivity({ serverId }: { serverId: string }) {
  const states = voiceStatesStore.useStore((s) => s[serverId] ?? NO_STATES)
  const channels = useChannels(serverId)
  const groups = useMemo(() => [...groupByChannel(states)], [states])

  if (groups.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-2 pt-6 pb-1 text-xs font-semibold text-muted-foreground uppercase">
        Atividade — {groups.length}
      </h3>
      {groups.map(([channelId, list]) => (
        <Link
          key={channelId}
          to="/channels/$serverId/$channelId"
          params={{ serverId, channelId }}
          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-hover"
        >
          <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-header">
            <SpeakerHighIcon className="size-4 shrink-0 text-channel-icon" />
            <span className="truncate">
              {channels?.find((c) => c.id === channelId)?.name}
            </span>
            {list.some((s) => s.streaming) && <LiveBadge />}
          </span>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {list.slice(0, 5).map((s) => (
                <Participant key={s.user_id} userId={s.user_id} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {list.length} na voz
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
