import { PlayIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { fitMedia, ZoomableImage } from "@/features/messages/attachments"
import type { Embed } from "@/lib/types"

function colorOf(embed: Embed) {
  return embed.color !== undefined
    ? `#${embed.color.toString(16).padStart(6, "0")}`
    : undefined
}

/** YouTube-style embed: thumbnail that turns into an iframe on click. */
function VideoPlayer({ embed }: { embed: Embed }) {
  const [playing, setPlaying] = useState(false)
  const video = embed.video!
  const thumb = embed.thumbnail
  const size = fitMedia(video.width ?? 1280, video.height ?? 720, 400, 225)

  if (video.embedUrl && playing) {
    return (
      <iframe
        src={`${video.embedUrl}?autoplay=1`}
        title={embed.title ?? "Vídeo"}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        className="rounded-md"
        style={size}
      />
    )
  }

  if (!video.embedUrl) {
    return (
      <video
        src={video.url}
        poster={thumb?.url}
        controls
        preload="metadata"
        className="rounded-md bg-black"
        style={size}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative overflow-hidden rounded-md"
      style={size}
    >
      {thumb && (
        <img
          src={thumb.url}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      )}
      <span className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-popover/80 text-header">
        <PlayIcon className="size-6" />
      </span>
    </button>
  )
}

function EmbedCard({ embed }: { embed: Embed }) {
  // a bare image/gif link renders as just the media, like Discord
  if ((embed.type === "image" || embed.type === "gifv") && embed.image) {
    return (
      <ZoomableImage
        src={embed.image.url}
        alt=""
        width={embed.image.width}
        height={embed.image.height}
      />
    )
  }
  if (
    embed.type === "video" &&
    embed.video &&
    !embed.title &&
    !embed.description
  ) {
    return <VideoPlayer embed={embed} />
  }

  const hasVideo = embed.type === "video" && !!embed.video
  const thumbnailBeside = !hasVideo && embed.thumbnail && !embed.image

  return (
    <div
      className="grid max-w-108 rounded-sm border-l-4 border-sidebar-border bg-card"
      style={{ borderLeftColor: colorOf(embed) }}
    >
      <div className="flex gap-4 px-4 pt-2 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          {embed.provider && (
            <span className="text-xs text-foreground">
              {embed.provider.name}
            </span>
          )}
          {embed.author && (
            <span className="text-sm font-semibold text-header">
              {embed.author.url ? (
                <a
                  href={embed.author.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {embed.author.name}
                </a>
              ) : (
                embed.author.name
              )}
            </span>
          )}
          {embed.title && (
            <a
              href={embed.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-link hover:underline"
            >
              {embed.title}
            </a>
          )}
          {embed.description && (
            <p className="text-sm whitespace-pre-line text-foreground">
              {embed.description}
            </p>
          )}
          {hasVideo && <VideoPlayer embed={embed} />}
          {embed.image && (
            <ZoomableImage
              src={embed.image.url}
              alt=""
              width={embed.image.width}
              height={embed.image.height}
              className="max-w-100"
            />
          )}
        </div>
        {thumbnailBeside && (
          <img
            src={embed.thumbnail!.url}
            alt=""
            loading="lazy"
            className="mt-2 size-20 shrink-0 rounded-md object-cover"
          />
        )}
      </div>
    </div>
  )
}

export function Embeds({ embeds }: { embeds: Embed[] }) {
  if (embeds.length === 0) return null
  return (
    <div className="flex flex-col gap-1 py-0.5">
      {embeds.map((embed, index) => (
        <EmbedCard key={`${embed.url}-${index}`} embed={embed} />
      ))}
    </div>
  )
}
