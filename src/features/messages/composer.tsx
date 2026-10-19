import {
  EyeIcon,
  EyeSlashIcon,
  FileIcon,
  PlusCircleIcon,
  SmileyIcon,
  TrashIcon,
  XCircleIcon,
} from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { toast } from "sonner"

import { Spinner } from "@/components/ui/spinner"
import { useUserId } from "@/features/auth/auth-provider"
import { useChat } from "@/features/messages/chat-context"
import { EmojiPickerPopover } from "@/features/messages/emoji-picker"
import { type Gif, GifPicker } from "@/features/messages/gif-picker"
import { toRawContent } from "@/features/messages/mention-text"
import {
  MessageInput,
  type MessageInputHandle,
} from "@/features/messages/message-input"
import {
  findMessageInCache,
  type MessagePages,
  sendMessage,
} from "@/features/messages/queries"
import { useProfile } from "@/features/profiles/queries"
import { uploadFile, useMember } from "@/features/servers/queries"
import { displayName, formatBytes } from "@/lib/format"
import { queryKeys } from "@/lib/query-keys"
import type { Attachment } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_FILES = 10

type PendingFile = {
  id: string
  file: File
  preview: string | null
  spoiler: boolean
}

async function imageSize(file: File) {
  if (!file.type.startsWith("image/")) return {}
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return {}
  }
}

export type ComposerHandle = {
  focus: () => void
  addFiles: (files: File[]) => void
}

