import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { unreadQuery } from "@/features/messages/queries"
import type { UnreadState } from "@/lib/types"

function isUnread(state: UnreadState) {
  return (
    !state.last_read_at ||
    new Date(state.last_message_at) > new Date(state.last_read_at)
  )
}

export function useUnreadStates() {
  return useQuery(unreadQuery).data
}

export function useChannelUnread(channelId: string) {
  const states = useUnreadStates()
  return useMemo(() => {
    const state = states?.find((s) => s.channel_id === channelId)
    return {
      unread: state ? isUnread(state) : false,
      mentions: state && isUnread(state) ? state.mention_count : 0,
    }
  }, [states, channelId])
}

export function useServerUnread(serverId: string) {
  const states = useUnreadStates()
  return useMemo(() => {
    const mine = (states ?? []).filter(
      (s) => s.server_id === serverId && isUnread(s)
    )
    return {
      unread: mine.length > 0,
      mentions: mine.reduce((acc, s) => acc + s.mention_count, 0),
    }
  }, [states, serverId])
}

/** DM channels with unread messages, newest first — shown in the server rail. */
export function useUnreadDms() {
  const states = useUnreadStates()
  return useMemo(
    () =>
      (states ?? [])
        .filter(
          (s) => s.server_id === null && isUnread(s) && s.mention_count > 0
        )
        .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
    [states]
  )
}
