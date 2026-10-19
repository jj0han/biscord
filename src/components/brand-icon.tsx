import type { SimpleIcon } from "simple-icons"
import { siDiscord } from "simple-icons"

import { cn } from "@/lib/utils"

/** A Simple Icons brand logo; fill defaults to currentColor. */
export function BrandIcon({
  icon,
  color,
  className,
}: {
  icon: SimpleIcon
  color?: string
  className?: string
}) {
  return (
    <svg
      role="img"
      aria-label={icon.title}
      viewBox="0 0 24 24"
      fill={color ?? "currentColor"}
      className={cn("size-4 shrink-0", className)}
    >
      <path d={icon.path} />
    </svg>
  )
}

/** Discord's Clyde logo (Phosphor's version is an older, different mark). */
export function DiscordIcon({ className }: { className?: string }) {
  return <BrandIcon icon={siDiscord} className={className} />
}