type ComposerProps = {
  placeholder: string
  onTyping: () => void
  onStopTyping: () => void
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  function Composer({ placeholder, onTyping, onStopTyping }, ref) {
    const userId = useUserId()
    const qc = useQueryClient()
    const chat = useChat()
    const inputRef = useRef<MessageInputHandle>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const [value, setValue] = useState("")
    const [files, setFiles] = useState<PendingFile[]>([])
    const [uploading, setUploading] = useState(false)

    const replyAuthor = useProfile(chat.replyTo?.author_id)
    const replyMember = useMember(chat.serverId, chat.replyTo?.author_id ?? "")

    const addFiles = (incoming: File[]) => {
      if (!chat.canAttach) {
        toast.error("Você não tem permissão para enviar arquivos aqui.")
        return
      }
      const accepted = incoming.filter((f) => {
        if (f.size > MAX_FILE_BYTES) {
          toast.error(`${f.name} é maior que 25 MB.`)
          return false
        }
        return true
      })
      setFiles((prev) =>
        [
          ...prev,
          ...accepted.map((file) => ({
            id: crypto.randomUUID(),
            file,
            preview: file.type.startsWith("image/")
              ? URL.createObjectURL(file)
              : null,
            spoiler: false,
          })),
        ].slice(0, MAX_FILES)
      )
    }

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      addFiles,
    }))

    const removeFile = (id: string) =>
      setFiles((prev) => {
        const target = prev.find((f) => f.id === id)
        if (target?.preview) URL.revokeObjectURL(target.preview)
        return prev.filter((f) => f.id !== id)
      })

    const editLastMessage = () => {
      const data = qc.getQueryData<MessagePages>(
        queryKeys.channelMessages(chat.channel.id)
      )
      const last = data?.pages
        .flat()
        .find((m) => m.author_id === userId && !m.pending)
      if (last) chat.setEditingId(last.id)
    }

    // GIFs go out immediately as their own message, like on Discord
    const sendGif = (gif: Gif) =>
      sendMessage(qc, {
        id: crypto.randomUUID(),
        channelId: chat.channel.id,
        authorId: userId,
        content: gif.url,
        replyTo: chat.replyTo,
        attachments: [],
        embeds: [
          {
            type: "gifv",
            url: gif.url,
            image: { url: gif.url, width: gif.width, height: gif.height },
          },
        ],
      }).finally(() => chat.setReplyTo(null))

    const submit = async () => {
      const content = toRawContent(
        value.trim(),
        chat.people,
        chat.mentionChannels
      )
      if ((!content && files.length === 0) || uploading) return
      if (content.length > 4000) {
        toast.error("Sua mensagem passou de 4000 caracteres.")
        return
      }

      let attachments: Attachment[] = []
      if (files.length > 0) {
        setUploading(true)
        try {
          attachments = await Promise.all(
            files.map(async ({ file, spoiler }) => ({
              id: crypto.randomUUID(),
              url: await uploadFile("attachments", userId, file),
              filename: file.name,
              size: file.size,
              content_type: file.type || "application/octet-stream",
              spoiler,
              ...(await imageSize(file)),
            }))
          )
        } catch {
          toast.error("Falha no envio dos arquivos.")
          setUploading(false)
          return
        }
        files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview))
        setFiles([])
        setUploading(false)
      }

      const replyTo = chat.replyTo
        ? (findMessageInCache(qc, chat.replyTo.id) ?? chat.replyTo)
        : null

      setValue("")
      chat.setReplyTo(null)
      onStopTyping()

      try {
        await sendMessage(qc, {
          id: crypto.randomUUID(),
          channelId: chat.channel.id,
          authorId: userId,
          content,
          replyTo,
          attachments,
        })
      } catch {
        // the optimistic message is already marked as failed
      }
    }

    if (!chat.canSend) {
      return (
        <div className="px-4">
          <div className="flex min-h-14 items-center rounded-lg border border-border bg-composer px-4 text-muted-foreground">
            Você não tem permissão para enviar mensagens neste canal.
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col px-4">
        {chat.replyTo && (
          <div className="flex items-center gap-2 rounded-t-lg bg-sidebar px-4 py-2 text-sm text-muted-foreground">
            <span className="flex-1 truncate">
              Respondendo a{" "}
              <span className="font-semibold text-header">
                {displayName(replyAuthor, replyMember?.nickname)}
              </span>
            </span>
            <button
              type="button"
              aria-label="Cancelar resposta"
              onClick={() => chat.setReplyTo(null)}
              className="text-interactive hover:text-interactive-hover"
            >
              <XCircleIcon className="size-5" />
            </button>
          </div>
        )}

        {files.length > 0 && (
          <div
            className={cn(
              "flex scrollbar-thin gap-6 overflow-x-auto bg-composer p-4 pb-2",
              chat.replyTo ? "" : "rounded-t-lg"
            )}
          >
            {files.map((f) => (
              <div
                key={f.id}
                className="relative flex w-50 shrink-0 flex-col gap-2 rounded-md bg-sidebar p-2"
              >
                <div className="flex h-40 items-center justify-center overflow-hidden rounded-sm">
                  {f.preview ? (
                    <img
                      src={f.preview}
                      alt=""
                      className={cn(
                        "max-h-full max-w-full object-contain",
                        f.spoiler && "blur-xl"
                      )}
                    />
                  ) : (
                    <FileIcon className="size-16 text-primary" />
                  )}
                </div>
                <span className="truncate text-sm">{f.file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(f.file.size)}
                </span>
                <div className="absolute -top-3 -right-3 flex overflow-hidden rounded-md border border-sidebar-border bg-background shadow-sm">
                  <button
                    type="button"
                    aria-label="Marcar como spoiler"
                    onClick={() =>
                      setFiles((prev) =>
                        prev.map((x) =>
                          x.id === f.id ? { ...x, spoiler: !x.spoiler } : x
                        )
                      )
                    }
                    className="flex size-8 items-center justify-center text-interactive hover:bg-hover hover:text-interactive-hover"
                  >
                    {f.spoiler ? (
                      <EyeSlashIcon className="size-5" />
                    ) : (
                      <EyeIcon className="size-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Remover anexo"
                    onClick={() => removeFile(f.id)}
                    className="flex size-8 items-center justify-center text-danger hover:bg-hover"
                  >
                    <TrashIcon className="size-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <MessageInput
          ref={inputRef}
          value={value}
          onChange={(next) => {
            setValue(next)
            if (next) onTyping()
            else onStopTyping()
          }}
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape" && chat.replyTo) {
              chat.setReplyTo(null)
            }
            if (e.key === "ArrowUp" && !value) {
              e.preventDefault()
              editLastMessage()
            }
          }}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files]
            if (pasted.length > 0) {
              e.preventDefault()
              addFiles(pasted)
            }
          }}
          placeholder={placeholder}
          autoFocus
          className={cn(
            (chat.replyTo || files.length > 0) &&
              "[&>div:last-child]:rounded-t-none"
          )}
          leading={
            <button
              type="button"
              aria-label="Enviar arquivo"
              disabled={!chat.canAttach}
              onClick={() => fileRef.current?.click()}
              className="mt-4 -ml-1 text-interactive transition-colors hover:text-interactive-hover disabled:opacity-40"
            >
              {uploading ? (
                <Spinner className="size-6" />
              ) : (
                <PlusCircleIcon weight="bold" className="size-6" />
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])])
                  e.target.value = ""
                }}
              />
            </button>
          }
          trailing={
            <div className="flex items-start gap-3">
              {chat.canSend && <GifPicker onPick={sendGif} />}
              <EmojiPickerPopover
                onSelect={(emoji) => inputRef.current?.insert(emoji)}
              >
                <button
                  type="button"
                  aria-label="Selecionar emoji"
                  className="mt-4 text-interactive transition-colors hover:text-warning"
                >
                  <SmileyIcon className="size-6" />
                </button>
              </EmojiPickerPopover>
            </div>
          }
        />
      </div>
    )
  }
)
