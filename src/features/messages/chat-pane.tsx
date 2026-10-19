import { UploadSimpleIcon } from "@phosphor-icons/react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

import { useUserId } from "@/features/auth/auth-provider"
import {
  ChatContext,
  type ChatContextValue,
  type Mentionable,
} from "@/features/messages/chat-context"
import { Composer, type ComposerHandle } from "@/features/messages/composer"
import { MentionsProvider } from "@/features/messages/mentions"
import { MessageList } from "@/features/messages/message-list"
import {
  markRead,
  messagesQuery,
  unreadQuery,
} from "@/features/messages/queries"
import { useTyping } from "@/features/messages/typing"
import { TypingIndicator } from "@/features/messages/typing-indicator"
import { activeChannelStore } from "@/features/realtime/presence"
import type { Channel, Message, UnreadState } from "@/lib/types"

type ChatPaneProps = {
  channel: Channel
  serverId: string | null
  header: ReactNode
  sidePanel?: ReactNode
  placeholder: string
  welcome: ReactNode
  people: Mentionable[]
  mentionChannels: Channel[]
  permissions: {
    canSend: boolean
    canReact: boolean
    canAttach: boolean
    canManageMessages: boolean
    canMentionEveryone: boolean
  }
}

/** Keeps the channel marked as read while it's on screen and focused. */
function useReadTracking(channelId: string) {
  const qc = useQueryClient()
  const { data } = useInfiniteQuery(messagesQuery(channelId))
  const newest = data?.pages[0]?.[0]?.id

  const [unreadSince] = useState(() => {
    const state = qc
      .getQueryData<UnreadState[]>(unreadQuery.queryKey)
      ?.find((s) => s.channel_id === channelId)
    if (!state || !state.last_read_at) return null
    return state.last_message_at > state.last_read_at
      ? state.last_read_at
      : null
  })

  useEffect(() => {
    activeChannelStore.set(channelId)
    return () => {
      if (activeChannelStore.get() === channelId) activeChannelStore.set(null)
    }
  }, [channelId])

  useEffect(() => {
    const read = () => {
      if (!document.hasFocus()) return
      const now = new Date().toISOString()
      qc.setQueryData<UnreadState[]>(unreadQuery.queryKey, (states) =>
        states?.map((s) =>
          s.channel_id === channelId
            ? { ...s, last_read_at: now, mention_count: 0 }
            : s
        )
      )
      void markRead(channelId)
    }
    const timer = setTimeout(read, 300)
    window.addEventListener("focus", read)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("focus", read)
    }
  }, [channelId, newest, qc])

  return unreadSince
}

export function ChatPane({
  channel,
  serverId,
  header,
  sidePanel,
  placeholder,
  welcome,
  people,
  mentionChannels,
  permissions,
}: ChatPaneProps) {
  const userId = useUserId()
  const composerRef = useRef<ComposerHandle>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const unreadSince = useReadTracking(channel.id)
  const { typingUserIds, notifyTyping, stopTyping } = useTyping(
    channel.id,
    userId
  )

  const value = useMemo<ChatContextValue>(
    () => ({
      channel,
      serverId,
      replyTo,
      setReplyTo,
      editingId,
      setEditingId,
      ...permissions,
      focusComposer: () => composerRef.current?.focus(),
      people,
      mentionChannels,
    }),
    [
      channel,
      serverId,
      replyTo,
      editingId,
      permissions,
      people,
      mentionChannels,
    ]
  )

  return (
    <ChatContext value={value}>
      <MentionsProvider serverId={serverId}>
        <div className="flex min-w-0 flex-1 flex-col bg-background">
          {header}
          <div className="flex min-h-0 flex-1">
            <main
              className="relative flex min-w-0 flex-1 flex-col"
              onDragEnter={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return
                dragDepth.current += 1
                setDragging(true)
              }}
              onDragLeave={() => {
                dragDepth.current -= 1
                if (dragDepth.current <= 0) setDragging(false)
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                dragDepth.current = 0
                setDragging(false)
                composerRef.current?.addFiles([...e.dataTransfer.files])
              }}
            >
              <MessageList
                channelId={channel.id}
                welcome={welcome}
                unreadSince={unreadSince}
              />
              <Composer
                ref={composerRef}
                placeholder={placeholder}
                onTyping={notifyTyping}
                onStopTyping={stopTyping}
              />
              <TypingIndicator
                userIds={typingUserIds.filter((id) => id !== userId)}
                serverId={serverId}
              />
              {dragging && permissions.canAttach && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/60">
                  <div className="flex w-80 flex-col items-center gap-2 rounded-xl bg-primary p-6 text-center text-primary-foreground">
                    <UploadSimpleIcon className="size-10" />
                    <span className="text-xl font-bold">
                      Enviar para #{channel.name ?? "conversa"}
                    </span>
                    <span className="text-sm opacity-90">
                      Você pode adicionar comentários antes de enviar.
                    </span>
                  </div>
                </div>
              )}
            </main>
            {sidePanel}
          </div>
        </div>
      </MentionsProvider>
    </ChatContext>
  )
}
