import { useEffect, useState } from "react"

import { Slider } from "@/components/ui/slider"
import {
  audioSettingsStore,
  effectiveThreshold,
} from "@/features/voice/audio-settings"
import { audioDevice } from "@/features/voice/devices"
import {
  createDenoiser,
  micLevelStore,
  rmsToDb,
} from "@/features/voice/mic-processor"
import { useVoice } from "@/features/voice/voice-store"
import { cn } from "@/lib/utils"

/** 0–200% volume slider, Discord-style. */
export function VolumeSlider({
  value,
  onChange,
  max = 2,
  label,
}: {
  value: number
  onChange: (value: number) => void
  max?: number
  label?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label={label}
        min={0}
        max={max * 100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={(next) =>
          onChange((Array.isArray(next) ? next[0] : next) / 100)
        }
      />
      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

const BARS = 40

/** Discord's segmented input meter; bars past the gate threshold light up. */
export function LevelMeter({
  level,
  threshold,
  className,
}: {
  level: number
  threshold?: number
  className?: string
}) {
  // map -100…0 dBFS onto the bars
  const lit = Math.round(((level + 100) / 100) * BARS)
  const gate =
    threshold === undefined ? -1 : Math.round(((threshold + 100) / 100) * BARS)
  return (
    <div className={cn("flex h-6 items-center gap-0.5", className)} aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-full flex-1 rounded-sm bg-border",
            i < lit && (i >= gate ? "bg-success" : "bg-warning")
          )}
        />
      ))}
    </div>
  )
}

/**
 * Mic level for meters: the published track's level while in a call,
 * otherwise a short-lived local capture (optionally played back, like
 * Discord's "Teste do microfone").
 */
export function useMicLevel(active: boolean, loopback = false) {
  const { connection } = useVoice()
  const inCall = !!connection
  const callLevel = micLevelStore.useStore((level) => level)
  const [testLevel, setTestLevel] = useState(-100)

  useEffect(() => {
    if (!active || (inCall && !loopback)) return
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    const settings = audioSettingsStore.get()
    void navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: audioDevice("audioinput"),
          noiseSuppression: settings.noiseSuppression,
          echoCancellation: settings.echoCancellation,
          autoGainControl: settings.autoGainControl,
        },
      })
      .then(async (media) => {
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        // 48 kHz so the mic test can run voice isolation, like the real call
        context = new AudioContext({ sampleRate: 48000 })
        const source = context.createMediaStreamSource(media)
        const gain = context.createGain()
        const analyser = context.createAnalyser()
        analyser.fftSize = 1024
        const denoise = settings.advancedNoiseSuppression
          ? await createDenoiser(context)
          : undefined
        if (cancelled) return
        if (denoise) source.connect(denoise).connect(gain)
        else source.connect(gain)
        gain.connect(analyser)
        if (loopback) gain.connect(context.destination)
        const buffer = new Float32Array(analyser.fftSize)
        timer = setInterval(() => {
          gain.gain.value = audioSettingsStore.get().inputVolume
          analyser.getFloatTimeDomainData(buffer)
          setTestLevel(rmsToDb(buffer))
        }, 50)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      void context?.close()
      setTestLevel(-100)
    }
  }, [active, inCall, loopback])

  return inCall && !loopback ? callLevel : testLevel
}

export function currentThreshold() {
  return effectiveThreshold(audioSettingsStore.get())
}
