import {
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react"
import {
  CellSignalFullIcon,
  CellSignalLowIcon,
  CellSignalMediumIcon,
  MonitorArrowUpIcon,
  PhoneDisconnectIcon,
  SquaresFourIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from "@phosphor-icons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { ConnectionQuality, ConnectionState } from "livekit-client"
import { toast } from "sonner"

import { TooltipContent } from "@/components/tooltip-content"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useDm } from "@/features/dms/queries"
import { PanelButton } from "@/features/layout/user-panel"
import { useChannels, useServer } from "@/features/servers/queries"
import { ScreenSharePopover } from "@/features/voice/screen-share"
import { DM_SCOPE, leaveVoice, useVoice } from "@/features/voice/voice-store"
import { cn } from "@/lib/utils"

const STATE_LABEL: Partial<Record<ConnectionState, string>> = {
  [ConnectionState.Connecting]: "Conectando à voz…",
  [ConnectionState.Reconnecting]: "Reconectando…",
  [ConnectionState.SignalReconnecting]: "Reconectando…",
  [ConnectionState.Connected]: "Voz conectada",
}

export function useMediaToggles() {
  const { localParticipant, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant()

  const toggleCamera = () =>
    localParticipant
      .setCameraEnabled(!isCameraEnabled)
      .catch(() => toast.error("Não foi possível acessar a câmera."))

  return { isCameraEnabled, isScreenShareEnabled, toggleCamera }
}

function SignalIcon() {
  const { localParticipant } = useLocalParticipant()
  const { quality } = useConnectionQualityIndicator({
    participant: localParticipant,
  })
  if (quality === ConnectionQuality.Poor) {
    return <CellSignalLowIcon className="size-5 text-danger" />
  }
  if (quality === ConnectionQuality.Good) {
    return <CellSignalMediumIcon className="size-5 text-warning" />
  }
  return <CellSignalFullIcon className="size-5 text-success" />
}

function ActionButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
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
              "flex h-8 flex-1 items-center justify-center rounded-md bg-hover text-interactive transition-colors hover:bg-selected hover:text-interactive-hover",
              active && "bg-success/20 text-success hover:text-success"
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

/** "Voz conectada" block on top of the user card while in a call. */
export function VoiceConnectedPanel() {
  const navigate = useNavigate()
  const { connection } = useVoice()
  const state = useConnectionState()
  const isDm = connection?.scope === DM_SCOPE
  const server = useServer(isDm ? undefined : connection?.scope)
  const channels = useChannels(isDm ? undefined : connection?.scope)
  const dm = useDm(isDm ? connection?.channelId : undefined)
  const { isCameraEnabled, isScreenShareEnabled, toggleCamera } =
    useMediaToggles()

  if (!connection) return null

  const channel = channels?.find((c) => c.id === connection.channelId)
  const connected = state === ConnectionState.Connected

  const openStage = () =>
    isDm
      ? navigate({
          to: "/channels/@me/$channelId",
          params: { channelId: connection.channelId },
        })
      : navigate({
          to: "/channels/$serverId/$channelId",
          params: {
            serverId: connection.scope,
            channelId: connection.channelId,
          },
        })

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2">
      <div className="flex items-center gap-1">
        {connected ? <SignalIcon /> : null}
        <div className="flex min-w-0 flex-1 flex-col px-1">
          <span
            className={cn(
              "text-sm leading-tight font-semibold",
              connected ? "text-success" : "text-warning"
            )}
          >
            {STATE_LABEL[state] ?? "Desconectado"}
          </span>
          {isDm ? (
            <Link
              to="/channels/@me/$channelId"
              params={{ channelId: connection.channelId }}
              className="truncate text-xs text-muted-foreground hover:underline"
            >
              {dm?.name || "Chamada"}
            </Link>
          ) : (
            <Link
              to="/channels/$serverId/$channelId"
              params={{
                serverId: connection.scope,
                channelId: connection.channelId,
              }}
              className="truncate text-xs text-muted-foreground hover:underline"
            >
              {channel?.name ?? "Voz"} / {server?.name ?? ""}
            </Link>
          )}
        </div>
        <PanelButton label="Desconectar" onClick={leaveVoice}>
          <PhoneDisconnectIcon className="size-5" />
        </PanelButton>
      </div>
      <div className="flex gap-2">
        <ActionButton
          label={isCameraEnabled ? "Desligar câmera" : "Ligar câmera"}
          active={isCameraEnabled}
          onClick={toggleCamera}
        >
          {isCameraEnabled ? (
            <VideoCameraIcon className="size-5" />
          ) : (
            <VideoCameraSlashIcon className="size-5" />
          )}
        </ActionButton>
        <ScreenSharePopover>
          <button
            type="button"
            aria-label="Transmitir tela"
            className={cn(
              "flex h-8 flex-1 items-center justify-center rounded-md bg-hover text-interactive transition-colors hover:bg-selected hover:text-interactive-hover",
              isScreenShareEnabled &&
                "bg-success/20 text-success hover:text-success"
            )}
          >
            <MonitorArrowUpIcon className="size-5" />
          </button>
        </ScreenSharePopover>
        <ActionButton label="Abrir chamada" onClick={openStage}>
          <SquaresFourIcon className="size-5" />
        </ActionButton>
      </div>
    </div>
  )
}
