import {
  isTrackReference,
  type TrackReferenceOrPlaceholder,
  useTracks,
  VideoTrack,
} from "@livekit/components-react"
import {
  ArrowsInIcon,
  ArrowsOutIcon,
  CaretDownIcon,
  CaretUpIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PhoneDisconnectIcon,
  SpeakerHighIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from "@phosphor-icons/react"
import { Track } from "livekit-client"
import { useEffect, useRef, useState } from "react"

import { Spinner } from "@/components/spinner"
import { TooltipContent } from "@/components/tooltip-content"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/user-avatar"
import { ChatHeader } from "@/features/layout/chat-header"
import { useProfile } from "@/features/profiles/queries"
import { useMember } from "@/features/servers/queries"
import { UserSettingsDialog } from "@/features/settings/user-settings-dialog"
import { DeviceMenu } from "@/features/voice/device-menu"
import { ScreenSharePopover } from "@/features/voice/screen-share"
import { useSpeaking } from "@/features/voice/speaking"
import { useStageOpen } from "@/features/voice/stream-pip"
import { StreamVolumeControl } from "@/features/voice/stream-volume"
import { UserVoiceMenu } from "@/features/voice/user-voice-menu"
import { useMediaToggles } from "@/features/voice/voice-connected-panel"
import {
  joinVoice,
  leaveVoice,
  toggleMute,
  useChannelVoiceStates,
  useVoice,
} from "@/features/voice/voice-store"
import {
  stopWatching,
  useWatching,
  watchStream,
} from "@/features/voice/watching"
import { displayName } from "@/lib/format"
import { useImageColor } from "@/lib/image-color"
import type { Channel } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Width/height for `count` 16:9 tiles packed into a box, like Discord's grid. */
function useTileSize(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const gap = 8
  let best = { width: 0, height: 0 }
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    const rows = Math.ceil(count / columns)
    const width = Math.min(
      (box.width - gap * (columns - 1)) / columns,
      ((box.height - gap * (rows - 1)) / rows) * (16 / 9)
    )
    if (width > best.width) best = { width, height: (width * 9) / 16 }
  }
  return { ref, size: best }
}

function hexColor(value: number | null | undefined) {
  return value ? `#${value.toString(16).padStart(6, "0")}` : undefined
}

function Tile({
  trackRef,
  serverId,
  width,
  height,
  onClick,
  onWatch,
}: {
  trackRef: TrackReferenceOrPlaceholder
  serverId: string | null
  width: number
  height: number
  onClick: () => void
  onWatch?: () => void
}) {
  const participant = trackRef.participant
  const profile = useProfile(participant.identity)
  const member = useMember(serverId, participant.identity)
  const speaking = useSpeaking(participant.identity)
  const isScreen = trackRef.source === Track.Source.ScreenShare
  const watching = useWatching(participant.identity)
  // someone else's stream we haven't chosen to watch (not even received)
  const unwatched = isScreen && !participant.isLocal && !watching
  const hasVideo =
    isTrackReference(trackRef) && !trackRef.publication.isMuted && !unwatched
  const name = displayName(profile, member?.nickname)
  const small = height < 140
  // like Discord, a tile without video takes the profile's colors: the
  // banner image first, then the banner/accent color, then the avatar
  const bannerColor = useImageColor(profile?.banner_url)
  const avatarColor = useImageColor(profile?.avatar_url)
  const tileColor =
    bannerColor ??
    profile?.banner_color ??
    hexColor(profile?.accent_color) ??
    avatarColor
  // our own stream isn't played back to us, so it has nothing to adjust
  const streamAudio = isScreen && hasVideo && !participant.isLocal

  return (
    <div className="group relative shrink-0" style={{ width, height }}>
      <UserVoiceMenu
        userId={participant.identity}
        serverId={serverId}
        stream={isScreen}
      >
        <button
          type="button"
          onClick={onClick}
          style={{
            // like Discord, a tile without video takes the profile's color
            backgroundColor: hasVideo ? undefined : tileColor,
          }}
          className={cn(
            "relative flex size-full items-center justify-center overflow-hidden rounded-lg bg-card",
            hasVideo && "bg-black",
            speaking && !isScreen && "ring-2 ring-success ring-inset"
          )}
        >
          {hasVideo ? (
            <VideoTrack
              trackRef={trackRef}
              className={cn(
                "size-full",
                isScreen ? "object-contain" : "object-cover"
              )}
            />
          ) : (
            <UserAvatar
              profile={profile ?? null}
              size={small || unwatched ? "lg" : "xl"}
              className={cn(unwatched && !small && "mb-16")}
            />
          )}
          <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-sm font-medium text-white">
            {isScreen && <MonitorArrowUpIcon className="size-4 shrink-0" />}
            <span className="truncate">{name}</span>
            {!isScreen && !participant.isMicrophoneEnabled && (
              <MicrophoneSlashIcon className="size-4 shrink-0 text-danger" />
            )}
          </span>
        </button>
      </UserVoiceMenu>
      {unwatched && !small && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 pt-14">
          <span className="text-sm font-medium text-white">
            {name} está transmitindo
          </span>
          <Button
            size="sm"
            className="pointer-events-auto"
            onClick={() => onWatch?.()}
          >
            Assistir transmissão
          </Button>
        </div>
      )}
      {streamAudio && !small && (
        <>
          <StreamVolumeControl
            userId={participant.identity}
            className="absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          />
          <button
            type="button"
            onClick={() => stopWatching(participant.identity)}
            className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100"
          >
            Parar de assistir
          </button>
        </>
      )}
    </div>
  )
}

