import type { RealtimeChannel } from "@supabase/supabase-js"
import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "@/lib/supabase"

const TYPING_TTL_MS = 9000
const SEND_EVERY_MS = 6000

/** Broadcast-only typing indicator for one channel (no database writes). */
export function useTyping(channelId: string, userId: string) {
  const [typing, setTyping] = useState<Record<string, number>>({})
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    const channel = supabase.channel(`typing:${channelId}`, {
      config: { broadcast: { self: false } },
    })
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const id = payload.userId as string
        setTyping((prev) => ({ ...prev, [id]: Date.now() + TYPING_TTL_MS }))
      })
      .on("broadcast", { event: "stop" }, ({ payload }) => {
        const id = payload.userId as string
        setTyping((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      })
      .subscribe()
    channelRef.current = channel

    const sweep = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now()
        const entries = Object.entries(prev).filter(([, until]) => until > now)
        return entries.length === Object.keys(prev).length
          ? prev
          : Object.fromEntries(entries)
      })
    }, 1000)

    return () => {
      clearInterval(sweep)
      channelRef.current = null
      setTyping({})
      void supabase.removeChannel(channel)
    }
  }, [channelId])

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastSent.current < SEND_EVERY_MS) return
    lastSent.current = now
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId },
    })
  }, [userId])

  const stopTyping = useCallback(() => {
    if (!lastSent.current) return
    lastSent.current = 0
    void channelRef.current?.send({
      type: "broadcast",
      event: "stop",
      payload: { userId },
    })
  }, [userId])

  return { typingUserIds: Object.keys(typing), notifyTyping, stopTyping }
}
