import {
  ArrowBendUpLeftIcon,
  CopyIcon,
  DotsThreeIcon,
  PencilSimpleIcon,
  PushPinIcon,
  SmileyIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { memo, useMemo, useState } from "react"
import { toast } from "sonner"

import { TooltipContent } from "@/components/tooltip-content"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { Attachments } from "@/features/messages/attachments"
import { useChat } from "@/features/messages/chat-context"
import { EditBox } from "@/features/messages/edit-box"
import { Embeds } from "@/features/messages/embeds"
import { EmojiPickerPopover } from "@/features/messages/emoji-picker"
import {
  deleteMessage,
  togglePin,
  toggleReaction,
} from "@/features/messages/queries"
import { StyledName } from "@/features/profiles/discord-extras"
import { GuildTag, ProfilePopover } from "@/features/profiles/profile-popover"
import { useProfile } from "@/features/profiles/queries"
import { useMember, useMemberColor } from "@/features/servers/queries"
import { useAccessibility } from "@/features/settings/accessibility"
import {
  displayName,
  formatFullDate,
  formatMessageTimestamp,
  formatTime,
} from "@/lib/format"
import { Markdown } from "@/lib/markdown/markdown"
import { roleColor } from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"
import type { Message } from "@/lib/types"
import { cn } from "@/lib/utils"

function AuthorName({
  userId,
  serverId,
}: {
  userId: string
  serverId: string | null
}) {
  const profile = useProfile(userId)
  const member = useMember(serverId, userId)
  const color = useMemberColor(serverId, userId)
  return (
    <ProfilePopover userId={userId} serverId={serverId}>
      <button
        type="button"
        className="font-medium text-header hover:underline"
        style={{ color: roleColor(color) }}
      >
        {color ? (
          displayName(profile, member?.nickname)
        ) : (
          <StyledName
            profile={profile}
            name={displayName(profile, member?.nickname)}
          />
        )}
      </button>
    </ProfilePopover>
  )
}

function ReplyPreview({ message }: { message: Message }) {
  const { serverId } = useChat()
  const reply = message.reply
  const profile = useProfile(reply?.author_id)
  const member = useMember(serverId, reply?.author_id ?? "")
  const color = useMemberColor(serverId, reply?.author_id ?? "")

  return (
    <div className="relative flex items-center gap-1 pb-0.5 pl-14 text-sm">
      <span className="absolute top-1/2 left-9 h-2.5 w-8 rounded-tl-md border-t-2 border-l-2 border-channel-icon" />
      {reply ? (
        <>
          <UserAvatar profile={profile ?? null} size="xs" />
          <span
            className="shrink-0 font-medium opacity-80"
            style={{ color: roleColor(color) }}
          >
            @{displayName(profile, member?.nickname)}
          </span>
          <span className="truncate text-muted-foreground">
            {reply.content ||
              (reply.attachments.length ? "Clique para ver o anexo" : "")}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground italic">
          A mensagem original foi excluída
        </span>
      )}
    </div>
  )
}

function Reactions({ message }: { message: Message }) {
  const userId = useUserId()
  const qc = useQueryClient()
  const { canReact } = useChat()

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>()
    for (const r of message.reactions) {
      const entry = map.get(r.emoji) ?? { count: 0, mine: false }
      entry.count += 1
      entry.mine ||= r.user_id === userId
      map.set(r.emoji, entry)
    }
    return [...map.entries()]
  }, [message.reactions, userId])

  if (grouped.length === 0) return null

  const react = (emoji: string) =>
    toggleReaction(qc, message, userId, emoji).catch(() =>
      toast.error("Não foi possível reagir.")
    )

  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {grouped.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          disabled={!canReact}
          onClick={() => react(emoji)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-lg border border-transparent bg-card px-1.5 text-sm transition-colors hover:border-border",
            mine && "border-primary bg-primary/15 hover:border-primary"
          )}
        >
          <span className="text-base leading-none">{emoji}</span>
          <span
            className={cn(
              "font-semibold text-interactive tabular-nums",
              mine && "text-mention-pill-foreground"
            )}
          >
            {count}
          </span>
        </button>
      ))}
      {canReact && (
        <EmojiPickerPopover onSelect={react} side="right" align="start">
          <button
            type="button"
            aria-label="Adicionar reação"
            className="flex h-6 items-center rounded-lg bg-card px-1.5 text-interactive opacity-0 transition-opacity group-hover/message:opacity-100 hover:text-interactive-hover"
          >
            <SmileyIcon className="size-4" />
          </button>
        </EmojiPickerPopover>
      )}
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick?: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
              "flex size-8 items-center justify-center text-interactive transition-colors hover:bg-hover hover:text-interactive-hover",
              danger && "text-danger hover:text-danger"
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** A bare GIF/image link renders as just the media, like Discord. */
function isMediaOnlyLink(message: Message) {
  const content = message.content.trim()
  if (!/^https?:\/\/\S+$/.test(content) || message.embeds.length !== 1) {
    return false
  }
  const [embed] = message.embeds
  return (
    embed.url === content &&
    (embed.type === "gifv" ||
      embed.type === "image" ||
      embed.type === "video") &&
    !embed.title
  )
}