function ControlButton({
  label,
  active,
  danger,
  onClick,
  className,
  children,
}: {
  label: string
  active?: boolean
  danger?: boolean
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
              "flex size-12 items-center justify-center rounded-lg bg-card text-header transition-colors hover:bg-accent",
              active && "text-danger",
              danger &&
                "w-16 bg-destructive text-primary-foreground hover:bg-destructive/80",
              className
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The call stage: a grid of tiles; clicking one puts it in the spotlight with
 * everyone else in a strip below, and clicking it again goes back to the grid.
 */
export function VoiceStage({ serverId = null }: { serverId?: string | null }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const { muted, deafened } = useVoice()
  const { isCameraEnabled, isScreenShareEnabled, toggleCamera } =
    useMediaToggles()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [stripHidden, setStripHidden] = useState(false)
  useStageOpen()
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )
  const [focusId, setFocusId] = useState<string | null>(null)

  const keyOf = (t: TrackReferenceOrPlaceholder) =>
    `${t.participant.identity}:${t.source}`
  const focused = tracks.find((t) => keyOf(t) === focusId)
  const others = focused ? tracks.filter((t) => t !== focused) : []
  const toggleFocus = (t: TrackReferenceOrPlaceholder) =>
    setFocusId((id) => (id === keyOf(t) ? null : keyOf(t)))

  const { ref: gridRef, size: tileSize } = useTileSize(
    focused ? 1 : tracks.length
  )

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const toggleFullscreen = () =>
    document.fullscreenElement
      ? void document.exitFullscreen()
      : void stageRef.current?.requestFullscreen()

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 flex-col gap-3 bg-rail p-4"
    >
      <div
        ref={gridRef}
        className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-2"
      >
        {(focused ? [focused] : tracks).map((trackRef) => (
          <Tile
            key={keyOf(trackRef)}
            trackRef={trackRef}
            serverId={serverId}
            width={tileSize.width}
            height={tileSize.height}
            onClick={() => toggleFocus(trackRef)}
            onWatch={() => {
              watchStream(trackRef.participant.identity)
              setFocusId(keyOf(trackRef))
            }}
          />
        ))}
      </div>

      {others.length > 0 && (
        <div className="flex shrink-0 justify-center">
          <button
            type="button"
            onClick={() => setStripHidden((hidden) => !hidden)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-interactive hover:bg-hover hover:text-interactive-hover"
          >
            {stripHidden ? (
              <CaretUpIcon weight="bold" className="size-3" />
            ) : (
              <CaretDownIcon weight="bold" className="size-3" />
            )}
            {stripHidden ? "Mostrar participantes" : "Ocultar participantes"}
          </button>
        </div>
      )}

      {others.length > 0 && !stripHidden && (
        <div className="flex shrink-0 scrollbar-thin justify-center gap-2 overflow-x-auto">
          {others.map((trackRef) => (
            <Tile
              key={keyOf(trackRef)}
              trackRef={trackRef}
              serverId={serverId}
              width={176}
              height={99}
              onClick={() => toggleFocus(trackRef)}
              onWatch={() => {
                watchStream(trackRef.participant.identity)
                setFocusId(keyOf(trackRef))
              }}
            />
          ))}
        </div>
      )}

      <div className="relative flex shrink-0 items-center justify-center gap-2">
        <div className="flex items-center rounded-lg bg-card">
          <ControlButton
            label={muted || deafened ? "Ativar microfone" : "Silenciar"}
            active={muted || deafened}
            onClick={toggleMute}
            className="rounded-r-none"
          >
            {muted || deafened ? (
              <MicrophoneSlashIcon className="size-5" />
            ) : (
              <MicrophoneIcon className="size-5" />
            )}
          </ControlButton>
          <div className="pr-2">
            <DeviceMenu
              kind="audioinput"
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </div>
        <ControlButton
          label={isCameraEnabled ? "Desligar câmera" : "Ligar câmera"}
          active={!isCameraEnabled}
          onClick={toggleCamera}
        >
          {isCameraEnabled ? (
            <VideoCameraIcon className="size-5" />
          ) : (
            <VideoCameraSlashIcon className="size-5" />
          )}
        </ControlButton>
        <ScreenSharePopover>
          <button
            type="button"
            aria-label={
              isScreenShareEnabled ? "Parar transmissão" : "Transmitir tela"
            }
            className={cn(
              "flex size-12 items-center justify-center rounded-lg bg-card text-header transition-colors hover:bg-accent",
              isScreenShareEnabled && "text-success"
            )}
          >
            <MonitorArrowUpIcon className="size-5" />
          </button>
        </ScreenSharePopover>
        <ControlButton label="Desconectar" danger onClick={leaveVoice}>
          <PhoneDisconnectIcon className="size-5" />
        </ControlButton>

        <div className="absolute right-0 flex items-center gap-1">
          <ControlButton
            label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            onClick={toggleFullscreen}
            className="bg-transparent text-interactive hover:bg-hover hover:text-interactive-hover"
          >
            {fullscreen ? (
              <ArrowsInIcon className="size-5" />
            ) : (
              <ArrowsOutIcon className="size-5" />
            )}
          </ControlButton>
        </div>
      </div>

      <UserSettingsDialog
        open={settingsOpen}
        initialTab="voice"
        onOpenChange={setSettingsOpen}
      />
    </div>
  )
}

function VoiceLobby({ channel }: { channel: Channel }) {
  const { connecting } = useVoice()
  const states = useChannelVoiceStates(channel.server_id, channel.id)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="flex -space-x-3">
        {states.slice(0, 6).map((state) => (
          <LobbyAvatar key={state.user_id} userId={state.user_id} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-2xl font-bold text-header">{channel.name}</h2>
        <p className="text-sm text-muted-foreground">
          {states.length === 0
            ? "Ninguém está aqui no momento."
            : `${states.length} ${states.length === 1 ? "pessoa está" : "pessoas estão"} na voz.`}
        </p>
      </div>
      <Button
        size="lg"
        className="bg-success hover:bg-success/80"
        disabled={connecting === channel.id}
        onClick={() => joinVoice(channel.id, channel.server_id!)}
      >
        {connecting === channel.id && <Spinner />}
        Entrar na voz
      </Button>
    </div>
  )
}

function LobbyAvatar({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  return (
    <span className="rounded-full ring-4 ring-rail">
      <UserAvatar profile={profile ?? null} size="xl" />
    </span>
  )
}

/** Opened from a server voice channel. */
export function VoiceView({ channel }: { channel: Channel }) {
  const { connection } = useVoice()
  const here = connection?.channelId === channel.id

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-rail">
      <ChatHeader>
        <SpeakerHighIcon className="size-6 text-channel-icon" />
        <h1 className="font-semibold text-header">{channel.name}</h1>
      </ChatHeader>
      {here ? (
        <VoiceStage serverId={channel.server_id} />
      ) : (
        <VoiceLobby channel={channel} />
      )}
    </div>
  )
}
