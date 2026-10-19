import {
  type InfiniteData,
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import { supabase, unwrap } from "@/lib/supabase"
import type { Attachment, Embed, Message, UnreadState } from "@/lib/types"

export const PAGE_SIZE = 50

const MESSAGE_SELECT =
  "*, reactions(message_id, user_id, emoji), reply:messages!reply_to_id(id, author_id, content, attachments)"

export type MessagePages = InfiniteData<Message[], string | null>

/** Pages are newest-first; each page is ordered newest-first too. */
export function messagesQuery(channelId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.channelMessages(channelId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
      if (pageParam) {
        query = query.lt("created_at", pageParam)
      }
      return unwrap<Message[]>(await query)
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < PAGE_SIZE
        ? undefined
        : lastPage[lastPage.length - 1].created_at,
    staleTime: Infinity,
  })
}

export function pinsQuery(channelId: string) {
  return queryOptions({
    queryKey: queryKeys.pins(channelId),
    queryFn: async () =>
      unwrap<Message[]>(
        await supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("channel_id", channelId)
          .eq("pinned", true)
          .order("created_at", { ascending: false })
      ),
  })
}

export function searchQuery(channelIds: string[], term: string) {
  return queryOptions({
    queryKey: queryKeys.search(channelIds, term),
    queryFn: async () =>
      unwrap<Message[]>(
        await supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .in("channel_id", channelIds)
          .ilike("content", `%${term.replace(/[%_]/g, "\\$&")}%`)
          .order("created_at", { ascending: false })
          .limit(25)
      ),
    enabled: term.trim().length > 0 && channelIds.length > 0,
  })
}

export const unreadQuery = queryOptions({
  queryKey: queryKeys.unread,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("unread_states")
    if (error) throw error
    return data as UnreadState[]
  },
})

// ---------------------------------------------------------------------------
// Cache helpers shared by mutations and the realtime listener
// ---------------------------------------------------------------------------

export function upsertMessageInCache(qc: QueryClient, message: Message) {
  qc.setQueryData<MessagePages>(
    queryKeys.channelMessages(message.channel_id),
    (data) => {
      if (!data) return data
      let found = false
      const pages = data.pages.map((page) =>
        page.map((m) => {
          if (m.id !== message.id) return m
          found = true
          // realtime rows don't carry joins; keep what we already had
          return {
            ...m,
            ...message,
            reactions: message.reactions ?? m.reactions,
            reply: message.reply ?? m.reply,
            pending: false,
            failed: false,
          }
        })
      )
      if (!found) {
        pages[0] = [message, ...(pages[0] ?? [])]
      }
      return { ...data, pages }
    }
  )
}

export function updateMessageInCache(
  qc: QueryClient,
  messageId: string,
  update: (message: Message) => Message
) {
  qc.setQueriesData<MessagePages>({ queryKey: queryKeys.messages }, (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((page) =>
        page.map((m) => (m.id === messageId ? update(m) : m))
      ),
    }
  })
}

export function removeMessageFromCache(qc: QueryClient, messageId: string) {
  qc.setQueriesData<MessagePages>({ queryKey: queryKeys.messages }, (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((page) => page.filter((m) => m.id !== messageId)),
    }
  })
}

export function findMessageInCache(qc: QueryClient, messageId: string) {
  for (const [, data] of qc.getQueriesData<MessagePages>({
    queryKey: queryKeys.messages,
  })) {
    for (const page of data?.pages ?? []) {
      const hit = page.find((m) => m.id === messageId)
      if (hit) return hit
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function sendMessage(
  qc: QueryClient,
  input: {
    id: string
    channelId: string
    authorId: string
    content: string
    replyTo: Message | null
    attachments: Attachment[]
    /** shown right away, before the unfurl function fills the real ones */
    embeds?: Embed[]
  }
) {
  const optimistic: Message = {
    id: input.id,
    channel_id: input.channelId,
    author_id: input.authorId,
    content: input.content,
    reply_to_id: input.replyTo?.id ?? null,
    attachments: input.attachments,
    embeds: input.embeds ?? [],
    mentions: [],
    mention_everyone: false,
    pinned: false,
    edited_at: null,
    created_at: new Date().toISOString(),
    reactions: [],
    reply: input.replyTo
      ? {
          id: input.replyTo.id,
          author_id: input.replyTo.author_id,
          content: input.replyTo.content,
          attachments: input.replyTo.attachments,
        }
      : null,
    pending: true,
  }
  upsertMessageInCache(qc, optimistic)

  const { error } = await supabase.from("messages").insert({
    id: input.id,
    channel_id: input.channelId,
    author_id: input.authorId,
    content: input.content,
    reply_to_id: input.replyTo?.id ?? null,
    attachments: input.attachments,
  })

  if (error) {
    updateMessageInCache(qc, input.id, (m) => ({
      ...m,
      pending: false,
      failed: true,
    }))
    throw error
  }

  updateMessageInCache(qc, input.id, (m) => ({ ...m, pending: false }))

  if (/https?:\/\//.test(input.content)) {
    void supabase.functions.invoke("unfurl", { body: { messageId: input.id } })
  }
}

export async function editMessage(
  qc: QueryClient,
  messageId: string,
  content: string
) {
  updateMessageInCache(qc, messageId, (m) => ({
    ...m,
    content,
    edited_at: new Date().toISOString(),
    embeds: [],
  }))
  unwrap(
    await supabase.from("messages").update({ content }).eq("id", messageId)
  )
  if (/https?:\/\//.test(content)) {
    void supabase.functions.invoke("unfurl", { body: { messageId } })
  }
}

export async function deleteMessage(qc: QueryClient, messageId: string) {
  removeMessageFromCache(qc, messageId)
  unwrap(await supabase.from("messages").delete().eq("id", messageId))
}

export async function togglePin(messageId: string) {
  const { data, error } = await supabase.rpc("toggle_pin", {
    p_message: messageId,
  })
  if (error) throw error
  return data as boolean
}

export async function toggleReaction(
  qc: QueryClient,
  message: Message,
  userId: string,
  emoji: string
) {
  const mine = message.reactions.some(
    (r) => r.user_id === userId && r.emoji === emoji
  )

  updateMessageInCache(qc, message.id, (m) => ({
    ...m,
    reactions: mine
      ? m.reactions.filter((r) => !(r.user_id === userId && r.emoji === emoji))
      : [...m.reactions, { message_id: m.id, user_id: userId, emoji }],
  }))

  if (mine) {
    unwrap(
      await supabase
        .from("reactions")
        .delete()
        .eq("message_id", message.id)
        .eq("user_id", userId)
        .eq("emoji", emoji)
    )
  } else {
    const { error } = await supabase
      .from("reactions")
      .insert({ message_id: message.id, user_id: userId, emoji })
    // duplicate = realtime already added it
    if (error && error.code !== "23505") throw error
  }
}

export async function markRead(channelId: string) {
  await supabase.rpc("mark_read", { p_channel: channelId })
}
