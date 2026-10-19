import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type CodeBlockProps = {
  code: string
  lang?: string
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!lang) {
      setHtml(null)
      return
    }
    // highlight.js is heavy, so it only loads once a code block with a
    // language actually renders
    import("highlight.js/lib/common").then(({ default: hljs }) => {
      if (cancelled || !hljs.getLanguage(lang)) return
      setHtml(hljs.highlight(code, { language: lang }).value)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group/code relative my-1 max-w-[90%]">
      <pre className="scrollbar-thin overflow-x-auto rounded-md border border-sidebar-border bg-card p-2 font-mono text-sm leading-snug text-foreground">
        {html ? (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar código"
        className={cn(
          "absolute top-2 right-2 rounded-md bg-popover p-1 text-interactive opacity-0 transition-opacity group-hover/code:opacity-100 hover:text-interactive-hover"
        )}
      >
        {copied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
    </div>
  )
}
