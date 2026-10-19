import { createContext, type ReactNode, use, useMemo, useState } from "react"

import { formatDiscordTimestamp, formatFullDate } from "@/lib/format"
import { CodeBlock } from "@/lib/markdown/code-block"
import {
  isEmojiOnly,
  type MarkdownNode,
  parseMarkdown,
} from "@/lib/markdown/parse"
import { cn } from "@/lib/utils"

type MentionRenderers = {
  user: (id: string) => ReactNode
  channel: (id: string) => ReactNode
  role: (id: string) => ReactNode
}

const fallbackRenderers: MentionRenderers = {
  user: () => <MentionPill>@usuário-desconhecido</MentionPill>,
  channel: () => <MentionPill>#canal-desconhecido</MentionPill>,
  role: () => <MentionPill>@cargo-desconhecido</MentionPill>,
}

const MentionRenderersContext =
  createContext<MentionRenderers>(fallbackRenderers)

export const MentionRenderersProvider = MentionRenderersContext.Provider

export function MentionPill({
  children,
  className,
  style,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "cursor-pointer rounded-sm bg-mention-pill px-0.5 font-medium text-mention-pill-foreground transition-colors hover:bg-primary hover:text-primary-foreground",
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </span>
  )
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => e.key === "Enter" && setRevealed(true)}
      className={cn(
        "rounded-sm px-0.5 transition-colors",
        revealed
          ? "bg-foreground/10"
          : "cursor-pointer bg-spoiler text-transparent select-none [&_*]:invisible"
      )}
    >
      {children}
    </span>
  )
}

function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  let safe: boolean
  try {
    const url = new URL(href)
    safe = url.protocol === "https:" || url.protocol === "http:"
  } catch {
    safe = false
  }
  if (!safe) return <>{children}</>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  )
}

function renderNodes(
  nodes: MarkdownNode[] | string | undefined,
  mentions: MentionRenderers,
  jumbo: boolean
): ReactNode {
  if (nodes === undefined) return null
  if (typeof nodes === "string") return nodes
  return nodes.map((node, index) => (
    <MarkdownElement
      key={index}
      node={node}
      mentions={mentions}
      jumbo={jumbo}
    />
  ))
}

function MarkdownElement({
  node,
  mentions,
  jumbo,
}: {
  node: MarkdownNode
  mentions: MentionRenderers
  jumbo: boolean
}) {
  const children = () => renderNodes(node.content, mentions, jumbo)

  switch (node.type) {
    case "text":
    case "escape":
    case "emoticon":
      return <>{node.content as string}</>
    case "br":
    case "newline":
      return <br />
    case "strong":
      return <strong className="font-semibold">{children()}</strong>
    case "em":
      return <em>{children()}</em>
    case "underline":
      return <u>{children()}</u>
    case "strikethrough":
      return <s>{children()}</s>
    case "inlineCode":
      return (
        <code className="rounded-sm bg-card px-1 py-0.5 font-mono text-[0.85em]">
          {node.content as string}
        </code>
      )
    case "codeBlock":
      return (
        <CodeBlock
          code={node.content as string}
          lang={(node.lang as string) || undefined}
        />
      )
    case "blockQuote":
      return (
        <blockquote className="flex gap-2">
          <span className="w-1 shrink-0 rounded-sm bg-channel-icon" />
          <span className="min-w-0">{children()}</span>
        </blockquote>
      )
    case "spoiler":
      return <Spoiler>{children()}</Spoiler>
    case "heading": {
      const level = node.level as number
      const size =
        level === 1 ? "text-2xl" : level === 2 ? "text-xl" : "text-base"
      return (
        <span className={cn("my-2 block leading-tight font-bold", size)}>
          {children()}
        </span>
      )
    }
    case "subtext":
      return (
        <span className="block text-xs text-muted-foreground">
          {children()}
        </span>
      )
    case "url":
    case "autolink":
    case "link":
      return <SafeLink href={node.target as string}>{children()}</SafeLink>
    case "user":
      return <>{mentions.user(node.id as string)}</>
    case "channel":
      return <>{mentions.channel(node.id as string)}</>
    case "role":
      return <>{mentions.role(node.id as string)}</>
    case "everyone":
      return <MentionPill>@everyone</MentionPill>
    case "here":
      return <MentionPill>@here</MentionPill>
    case "twemoji":
      return (
        <span
          className={cn(jumbo ? "text-5xl leading-tight" : "text-[1.375em]")}
        >
          {node.name as string}
        </span>
      )
    case "emoji":
      return <>{`:${node.name as string}:`}</>
    case "timestamp": {
      const unix = Number(node.timestamp)
      return (
        <time
          title={formatFullDate(new Date(unix * 1000))}
          className="rounded-sm bg-foreground/10 px-0.5"
        >
          {formatDiscordTimestamp(unix, (node.format as string) || "f")}
        </time>
      )
    }
    default:
      return <>{renderNodes(node.content, mentions, jumbo)}</>
  }
}

export function Markdown({ content }: { content: string }) {
  const mentions = use(MentionRenderersContext)
  const nodes = useMemo(() => parseMarkdown(content), [content])
  const jumbo = useMemo(() => isEmojiOnly(content), [content])
  return <>{renderNodes(nodes, mentions, jumbo)}</>
}
