import {
  useLocalParticipant,
  useRemoteParticipants,
} from "@livekit/components-react"
import { Track } from "livekit-client"
import { useEffect } from "react"

import {
  audioSettingsStore,
  effectiveThreshold,
} from "@/features/voice/audio-settings"
import { micLevelStore, rmsToDb } from "@/features/voice/mic-processor"
import { createStore } from "@/lib/store"

/** identity -> talking right now (measured locally, no server round trip). */
export const speakingStore = createStore<Record<string, boolean>>({})

const POLL_MS = 40
/** keep the ring on briefly so it doesn't flicker between words */
const HOLD_MS = 250
/** remote voices are already gated by their sender; anything audible counts */
const REMOTE_THRESHOLD = -55

function setSpeaking(identity: string, value: boolean) {
  speakingStore.set((prev) =>
    !!prev[identity] === value ? prev : { ...prev, [identity]: value }
  )
}

export function useSpeaking(identity: string) {
  return speakingStore.useStore((s) => !!s[identity])
}

let context: AudioContext | undefined

/**
 * Measures every voice in the call with Web Audio and feeds speakingStore.
 * LiveKit's own active-speaker events come from the server and lag ~0.5s;
 * this reacts within a few tens of milliseconds, like Discord.
 */
export function useSpeakingMonitor(connected: boolean) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant()
  const participants = useRemoteParticipants()

  // our own mic: the mic processor already measures the level
  const me = localParticipant.identity
  useEffect(() => {
    if (!connected || !isMicrophoneEnabled) {
      setSpeaking(me, false)
      return
    }
    let until = 0
    const timer = setInterval(() => {
      const threshold = Math.max(
        effectiveThreshold(audioSettingsStore.get()),
        -60
      )
      const now = performance.now()
      if (micLevelStore.get() >= threshold) until = now + HOLD_MS
      setSpeaking(me, now < until)
    }, POLL_MS)
    return () => {
      clearInterval(timer)
      setSpeaking(me, false)
    }
  }, [connected, isMicrophoneEnabled, me])

  // everyone else: one analyser per subscribed mic track
  const tracks = participants.flatMap((participant) => {
    const publication = participant.getTrackPublication(Track.Source.Microphone)
    const track = publication?.track?.mediaStreamTrack
    return track && !publication.isMuted
      ? [{ identity: participant.identity, track }]
      : []
  })
  const key = tracks.map((t) => `${t.identity}:${t.track.id}`).join(",")

  useEffect(() => {
    if (!connected || tracks.length === 0) return
    context ??= new AudioContext()
    const ctx = context
    void ctx.resume().catch(() => undefined)

    const meters = tracks.map(({ identity, track }) => {
      const source = ctx.createMediaStreamSource(new MediaStream([track]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      return { identity, source, analyser, until: 0 }
    })
    const buffer = new Float32Array(512)
    const timer = setInterval(() => {
      const now = performance.now()
      for (const meter of meters) {
        meter.analyser.getFloatTimeDomainData(buffer)
        if (rmsToDb(buffer) >= REMOTE_THRESHOLD) meter.until = now + HOLD_MS
        setSpeaking(meter.identity, now < meter.until)
      }
    }, POLL_MS)

    return () => {
      clearInterval(timer)
      for (const meter of meters) {
        meter.source.disconnect()
        setSpeaking(meter.identity, false)
      }
    }
    // the key captures which tracks are live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, key])
}
