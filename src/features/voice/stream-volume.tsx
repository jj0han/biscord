import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { Slider } from "@/components/ui/slider"
import {
  setStreamVolume,
  useAudioSettings,
} from "@/features/voice/audio-settings"
import { cn } from "@/lib/utils"

/**
 * Volume of someone's stream, separate from their voice (0–200%), shown over
 * the stream on hover like Discord's player controls.
 */
export function StreamVolumeControl({
  userId,
  className,
}: {
  userId: string
  className?: string
}) {
  const volume = useAudioSettings().streamVolumes[userId] ?? 1
  const [restore, setRestore] = useState(1)
  const muted = volume === 0

  const toggle = () => {
    if (muted) {
      setStreamVolume(userId, restore || 1)
    } else {
      setRestore(volume)
      setStreamVolume(userId, 0)
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-white",
        className
      )}
    >
      <button
        type="button"
        aria-label={
          muted ? "Ativar som da transmissão" : "Silenciar transmissão"
        }
        onClick={toggle}
        className="flex items-center"
      >
        {muted ? (
          <SpeakerSlashIcon className="size-4" />
        ) : (
          <SpeakerHighIcon className="size-4" />
        )}
      </button>
      <Slider
        aria-label="Volume da transmissão"
        className="w-24"
        min={0}
        max={200}
        step={1}
        value={[Math.round(volume * 100)]}
        onValueChange={(next) =>
          setStreamVolume(userId, (Array.isArray(next) ? next[0] : next) / 100)
        }
      />
    </div>
  )
}
