import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { useChat } from "@/features/messages/chat-context"
import {
  toEditableContent,
  toRawContent,
} from "@/features/messages/mention-text"
import { MessageInput } from "@/features/messages/message-input"
import { deleteMessage, editMessage } from "@/features/messages/queries"
import { queryKeys } from "@/lib/query-keys"
import type { Message } from "@/lib/types"

/** Inline editor that replaces a message's content while editing. */
export function EditBox({ message }: { message: Message }) {
  const qc = useQueryClient()
  const chat = useChat()
  const [value, setValue] = useState(() =>
    toEditableContent(message.content, chat.people, chat.mentionChannels)
  )

  const close = () => {
    chat.setEditingId(null)
    chat.focusComposer()
  }

  const save = async () => {
    const content = toRawContent(
      value.trim(),
      chat.people,
      chat.mentionChannels
    )
    close()
    if (content === message.content) return
    try {
      if (!content && message.attachments.length === 0) {
        await deleteMessage(qc, message.id)
      } else {
        await editMessage(qc, message.id, content)
      }
    } catch {
      toast.error("Não foi possível editar a mensagem.")
      await qc.invalidateQueries({
        queryKey: queryKeys.channelMessages(message.channel_id),
      })
    }
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <MessageInput
        value={value}
        onChange={setValue}
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            close()
          }
        }}
        autoFocus
      />
      <span className="text-xs text-foreground">
        esc para{" "}
        <button
          type="button"
          onClick={close}
          className="text-link hover:underline"
        >
          cancelar
        </button>{" "}
        • enter para{" "}
        <button
          type="button"
          onClick={save}
          className="text-link hover:underline"
        >
          salvar
        </button>
      </span>
    </div>
  )
}
