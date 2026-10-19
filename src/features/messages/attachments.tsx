import { DownloadSimpleIcon, FileIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { PausableGif } from "@/components/pausable-gif"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { FavoriteStar } from "@/features/messages/gif-picker"
import { formatBytes } from "@/lib/format"
import type { Attachment } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_W = 550
const MAX_H = 350

export function fitMedia(
  width?: number,
  height?: number,
  maxW = MAX_W,
  maxH = MAX_H
) {
  if (!width || !height) return { maxWidth: maxW, maxHeight: maxH }
  const scale = Math.min(1, maxW / width, maxH / height)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

/** Click-to-zoom image, like Discord's media viewer. */
export function ZoomableImage({
  src,
  alt,
  width,
  height,
  className,
  gif = false,
}: {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  /** pause after a few seconds and animate again on hover */
  gif?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="group/media relative w-fit">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("block overflow-hidden rounded-lg", className)}
          style={fitMedia(width, height)}
        >
          {gif ? (
            <PausableGif
              src={src}
              alt={alt}
              className="size-full object-cover"
            />
          ) : (
            <img
              src={src}
              alt={alt}
              loading="lazy"
              className="size-full object-cover"
              draggable={false}
            />
          )}
        </button>
        {gif && (
          <FavoriteStar
            gif={{
              url: src,
              preview: src,
              width: width ?? 0,
              height: height ?? 0,
            }}
            className="absolute top-2 right-2 group-hover/media:opacity-100"
          />
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-[90vw] gap-2 bg-transparent p-0 shadow-none ring-0 sm:max-w-[90vw]"
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-md object-contain"
          />
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-header hover:underline"
          >
            Abrir no navegador
          </a>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SpoilerWrap({
  spoiler,
  children,
}: {
  spoiler?: boolean
  children: React.ReactNode
}) {
  const [revealed, setRevealed] = useState(!spoiler)
  if (revealed) return <>{children}</>
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="relative overflow-hidden rounded-lg"
    >
      <div className="pointer-events-none blur-2xl">{children}</div>
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-popover px-3 py-1.5 text-sm font-bold text-header uppercase">
        Spoiler
      </span>
    </button>
  )
}

function FileCard({ attachment }: { attachment: Attachment }) {
  return (
    <div className="flex w-full max-w-108 items-center gap-3 rounded-lg border border-sidebar-border bg-card p-4">
      <FileIcon className="size-10 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-link hover:underline"
        >
          {attachment.filename}
        </a>
        <span className="text-xs text-muted-foreground">
          {formatBytes(attachment.size)}
        </span>
      </div>
      <a
        href={attachment.url}
        download={attachment.filename}
        aria-label="Baixar"
        className="text-interactive hover:text-interactive-hover"
      >
        <DownloadSimpleIcon className="size-6" />
      </a>
    </div>
  )
}

export function Attachments({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-col gap-1 py-0.5">
      {attachments.map((a) => {
        const type = a.content_type
        let body: React.ReactNode
        if (type.startsWith("image/")) {
          body = (
            <ZoomableImage
              src={a.url}
              alt={a.filename}
              width={a.width}
              height={a.height}
              gif={type === "image/gif"}
            />
          )
        } else if (type.startsWith("video/")) {
          body = (
            <video
              src={a.url}
              controls
              preload="metadata"
              className="rounded-lg bg-black"
              style={fitMedia(a.width, a.height)}
            />
          )
        } else if (type.startsWith("audio/")) {
          body = (
            <div className="flex w-full max-w-108 flex-col gap-2 rounded-lg border border-sidebar-border bg-card p-3">
              <span className="truncate text-sm text-link">{a.filename}</span>
              <audio
                src={a.url}
                controls
                preload="metadata"
                className="w-full"
              />
            </div>
          )
        } else {
          body = <FileCard attachment={a} />
        }
        return (
          <div key={a.id} className="w-fit">
            <SpoilerWrap spoiler={a.spoiler}>{body}</SpoilerWrap>
          </div>
        )
      })}
    </div>
  )
}
