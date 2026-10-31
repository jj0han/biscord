import { useRoomContext } from "@livekit/components-react"
import { useEffect } from "react"

import { reportVoiceUsage } from "@/features/admin/queries"
import { useUserId } from "@/features/auth/auth-provider"

const EVERY_MS = 60 * 1000

/**
 * Logs this client's call time and the bytes it received from the voice
 * server once a minute. LiveKit bills participant minutes and downstream
 * data, and its usage API needs a paid plan, so the admin page sums these.
 */
export function useUsageReporter(connected: boolean) {
  const room = useRoomContext()
  const userId = useUserId()

  useEffect(() => {
    if (!connected) return
    // last bytesReceived per inbound stream, to report only the difference
    const seen = new Map<string, number>()
    let since = performance.now()

    const received = async () => {
      let delta = 0
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          const report = await publication.track
            ?.getRTCStatsReport()
            .catch(() => undefined)
          report?.forEach((stat) => {
            if (stat.type !== "inbound-rtp") return
            const total =
              (stat.bytesReceived ?? 0) + (stat.headerBytesReceived ?? 0)
            delta += Math.max(0, total - (seen.get(stat.id) ?? 0))
            seen.set(stat.id, total)
          })
        }
      }
      return delta
    }

    const flush = async () => {
      const now = performance.now()
      const seconds = (now - since) / 1000
      since = now
      const bytes = await received()
      if (seconds >= 1) {
        await reportVoiceUsage(userId, seconds, bytes).catch(() => undefined)
      }
    }

    const timer = setInterval(() => void flush(), EVERY_MS)
    return () => {
      clearInterval(timer)
      void flush() // the last partial minute
    }
  }, [room, connected, userId])
}
