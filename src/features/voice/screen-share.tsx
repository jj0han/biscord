import { useLocalParticipant } from "@livekit/components-react"
import { MonitorArrowUpIcon } from "@phosphor-icons/react"
import { type AudioCaptureOptions, AudioPresets } from "livekit-client"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
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
    playSound("streamStop")
  }

  const start = async () => {
    setOpen(false)
    const resolution = RESOLUTIONS.find((r) => r.key === settings.resolution)!
    try {
      await localParticipant.setScreenShareEnabled(
        true,
        {
          audio: settings.audio
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
          systemAudio: settings.audio ? "include" : "exclude",
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
          contentHint: settings.frameRate >= 30 ? "motion" : "detail",
          resolution: {
            width: resolution.width,
            height: resolution.height,
            frameRate: settings.frameRate,
          },
        },
        {
          screenShareEncoding: {
            maxBitrate: Math.round(
              resolution.bitrate * (settings.frameRate / 30)
            ),
            maxFramerate: settings.frameRate,
          },
          // the stream should be as sharp as possible for viewers
          screenShareSimulcastLayers: [],
          // stereo Opus at 128 kbps without DTX/RED: music and games keep
          // their full range instead of sounding like a phone call
          audioPreset: AudioPresets.musicHighQualityStereo,
          forceStereo: true,
          dtx: false,
          red: false,
        }
      )
      playSound("streamStart")
      // Without restrictOwnAudio the capture also records the call itself, so
      // everyone would hear their own voice back through the stream.
      const supported =
        navigator.mediaDevices.getSupportedConstraints() as Record<
          string,
          boolean
        >
      if (settings.audio && !supported.restrictOwnAudio) {
        toast.warning("O áudio da sua transmissão pode incluir a chamada.", {
          description:
            "Seu navegador/WebView não consegue excluir o som do Biscord da captura. Atualize o Biscord (ou o navegador) ou transmita uma janela específica.",
          duration: 10000,
        })
      }
    } catch (error) {
      if ((error as Error).name !== "NotAllowedError") {
        toast.error("Não foi possível iniciar a transmissão.")
      }
    }
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
          <Button variant="destructive" onClick={stop}>
            Parar transmissão
          </Button>
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
            <Button onClick={start}>Ao vivo</Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
