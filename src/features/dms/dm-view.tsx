import {
  AtIcon,
  PhoneIcon,
  UsersIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { dmTitle, useFriends } from "@/features/dms/dm-sidebar"
import { otherRecipients, useDm } from "@/features/dms/queries"
import {
  ChatHeader,
  HeaderButton,
  MuteChannelButton,
} from "@/features/layout/chat-header"
import { ChatPane } from "@/features/messages/chat-pane"
import { PinsPopover } from "@/features/messages/pins-popover"
import { SearchBox, SearchPanel } from "@/features/messages/search-panel"
import { GuildTag } from "@/features/profiles/profile-popover"
import { RecipientList } from "@/features/servers/member-list"
import {
  DM_SCOPE,
  joinVoice,
  useChannelVoiceStates,
  useVoice,
} from "@/features/voice/voice-store"
import { VoiceStage } from "@/features/voice/voice-view"
import { displayName } from "@/lib/format"

const DM_PERMISSIONS = {
  canSend: true,
  canReact: true,
  canAttach: true,
  canManageMessages: false,
  canMentionEveryone: false,
}

function CallBanner({ channelId }: { channelId: string }) {
  const { connection, connecting } = useVoice()
  const states = useChannelVoiceStates(DM_SCOPE, channelId)
  const inCall = connection?.channelId === channelId

  if (inCall) {
    return (
      <div className="flex h-[45%] min-h-60 shrink-0 flex-col bg-rail">
        <VoiceStage />
      </div>
    )
  }
  if (states.length === 0) return null

  return (
    <div className="flex shrink-0 flex-col items-center gap-4 bg-rail py-8">
      <span className="text-sm text-muted-foreground">
        Chamada em andamento
      </span>
      <Button
        className="bg-success hover:bg-success/80"
        disabled={connecting === channelId}
        onClick={() => joinVoice(channelId, DM_SCOPE)}
      >
        <PhoneIcon />
        Entrar na chamada
      </Button>
    </div>
  )
}

export function DmView({ channelId }: { channelId: string }) {
  const userId = useUserId()
  const dm = useDm(channelId)
  const { friends } = useFriends()
  const [search, setSearch] = useState("")
  const [showMembers, setShowMembers] = useState(true)

  const people = useMemo(
    () =>
      (dm?.recipients ?? []).map((profile) => ({ profile, nickname: null })),
    [dm]
  )

  if (!dm) {
    return (
      <Empty className="flex-1 bg-background">
        <EmptyHeader>
          <EmptyTitle>Conversa não encontrada</EmptyTitle>
          <EmptyDescription>
            Essa conversa não existe ou você saiu dela.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const others = otherRecipients(dm, userId)
  const other = others[0]
  const isGroup = dm.type === "group_dm"
  const title = dmTitle(dm, userId)
  const isFriend = !!other && friends.some((f) => f.id === other.id)

  const sidePanel = search.trim() ? (
    <SearchPanel channelIds={[dm.id]} term={search.trim()} />
  ) : isGroup && showMembers ? (
    <RecipientList recipients={dm.recipients} />
  ) : null

  return (
    <ChatPane
      channel={dm}
      serverId={null}
      people={people}
      mentionChannels={[]}
      permissions={DM_PERMISSIONS}
      placeholder={
        isGroup
          ? `Conversar em ${title}`
          : `Conversar com @${displayName(other)}`
      }
      sidePanel={sidePanel}
      header={
        <>
          <ChatHeader
            actions={
              <>
                <HeaderButton
                  label="Iniciar chamada de voz"
                  onClick={() => joinVoice(dm.id, DM_SCOPE)}
                >
                  <PhoneIcon className="size-5" />
                </HeaderButton>
                <HeaderButton
                  label="Iniciar chamada de vídeo"
                  onClick={() => joinVoice(dm.id, DM_SCOPE, { video: true })}
                >
                  <VideoCameraIcon className="size-5" />
                </HeaderButton>
                <MuteChannelButton channelId={dm.id} />
                <PinsPopover channelId={dm.id} />
                {isGroup && (
                  <HeaderButton
                    label="Mostrar lista de membros"
                    active={showMembers}
                    onClick={() => setShowMembers((v) => !v)}
                  >
                    <UsersIcon className="size-5" />
                  </HeaderButton>
                )}
                <SearchBox value={search} onChange={setSearch} />
              </>
            }
          >
            {isGroup ? (
              <UsersIcon className="size-5 text-channel-icon" />
            ) : (
              <AtIcon className="size-5 text-channel-icon" />
            )}
            <h1 className="truncate font-semibold text-header">{title}</h1>
          </ChatHeader>
          <CallBanner channelId={dm.id} />
        </>
      }
      welcome={
        <div className="flex flex-col gap-2 px-4 pt-16 pb-4">
          <UserAvatar profile={other ?? null} size="xl" />
          <h2 className="text-3xl font-bold text-header">{title}</h2>
          {!isGroup && other && (
            <span className="flex items-center gap-2 text-xl text-header">
              {other.username}
              <GuildTag profile={other} />
            </span>
          )}
          <p className="text-muted-foreground">
            {isGroup
              ? `Bem-vindo(a) ao começo do grupo ${title}.`
              : `Este é o começo do seu histórico de mensagens diretas com ${displayName(other)}.`}
          </p>
          {!isGroup && !isFriend && (
            <p className="text-sm text-muted-foreground">
              Vocês ainda não são amigos.
            </p>
          )}
        </div>
      }
    />
  )
}
