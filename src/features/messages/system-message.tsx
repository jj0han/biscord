import { ArrowRightIcon, TrashIcon } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { TooltipContent } from "@/components/tooltip-content"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useUserId } from "@/features/auth/auth-provider"
import { useChat } from "@/features/messages/chat-context"
import { deleteMessage, sendMessage } from "@/features/messages/queries"
import { ProfilePopover } from "@/features/profiles/profile-popover"
import { useProfile } from "@/features/profiles/queries"
import { useMember, useMemberColor } from "@/features/servers/queries"
import {
  displayName,
  formatFullDate,
  formatMessageTimestamp,
} from "@/lib/format"
import { roleColor } from "@/lib/permissions"
import type { Message } from "@/lib/types"

// "{}" is where the name goes; picked by the message's timestamp so every
// client shows the same phrase, like Discord does
const JOIN_PHRASES = [
  "{} acabou de chegar.",
  "Boas-vindas, {}. Fique à vontade!",
  "{} entrou no servidor.",
  "Que bom ver você por aqui, {}.",
  "Todo mundo dá oi para {}!",
  "{} apareceu do nada.",
  "Abram alas: {} chegou.",
  "{} pousou no servidor.",
  "{} acabou de entrar. Puxa uma cadeira!",
  "Olha só quem chegou: {}.",
  "{} entrou na festa.",
  "Opa, {} está entre nós.",
]

function joinPhrase(message: Message) {
  const index = new Date(message.created_at).getTime() % JOIN_PHRASES.length
  return JOIN_PHRASES[index].split("{}") as [string, string]
}

function JoinerName({ message }: { message: Message }) {
  const { serverId } = useChat()
  const profile = useProfile(message.imported_author ? null : message.author_id)
  const member = useMember(serverId, message.author_id)
  const color = useMemberColor(serverId, message.author_id)

  if (message.imported_author) {
    return (
      <span className="font-medium text-header">
        {message.imported_author.name}
      </span>
    )
  }
  return (
    <ProfilePopover userId={message.author_id} serverId={serverId}>
      <button
        type="button"
        className="font-medium text-header hover:underline"
        style={{ color: roleColor(color) }}
      >
        {displayName(profile, member?.nickname)}
      </button>
    </ProfilePopover>
  )
}

/** "X entrou no servidor", with a button to wave at them. */
export function SystemMessage({ message }: { message: Message }) {
  const userId = useUserId()
  const qc = useQueryClient()
  const chat = useChat()
  const joiner = useProfile(message.imported_author ? null : message.author_id)
  const [before, after] = joinPhrase(message)
  const guest = !message.imported_author && joiner && !joiner.discord_id
  const isMe = message.author_id === userId && !message.imported_author

  const wave = () =>
    sendMessage(qc, {
      id: crypto.randomUUID(),
      channelId: message.channel_id,
      authorId: userId,
      content: "👋",
      replyTo: message,
      attachments: [],
    }).catch(() => toast.error("Não foi possível enviar."))

  const remove = () =>
    deleteMessage(qc, message.id).catch(() =>
      toast.error("Não foi possível excluir a mensagem.")
    )

  return (
    <div
      className="group/message relative mt-(--message-group-spacing) flex flex-col gap-1 py-0.5 pr-12 pl-18 text-(length:--chat-font-size) hover:bg-message-hover max-md:pr-3"
      data-message-id={message.id}
    >
      <ArrowRightIcon
        weight="bold"
        className="absolute top-1.5 left-9 size-4 text-success"
      />
      <div className="flex flex-wrap items-baseline gap-x-2 leading-[1.375] text-muted-foreground">
        <span>
          {before}
          <JoinerName message={message} />
          {after}
        </span>
        {guest && (
          <span className="rounded-sm bg-card px-1 text-[10px] font-semibold text-muted-foreground uppercase">
            Convidado
          </span>
        )}
        <Tooltip>
          <TooltipTrigger
            render={<time className="text-xs text-muted-foreground" />}
          >
            {formatMessageTimestamp(message.created_at)}
          </TooltipTrigger>
          <TooltipContent className="bg-popover text-sm text-header">
            {formatFullDate(message.created_at)}
          </TooltipContent>
        </Tooltip>
      </div>
      {chat.canSend && !isMe && !message.discord_id && (
        <button
          type="button"
          onClick={() => void wave()}
          className="flex w-fit items-center gap-2 rounded-md bg-card px-3 py-1.5 text-sm font-medium text-header transition-colors hover:bg-hover"
        >
          <span className="text-lg leading-none">👋</span>
          Dar oi
        </button>
      )}
      {chat.canManageMessages && (
        <button
          type="button"
          aria-label="Excluir mensagem"
          onClick={() => void remove()}
          className="absolute top-1 right-4 hidden size-8 items-center justify-center rounded-lg border border-sidebar-border bg-background text-danger group-hover/message:flex"
        >
          <TrashIcon className="size-5" />
        </button>
      )}
    </div>
  )
}
