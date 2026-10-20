import { useLocalParticipant } from "@livekit/components-react"
import { MonitorArrowUpIcon } from "@phosphor-icons/react"
import {
  type AudioCaptureOptions,
  AudioPresets,
  type LocalAudioTrack,
  type LocalParticipant,
  type LocalTrackPublication,
  type LocalVideoTrack,
  ParticipantEvent,
  type ScreenShareCaptureOptions,
  Track,
} from "livekit-client"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  hasNativeStreamAudio,
  type NativeStreamAudio,
  startNativeStreamAudio,
} from "@/features/voice/native-stream-audio"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"

const RESOLUTIONS = [
  { key: "720", label: "720p", width: 1280, height: 720, bitrate: 2_500_000 },
  {
    key: "1080",
    label: "1080p",
    width: 1920,
    height: 1080,
    bitrate: 5_000_000,
  },
  {
    key: "1440",
    label: "1440p",
    width: 2560,
    height: 1440,
    bitrate: 8_000_000,
  },
] as const

const FRAME_RATES = [15, 30, 60] as const

type StreamSettings = {
  resolution: (typeof RESOLUTIONS)[number]["key"]
  frameRate: (typeof FRAME_RATES)[number]
  audio: boolean
  /** leave Discord's audio out of the stream (Windows desktop) */
  skipDiscord: boolean
}

const KEY = "voice:stream-settings"

function loadSettings(): StreamSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaults, ...(JSON.parse(raw) as StreamSettings) }
  } catch {
    // fall back to defaults
  }
  return defaults
}

const defaults: StreamSettings = {
  resolution: "1080",
  frameRate: 30,
  audio: true,
  skipDiscord: true,
}

/** Stereo Opus at 128 kbps without DTX/RED: music and games keep their range. */
const STREAM_AUDIO_PUBLISH = {
  audioPreset: AudioPresets.musicHighQualityStereo,
  forceStereo: true,
  dtx: false,
  red: false,
}

function captureOptions(
  settings: StreamSettings,
  native: boolean
): ScreenShareCaptureOptions {
  const resolution = RESOLUTIONS.find((r) => r.key === settings.resolution)!
  const browserAudio = settings.audio && !native
  return {
    audio: browserAudio
      ? ({
          // raw game/app audio sounds better without voice processing
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
          // keep Biscord's own playback (everyone's voices) out of the
          // capture, otherwise the call hears itself twice
          restrictOwnAudio: true,
          suppressLocalAudioPlayback: true,
        } as unknown as AudioCaptureOptions)
      : false,
    systemAudio: browserAudio ? "include" : "exclude",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    contentHint: settings.frameRate >= 30 ? "motion" : "detail",
    resolution: {
      width: resolution.width,
      height: resolution.height,
      frameRate: settings.frameRate,
    },
  }
}

let nativeAudio: NativeStreamAudio | null = null

async function stopNativeAudio() {
  const current = nativeAudio
  nativeAudio = null
  await current?.stop()
}

/** The shared window's title (Chromium labels window captures with it). */
function sharedWindowTitle(participant: LocalParticipant) {
  const track = participant.getTrackPublication(Track.Source.ScreenShare)?.track
    ?.mediaStreamTrack
  const surface = (track?.getSettings() as { displaySurface?: string })
    ?.displaySurface
  return surface === "window" ? (track?.label ?? null) : null
}

/**
 * Publishes the native capture as the stream's audio (or swaps it in after
 * "Mudar transmissão"): a shared window sends only its app's sound.
 */
async function publishNativeAudio(
  participant: LocalParticipant,
  settings: StreamSettings
) {
  const previous = nativeAudio
  nativeAudio = await startNativeStreamAudio(
    settings.skipDiscord,
    sharedWindowTitle(participant)
  )
  const published = participant.getTrackPublication(
    Track.Source.ScreenShareAudio
  )?.track as LocalAudioTrack | undefined
  if (published) {
    await published.replaceTrack(nativeAudio.track, true)
    await previous?.stop()
    return
  }
  await previous?.stop()
  await participant.publishTrack(nativeAudio.track, {
    source: Track.Source.ScreenShareAudio,
    name: "screen_share_audio",
    ...STREAM_AUDIO_PUBLISH,
  })
  // ending the stream any other way (e.g. the OS "stop sharing" bar)
  const onUnpublished = (publication: LocalTrackPublication) => {
    if (publication.source !== Track.Source.ScreenShare) return
    participant.off(ParticipantEvent.LocalTrackUnpublished, onUnpublished)
    const audio = participant.getTrackPublication(Track.Source.ScreenShareAudio)
    if (audio?.track) void participant.unpublishTrack(audio.track)
    void stopNativeAudio()
  }
  participant.on(ParticipantEvent.LocalTrackUnpublished, onUnpublished)
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
  format,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  format: (value: T) => string
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-input p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md py-1.5 text-sm font-medium text-interactive transition-colors hover:text-interactive-hover",
            value === option &&
              "bg-primary text-primary-foreground hover:text-primary-foreground"
          )}
        >
          {format(option)}
        </button>
      ))}
    </div>
  )
}

/**
 * Discord's "Go Live" picker: resolution, frame rate and whether to send the
 * shared window/screen audio along with the video.
 */
