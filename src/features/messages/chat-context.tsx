import { createContext, use } from "react"

import type { Channel, Message, Profile } from "@/lib/types"

export type Mentionable = { profile: Profile; nickname: string | null }

export type ChatContextValue = {
  channel: Channel
  serverId: string | null
  replyTo: Message | null
  setReplyTo: (message: Message | null) => void
  editingId: string | null
  setEditingId: (id: string | null) => void
  canSend: boolean
  canReact: boolean
  canAttach: boolean
  canManageMessages: boolean
  canMentionEveryone: boolean
  focusComposer: () => void
  /** people that can be @mentioned here (members or DM recipients) */
  people: Mentionable[]
  /** channels that can be #mentioned */
  mentionChannels: Channel[]
}

export const ChatContext = createContext<ChatContextValue | undefined>(
  undefined
)

export function useChat() {
  const context = use(ChatContext)
  if (!context) {
    throw new Error("useChat must be used within a ChatPane")
  }
  return context
}
