import { HashIcon, SpeakerHighIcon } from "@phosphor-icons/react"
import {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { UserAvatar } from "@/components/user-avatar"
import { useChat } from "@/features/messages/chat-context"
import { displayName } from "@/lib/format"
import { cn } from "@/lib/utils"

type Suggestion =
  | {
      kind: "user"
      id: string
      insert: string
      label: string
      hint: string
      profile: Parameters<typeof UserAvatar>[0]["profile"]
    }
  | { kind: "special"; id: string; insert: string; label: string; hint: string }
  | {
      kind: "channel"
      id: string
      insert: string
      label: string
      hint: string
      voice: boolean
    }

export type MessageInputHandle = {
  focus: () => void
  insert: (text: string) => void
}

type MessageInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
}

const TRIGGER = /(^|\s)([@#])([\p{L}\p{N}_.-]*)$/u

/** Discord's composer textarea: autosize, Enter to send, @/# autocomplete. */
export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(
  function MessageInput(
    {
      value,
      onChange,
      onSubmit,
      onKeyDown,
      onPaste,
      placeholder,
      disabled,
      autoFocus,
      leading,
      trailing,
      className,
    },
    ref
  ) {
    const chat = useChat()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [caret, setCaret] = useState(0)
    const [selected, setSelected] = useState(0)
    const [dismissed, setDismissed] = useState(false)

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      insert: (text: string) => {
        const el = textareaRef.current
        const start = el?.selectionStart ?? value.length
        const end = el?.selectionEnd ?? value.length
        const next = value.slice(0, start) + text + value.slice(end)
        onChange(next)
        requestAnimationFrame(() => {
          el?.focus()
          el?.setSelectionRange(start + text.length, start + text.length)
        })
      },
    }))

    useLayoutEffect(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = "0px"
      el.style.height = `${Math.min(el.scrollHeight, 50 * 16)}px`
    }, [value])

    const match = useMemo(() => {
      if (dismissed) return null
      return TRIGGER.exec(value.slice(0, caret))
    }, [value, caret, dismissed])

    const suggestions = useMemo<Suggestion[]>(() => {
      if (!match) return []
      const [, , trigger, query] = match
      const q = query.toLowerCase()

      if (trigger === "#") {
        return chat.mentionChannels
          .filter(
            (c) => c.type !== "category" && c.name?.toLowerCase().includes(q)
          )
          .slice(0, 10)
          .map((c) => ({
            kind: "channel" as const,
            id: c.id,
            insert: `#${c.name} `,
            label: c.name ?? "",
            hint: "",
            voice: c.type === "voice",
          }))
      }

      const people: Suggestion[] = chat.people
        .filter(({ profile, nickname }) =>
          `${profile.username} ${displayName(profile, nickname)}`
            .toLowerCase()
            .includes(q)
        )
        .slice(0, 10)
        .map(({ profile, nickname }) => ({
          kind: "user" as const,
          id: profile.id,
          insert: `@${profile.username} `,
          label: displayName(profile, nickname),
          hint: profile.username,
          profile,
        }))

      const specials: Suggestion[] =
        chat.serverId && chat.canMentionEveryone
          ? ([
              {
                kind: "special",
                id: "everyone",
                insert: "@everyone ",
                label: "@everyone",
                hint: "Notificar todos que têm acesso a este canal.",
              },
              {
                kind: "special",
                id: "here",
                insert: "@here ",
                label: "@here",
                hint: "Notificar todos que estão online e com acesso.",
              },
            ].filter((s) => s.id.startsWith(q)) as Suggestion[])
          : []

      return [...people, ...specials]
    }, [
      match,
      chat.people,
      chat.mentionChannels,
      chat.serverId,
      chat.canMentionEveryone,
    ])

    const open = suggestions.length > 0
    const active = Math.min(selected, suggestions.length - 1)

    const pick = (suggestion: Suggestion) => {
      if (!match) return
      const start = caret - match[2].length - match[3].length
      const next =
        value.slice(0, start) + suggestion.insert + value.slice(caret)
      onChange(next)
      const position = start + suggestion.insert.length
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(position, position)
        setCaret(position)
      })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault()
          const delta = e.key === "ArrowDown" ? 1 : -1
          setSelected(
            (active + delta + suggestions.length) % suggestions.length
          )
          return
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault()
          pick(suggestions[active])
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          setDismissed(true)
          return
        }
      }
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        onSubmit()
        return
      }
      onKeyDown?.(e)
    }

    return (
      <div className={cn("relative", className)}>
        {open && (
          <div className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-lg bg-sidebar py-2 shadow-xl">
            <span className="px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">
              {match?.[2] === "#" ? "Canais" : "Membros"}
            </span>
            {suggestions.map((s, index) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSelected(index)}
                onClick={() => pick(s)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  index === active && "bg-hover"
                )}
              >
                {s.kind === "user" && (
                  <UserAvatar profile={s.profile} size="sm" />
                )}
                {s.kind === "channel" &&
                  (s.voice ? (
                    <SpeakerHighIcon className="size-5 text-channel-icon" />
                  ) : (
                    <HashIcon className="size-5 text-channel-icon" />
                  ))}
                <span className="font-medium text-header">{s.label}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {s.hint}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-composer px-4">
          {leading}
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onChange={(e) => {
              onChange(e.target.value)
              setCaret(e.target.selectionStart)
              setDismissed(false)
              setSelected(0)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            className="max-h-[50vh] min-h-12 flex-1 resize-none scrollbar-thin bg-transparent py-3 leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          {trailing}
        </div>
      </div>
    )
  }
)