const QUICK_REACTIONS = ["👍", "😂", "❤️"]

type MessageItemProps = {
  message: Message
  /** first message of a group: shows avatar, name and full timestamp */
  head: boolean
}

export const MessageItem = memo(function MessageItem({
  message,
  head,
}: MessageItemProps) {
  const userId = useUserId()
  const qc = useQueryClient()
  const chat = useChat()
  const author = useProfile(message.author_id)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const mine = message.author_id === userId
  const editing = chat.editingId === message.id
  const mentioned =
    message.mentions.includes(userId) ||
    (message.mention_everyone && !mine) ||
    (message.reply?.author_id === userId && !mine)
  const canDelete = mine || chat.canManageMessages
  const canPin = chat.canManageMessages || chat.serverId === null
  const showHead = head || !!message.reply_to_id
  const mediaOnly = isMediaOnlyLink(message)

  const react = (emoji: string) =>
    toggleReaction(qc, message, userId, emoji).catch(() =>
      toast.error("Não foi possível reagir.")
    )

  const pin = async () => {
    try {
      const pinned = await togglePin(message.id)
      toast.success(pinned ? "Mensagem fixada." : "Mensagem desafixada.")
    } catch {
      toast.error("Você não tem permissão para fixar mensagens.")
    }
  }

  const remove = async () => {
    try {
      await deleteMessage(qc, message.id)
    } catch {
      toast.error("Não foi possível excluir a mensagem.")
      await qc.invalidateQueries({
        queryKey: queryKeys.channelMessages(message.channel_id),
      })
    }
  }

  const askDelete = (e?: React.MouseEvent) => {
    // shift-click skips the confirmation, like Discord
    if (e?.shiftKey) void remove()
    else setConfirmDelete(true)
  }

  const compact = useAccessibility().messageDisplay === "compact"

  const reply = () => {
    chat.setReplyTo(message)
    chat.focusComposer()
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            "group/message group/play relative pr-12 pl-18 text-(length:--chat-font-size) transition-colors hover:bg-message-hover max-md:pr-3",
            showHead ? "mt-(--message-group-spacing) py-0.5" : "py-0.5",
            mentioned &&
              "bg-mention before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-warning hover:bg-mention-hover",
            editing && "bg-message-hover"
          )}
          data-message-id={message.id}
        >
          {message.reply_to_id && <ReplyPreview message={message} />}

          {showHead && !compact ? (
            <>
              <ProfilePopover
                userId={message.author_id}
                serverId={chat.serverId}
              >
                <button
                  type="button"
                  className={cn(
                    "absolute left-4 mt-px rounded-full",
                    message.reply_to_id ? "top-7" : "top-1"
                  )}
                >
                  <UserAvatar profile={author ?? null} size="lg" still />
                </button>
              </ProfilePopover>
              <div className="mb-0.5 flex items-baseline gap-2 leading-[1.375]">
                <AuthorName
                  userId={message.author_id}
                  serverId={chat.serverId}
                />
                {author && <GuildTag profile={author} />}
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
            </>
          ) : (
            <time
              className={cn(
                "absolute top-1 left-0 w-18 pr-2 text-right text-[11px] leading-6 text-muted-foreground",
                !showHead && "opacity-0 group-hover/message:opacity-100"
              )}
            >
              {formatTime(message.created_at)}
            </time>
          )}

          <div
            className={cn(compact && showHead && "flex items-baseline gap-1")}
          >
            {compact && showHead && (
              <span className="flex shrink-0 items-baseline gap-1">
                <AuthorName
                  userId={message.author_id}
                  serverId={chat.serverId}
                />
                {author && <GuildTag profile={author} />}
              </span>
            )}
            {editing ? (
              <EditBox message={message} />
            ) : (
              message.content &&
              !mediaOnly && (
                <div
                  className={cn(
                    "min-w-0 leading-[1.375] break-words whitespace-pre-wrap text-foreground",
                    message.pending && "opacity-50",
                    message.failed && "text-danger"
                  )}
                >
                  <Markdown content={message.content} />
                  {message.edited_at && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="ml-1 text-[10px] text-muted-foreground select-none" />
                        }
                      >
                        (editado)
                      </TooltipTrigger>
                      <TooltipContent className="bg-popover text-sm text-header">
                        {formatFullDate(message.edited_at)}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )
            )}
          </div>

          {message.failed && (
            <span className="text-xs text-danger">
              Não foi possível enviar esta mensagem.
            </span>
          )}

          <Attachments attachments={message.attachments} />
          <Embeds embeds={message.embeds} />
          <Reactions message={message} />

          {!editing && !message.pending && (
            <div className="absolute -top-4 right-4 z-10 hidden overflow-hidden rounded-lg border border-sidebar-border bg-background shadow-sm group-hover/message:flex has-data-popup-open:flex">
              {chat.canReact &&
                QUICK_REACTIONS.map((emoji) => (
                  <ToolbarButton
                    key={emoji}
                    label={`Reagir com ${emoji}`}
                    onClick={() => react(emoji)}
                  >
                    <span className="text-lg leading-none">{emoji}</span>
                  </ToolbarButton>
                ))}
              {chat.canReact && (
                <EmojiPickerPopover onSelect={react} side="left" align="start">
                  <button
                    type="button"
                    aria-label="Adicionar reação"
                    className="flex size-8 items-center justify-center text-interactive hover:bg-hover hover:text-interactive-hover"
                  >
                    <SmileyIcon className="size-5" />
                  </button>
                </EmojiPickerPopover>
              )}
              {mine ? (
                <ToolbarButton
                  label="Editar"
                  onClick={() => chat.setEditingId(message.id)}
                >
                  <PencilSimpleIcon className="size-5" />
                </ToolbarButton>
              ) : (
                chat.canSend && (
                  <ToolbarButton label="Responder" onClick={reply}>
                    <ArrowBendUpLeftIcon className="size-5" />
                  </ToolbarButton>
                )
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Mais"
                      className="flex size-8 items-center justify-center text-interactive hover:bg-hover hover:text-interactive-hover"
                    />
                  }
                >
                  <DotsThreeIcon className="size-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {mine && (
                    <DropdownMenuItem
                      onClick={() => chat.setEditingId(message.id)}
                    >
                      Editar mensagem
                      <PencilSimpleIcon className="ml-auto" />
                    </DropdownMenuItem>
                  )}
                  {chat.canSend && (
                    <DropdownMenuItem onClick={reply}>
                      Responder
                      <ArrowBendUpLeftIcon className="ml-auto" />
                    </DropdownMenuItem>
                  )}
                  {canPin && (
                    <DropdownMenuItem onClick={pin}>
                      {message.pinned ? "Desafixar mensagem" : "Fixar mensagem"}
                      <PushPinIcon className="ml-auto" />
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      navigator.clipboard.writeText(message.content)
                    }
                  >
                    Copiar texto
                    <CopyIcon className="ml-auto" />
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={askDelete}
                      >
                        Excluir mensagem
                        <TrashIcon className="ml-auto" />
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {chat.canReact && (
            <div className="flex justify-between gap-1 p-1">
              {[...QUICK_REACTIONS, "🔥"].map((emoji) => (
                <ContextMenuItem
                  key={emoji}
                  onClick={() => react(emoji)}
                  className="size-9 justify-center rounded-full bg-card p-0 text-lg"
                >
                  {emoji}
                </ContextMenuItem>
              ))}
            </div>
          )}
          <ContextMenuSeparator />
          {mine && (
            <ContextMenuItem onClick={() => chat.setEditingId(message.id)}>
              Editar mensagem
              <PencilSimpleIcon className="ml-auto" />
            </ContextMenuItem>
          )}
          {chat.canSend && (
            <ContextMenuItem onClick={reply}>
              Responder
              <ArrowBendUpLeftIcon className="ml-auto" />
            </ContextMenuItem>
          )}
          {canPin && (
            <ContextMenuItem onClick={pin}>
              {message.pinned ? "Desafixar mensagem" : "Fixar mensagem"}
              <PushPinIcon className="ml-auto" />
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(message.content)}
          >
            Copiar texto
            <CopyIcon className="ml-auto" />
          </ContextMenuItem>
          {canDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir mensagem
                <TrashIcon className="ml-auto" />
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(message.id)}
          >
            Copiar ID da mensagem
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta mensagem? Dica: segure Shift
              ao clicar em excluir para pular esta confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="pointer-events-none rounded-md border border-border py-2 shadow-sm">
            <div className="flex gap-3 px-3">
              <UserAvatar profile={author ?? null} size="lg" still />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-header">
                  {displayName(author)}
                </span>
                <span className="line-clamp-3 text-sm">{message.content}</span>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