export function ScreenSharePopover({ children }: { children: ReactElement }) {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant()
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)

  const update = (patch: Partial<StreamSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // preference only
      }
      return next
    })

  const stop = async () => {
    setOpen(false)
    await localParticipant.setScreenShareEnabled(false)
    await stopNativeAudio()
    playSound("streamStop")
  }

  const start = async () => {
    setOpen(false)
    const resolution = RESOLUTIONS.find((r) => r.key === settings.resolution)!
    // on Windows desktop the audio comes from the native per-app capture
    const native = hasNativeStreamAudio && settings.audio
    try {
      await localParticipant.setScreenShareEnabled(
        true,
        captureOptions(settings, native),
        {
          screenShareEncoding: {
            maxBitrate: Math.round(
              resolution.bitrate * (settings.frameRate / 30)
            ),
            maxFramerate: settings.frameRate,
          },
          // the stream should be as sharp as possible for viewers
          screenShareSimulcastLayers: [],
          ...STREAM_AUDIO_PUBLISH,
        }
      )
      if (native) await publishNativeAudio(localParticipant, settings)
      playSound("streamStart")
      // Without restrictOwnAudio the capture also records the call itself, so
      // everyone would hear their own voice back through the stream.
      const supported =
        navigator.mediaDevices.getSupportedConstraints() as Record<
          string,
          boolean
        >
      if (settings.audio && !native && !supported.restrictOwnAudio) {
        toast.warning("O áudio da sua transmissão pode incluir a chamada.", {
          description:
            "Seu navegador não consegue excluir o som do Biscord da captura. Use o app desktop do Biscord ou transmita uma aba/janela específica.",
          duration: 10000,
        })
      }
    } catch (error) {
      if ((error as Error).name !== "NotAllowedError") {
        toast.error("Não foi possível iniciar a transmissão.")
      }
    }
  }

  /** Discord's "Change stream": pick another screen/window and stay live. */
  const switchSource = async () => {
    setOpen(false)
    const native = hasNativeStreamAudio && settings.audio
    const options = captureOptions(settings, native)
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getDisplayMedia({
        video: options.resolution,
        audio: options.audio as boolean | MediaTrackConstraints,
        // Chromium-only hints, same as when going live
        ...({
          systemAudio: options.systemAudio,
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
        } as object),
      })
    } catch {
      return // picker cancelled
    }

    const video = localParticipant.getTrackPublication(Track.Source.ScreenShare)
      ?.track as LocalVideoTrack | undefined
    const nextVideo = media.getVideoTracks()[0]
    if (!video || !nextVideo) {
      media.getTracks().forEach((t) => t.stop())
      return
    }
    nextVideo.contentHint = options.contentHint ?? ""
    const previous = video.mediaStreamTrack
    await video.replaceTrack(nextVideo, false)
    previous.stop()

    // native capture: follow the newly picked window (or the whole screen)
    if (native) await publishNativeAudio(localParticipant, settings)
    // browser capture: the audio follows the newly picked surface
    if (!native) {
      const nextAudio = media.getAudioTracks()[0]
      const audio = localParticipant.getTrackPublication(
        Track.Source.ScreenShareAudio
      )?.track as LocalAudioTrack | undefined
      if (audio && nextAudio) {
        const old = audio.mediaStreamTrack
        await audio.replaceTrack(nextAudio, false)
        old.stop()
      } else if (audio) {
        await localParticipant.unpublishTrack(audio)
      } else if (nextAudio) {
        await localParticipant.publishTrack(nextAudio, {
          source: Track.Source.ScreenShareAudio,
          ...STREAM_AUDIO_PUBLISH,
        })
      }
    }
    playSound("streamStart")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-80 gap-4 rounded-lg border border-border p-4"
      >
        <div className="flex items-center gap-2 font-semibold text-header">
          <MonitorArrowUpIcon className="size-5" />
          {isScreenShareEnabled ? "Você está ao vivo" : "Transmitir tela"}
        </div>

        {isScreenShareEnabled ? (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={switchSource}>
              Mudar transmissão
            </Button>
            <Button variant="destructive" onClick={stop}>
              Parar transmissão
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase">
                Resolução
              </span>
              <Choice
                options={RESOLUTIONS.map((r) => r.key)}
                value={settings.resolution}
                onChange={(resolution) => update({ resolution })}
                format={(key) => RESOLUTIONS.find((r) => r.key === key)!.label}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase">
                Taxa de quadros
              </span>
              <Choice
                options={FRAME_RATES}
                value={settings.frameRate}
                onChange={(frameRate) => update({ frameRate })}
                format={(fps) => `${fps} FPS`}
              />
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span className="flex flex-col gap-1">
                <span className="font-medium text-header">
                  Transmitir áudio
                </span>
                <span className="text-xs text-muted-foreground">
                  Envia o som da tela ou janela compartilhada.
                </span>
              </span>
              <Switch
                checked={settings.audio}
                onCheckedChange={(audio) => update({ audio })}
              />
            </label>
            {hasNativeStreamAudio && settings.audio && (
              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="flex flex-col gap-1">
                  <span className="font-medium text-header">
                    Ignorar áudio do Discord
                  </span>
                  <span className="text-xs text-muted-foreground">
                    O som do Discord fica fora da transmissão. O som do Biscord
                    nunca é transmitido.
                  </span>
                </span>
                <Switch
                  checked={settings.skipDiscord}
                  onCheckedChange={(skipDiscord) => update({ skipDiscord })}
                />
              </label>
            )}
            <Button onClick={start}>Ao vivo</Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
