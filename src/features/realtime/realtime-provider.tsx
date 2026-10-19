import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { useUserId } from "@/features/auth/auth-provider"
import {
  findMessageInCache,
  removeMessageFromCache,
  updateMessageInCache,
  upsertMessageInCache,
} from "@/features/messages/queries"
import { profileQuery } from "@/features/profiles/queries"
import { notifyMessage } from "@/features/realtime/notifications"
import { activeChannelStore, presenceStore } from "@/features/realtime/presence"
import { queryKeys } from "@/lib/query-keys"
import { supabase } from "@/lib/supabase"
import type {
  DmChannel,
  Message,
  PresenceStatus,
  Profile,
  Reaction,
  UnreadState,
} from "@/lib/types"

type Row = Record<string, unknown>
type Payload = RealtimePostgresChangesPayload<Row>

const IDLE_AFTER_MS = 5 * 60 * 1000

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const userId = useUserId()
  const qc = useQueryClient()
  const me = useQuery(profileQuery(userId)).data
  const presenceRef = useRef<RealtimeChannel | null>(null)
  const statusRef = useRef(me?.status)
  useEffect(() => {
    statusRef.current = me?.status
  }, [me?.status])

  // -------------------------------------------------------------------------
  // Database changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onMessage = async (payload: Payload) => {
      if (payload.eventType === "DELETE") {
        removeMessageFromCache(qc, payload.old.id as string)
        return
      }

      const row = payload.new as unknown as Message
      const existing = findMessageInCache(qc, row.id)
      let reply = existing?.reply ?? null
      if (!reply && row.reply_to_id) {
        const cached = findMessageInCache(qc, row.reply_to_id)
        reply = cached
          ? {
              id: cached.id,
              author_id: cached.author_id,
              content: cached.content,
              attachments: cached.attachments,
            }
          : null
      }

      upsertMessageInCache(qc, {
        ...row,
        // the INSERT arrives before the unfurl; keep embeds we already show
        embeds:
          row.embeds.length === 0 && existing?.content === row.content
            ? existing.embeds
            : row.embeds,
        reactions: existing?.reactions ?? [],
        reply,
      })

      if (payload.eventType === "UPDATE") {
        qc.invalidateQueries({ queryKey: queryKeys.pins(row.channel_id) })
        return
      }

      // INSERT from someone else: unread bookkeeping + notifications
      if (row.author_id === userId) return

      const dm = qc
        .getQueryData<DmChannel[]>(queryKeys.dms)
        ?.find((c) => c.id === row.channel_id)
      const mentioned =
        !!dm || row.mentions.includes(userId) || row.mention_everyone
      const active =
        activeChannelStore.get() === row.channel_id && document.hasFocus()

      if (!active) {
        const states = qc.getQueryData<UnreadState[]>(queryKeys.unread)
        if (states?.some((s) => s.channel_id === row.channel_id)) {
          qc.setQueryData<UnreadState[]>(queryKeys.unread, (prev) =>
            prev?.map((s) =>
              s.channel_id === row.channel_id
                ? {
                    ...s,
                    last_message_at: row.created_at,
                    mention_count: s.mention_count + (mentioned ? 1 : 0),
                  }
                : s
            )
          )
        } else {
          qc.invalidateQueries({ queryKey: queryKeys.unread })
        }
        if (mentioned) {
          notifyMessage(qc, row, !!dm, statusRef.current)
        }
      }

      // keeps the DM list sorted by latest activity
      if (dm) {
        qc.invalidateQueries({ queryKey: queryKeys.dms })
      }
    }

    const onReaction = (payload: Payload) => {
      if (payload.eventType === "INSERT") {
        const r = payload.new as unknown as Reaction
        updateMessageInCache(qc, r.message_id, (m) =>
          m.reactions.some(
            (x) => x.user_id === r.user_id && x.emoji === r.emoji
          )
            ? m
            : { ...m, reactions: [...m.reactions, r] }
        )
      }
      if (payload.eventType === "DELETE") {
        const r = payload.old as unknown as Reaction
        updateMessageInCache(qc, r.message_id, (m) => ({
          ...m,
          reactions: m.reactions.filter(
            (x) => !(x.user_id === r.user_id && x.emoji === r.emoji)
          ),
        }))
      }
    }

    const serverScoped =
      (key: "channels" | "members" | "roles" | "member-roles") =>
      (payload: Payload) => {
        const row = (
          payload.eventType === "DELETE" ? payload.old : payload.new
        ) as Row
        const serverId = row.server_id as string | undefined
        qc.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "server" &&
            query.queryKey[2] === key &&
            (!serverId || query.queryKey[1] === serverId),
        })
      }

    const channel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        onMessage
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reactions" },
        onReaction
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channels" },
        (payload) => {
          serverScoped("channels")(payload)
          qc.invalidateQueries({ queryKey: queryKeys.dms })
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "servers" },
        () => qc.invalidateQueries({ queryKey: queryKeys.servers })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_members" },
        (payload) => {
          serverScoped("members")(payload)
          const row = (
            payload.eventType === "DELETE" ? payload.old : payload.new
          ) as Row
          if (row.user_id === userId) {
            qc.invalidateQueries({ queryKey: queryKeys.servers })
            qc.invalidateQueries({ queryKey: queryKeys.unread })
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roles" },
        serverScoped("roles")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_roles" },
        serverScoped("member-roles")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_recipients" },
        () => qc.invalidateQueries({ queryKey: queryKeys.dms })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => qc.invalidateQueries({ queryKey: queryKeys.friendships })
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const profile = payload.new as unknown as Profile
          qc.setQueryData(queryKeys.profile(profile.id), profile)
          qc.invalidateQueries({
            predicate: (query) =>
              (query.queryKey[0] === "server" &&
                query.queryKey[2] === "members") ||
              query.queryKey[0] === "dms" ||
              query.queryKey[0] === "friendships",
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, userId])

  // -------------------------------------------------------------------------
  // Presence (online / idle / dnd). Invisible users simply don't track.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase.channel("presence:global", {
      config: { presence: { key: userId } },
    })

    const sync = () => {
      const state = channel.presenceState<{ status: PresenceStatus }>()
      const next: Record<string, PresenceStatus> = {}
      for (const [key, metas] of Object.entries(state)) {
        const statuses = metas.map((m) => m.status)
        // a user with several tabs is as "present" as their most active tab
        next[key] = statuses.includes("online")
          ? "online"
          : statuses.includes("dnd")
            ? "dnd"
            : "idle"
      }
      presenceStore.set(next)
    }

    channel.on("presence", { event: "sync" }, sync).subscribe()
    presenceRef.current = channel

    return () => {
      presenceRef.current = null
      presenceStore.set({})
      void supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    const channel = presenceRef.current
    if (!channel || !me) return

    let idle = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const publish = () => {
      if (me.status === "invisible") {
        void channel.untrack()
        return
      }
      const status: PresenceStatus =
        me.status === "online" && idle ? "idle" : me.status
      void channel.track({ status })
    }

    const onBlur = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        idle = true
        publish()
      }, IDLE_AFTER_MS)
    }
    const onFocus = () => {
      clearTimeout(timer)
      if (idle) {
        idle = false
        publish()
      }
    }

    // presence may not be joined yet; track once it is
    const attempt = setInterval(() => {
      if (channel.state === "joined") {
        clearInterval(attempt)
        publish()
      }
    }, 250)

    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(attempt)
      clearTimeout(timer)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
    }
  }, [me])

  return <>{children}</>
}
