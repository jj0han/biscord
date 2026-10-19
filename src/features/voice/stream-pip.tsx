import {
  isTrackReference,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from "@livekit/components-react"
import {
  ArrowSquareOutIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
  MonitorArrowUpIcon,
  PhoneDisconnectIcon,
} from "@phosphor-icons/react"
import { useNavigate } from "@tanstack/react-router"
import { Track } from "livekit-client"
import { useEffect, useRef, useState } from "react"

import { TooltipContent } from "@/components/tooltip-content"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useProfile } from "@/features/profiles/queries"
import { StreamVolumeControl } from "@/features/voice/stream-volume"
import {
  DM_SCOPE,
  leaveVoice,
  toggleMute,
  useVoice,
} from "@/features/voice/voice-store"
import { displayName } from "@/lib/format"
import { playSound } from "@/lib/sounds"
import { createStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/** How many call stages are on screen; the PiP only shows when none is. */
const stageOpenStore = createStore(0)

/** Called by the call stage while it is mounted. */
export function useStageOpen() {
  useEffect(() => {
    stageOpenStore.set((n) => n + 1)
    return () => stageOpenStore.set((n) => n - 1)
  }, [])
}

const WIDTH = 320
const HEIGHT = 180
const MARGIN = 16

function clamp(pos: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(MARGIN, pos.x), window.innerWidth - WIDTH - MARGIN),
    y: Math.min(Math.max(MARGIN, pos.y), window.innerHeight - HEIGHT - MARGIN),
  }
}

function PipButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
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
              "flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80",
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
 * Discord's in-app mini player: while a stream is live in our call and the
 * call stage is off screen, it floats over the app. Drag it anywhere; click
 * the video (or the arrow) to go back to the call, where it disappears.
 */
export function StreamPip() {
  const navigate = useNavigate()
  const { connection, muted, deafened } = useVoice()
  const stageOpen = stageOpenStore.useStore((n) => n > 0)
  const { localParticipant } = useLocalParticipant()
  const streams = useTracks([Track.Source.ScreenShare]).filter(isTrackReference)
  // other people's streams first; our own only when nobody else is live
  const stream =
    streams.find((s) => !s.participant.isLocal) ?? streams.at(0) ?? null
  const userId = stream?.participant.identity ?? ""
  const profile = useProfile(userId)

  const [pos, setPos] = useState(() =>
    clamp({
      x: window.innerWidth - WIDTH - MARGIN,
      y: window.innerHeight - HEIGHT - 96,
    })
  )
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  if (!connection || stageOpen || !stream) return null

  const backToCall = () =>
    connection.scope === DM_SCOPE
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

  const micOff = muted || deafened
  const own = stream.participant.isLocal

  return (
    <div
      className="group fixed z-50 overflow-hidden rounded-lg bg-black shadow-2xl ring-1 ring-border"
      style={{ left: pos.x, top: pos.y, width: WIDTH, height: HEIGHT }}
    >
      <div
        className="size-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            dx: e.clientX - pos.x,
            dy: e.clientY - pos.y,
            moved: false,
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const next = { x: e.clientX - d.dx, y: e.clientY - d.dy }
          if (Math.abs(next.x - pos.x) + Math.abs(next.y - pos.y) > 2) {
            d.moved = true
          }
          setPos(clamp(next))
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved) backToCall()
        }}
      >
        <VideoTrack
          trackRef={stream}
          className="pointer-events-none size-full object-contain"
        />
      </div>

      <span className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        <MonitorArrowUpIcon className="size-3.5 shrink-0" />
        <span className="truncate">
          {own ? "Sua transmissão" : displayName(profile)}
        </span>
      </span>

      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <PipButton
          label={micOff ? "Ativar microfone" : "Silenciar"}
          onClick={toggleMute}
          className={cn(micOff && "text-danger")}
        >
          {micOff ? (
            <MicrophoneSlashIcon className="size-4" />
          ) : (
            <MicrophoneIcon className="size-4" />
          )}
        </PipButton>
        {own ? (
          <PipButton
            label="Parar transmissão"
            onClick={() => {
              void localParticipant.setScreenShareEnabled(false)
              playSound("streamStop")
            }}
            className="text-success"
          >
            <MonitorArrowUpIcon className="size-4" />
          </PipButton>
        ) : (
          <StreamVolumeControl userId={userId} className="h-8" />
        )}
        <span className="flex-1" />
        <PipButton label="Voltar para a chamada" onClick={backToCall}>
          <ArrowSquareOutIcon className="size-4" />
        </PipButton>
        <PipButton
          label="Desconectar"
          onClick={leaveVoice}
          className="bg-destructive hover:bg-destructive/80"
        >
          <PhoneDisconnectIcon className="size-4" />
        </PipButton>
      </div>
    </div>
  )
}
