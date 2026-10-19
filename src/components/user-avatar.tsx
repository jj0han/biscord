import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { usePresence } from "@/features/realtime/presence"
import { displayName, initials } from "@/lib/format"
import type { PresenceStatus, Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

const SIZES = {
  xs: { box: "size-4", dot: "size-2 ring-2", text: "text-[8px]" },
  sm: { box: "size-6", dot: "size-2.5 ring-2", text: "text-[10px]" },
  md: { box: "size-8", dot: "size-3 ring-[3px]", text: "text-xs" },
  lg: { box: "size-10", dot: "size-3.5 ring-[3px]", text: "text-sm" },
  xl: { box: "size-20", dot: "size-6 ring-[6px]", text: "text-2xl" },
} as const

export type AvatarSize = keyof typeof SIZES

const STATUS_CLASS: Record<PresenceStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
}

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: "Disponível",
  idle: "Ausente",
  dnd: "Não perturbar",
  offline: "Offline",
}

export function StatusDot({
  status,
  className,
}: {
  status: PresenceStatus
  className?: string
}) {
  return (
    <span
      aria-label={STATUS_LABEL[status]}
      className={cn(
        "relative inline-block shrink-0 rounded-full",
        STATUS_CLASS[status],
        className
      )}
    >
      {status === "idle" && (
        <span className="absolute -top-px -left-px size-[60%] rounded-full [background:var(--status-cutout,var(--sidebar))]" />
      )}
      {status === "dnd" && (
        <span className="absolute top-1/2 left-1/2 h-[25%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full [background:var(--status-cutout,var(--sidebar))]" />
      )}
      {status === "offline" && (
        <span className="absolute top-1/2 left-1/2 size-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full [background:var(--status-cutout,var(--sidebar))]" />
      )}
    </span>
  )
}

type UserAvatarProps = {
  profile: Pick<
    Profile,
    "id" | "avatar_url" | "display_name" | "username" | "avatar_decoration_url"
  > | null
  size?: AvatarSize
  /** show the live presence dot */
  showStatus?: boolean
  /** override presence, e.g. for the profile popout */
  status?: PresenceStatus
  /** ring color behind the status dot — must match the surface */
  surface?: "sidebar" | "background" | "panel" | "popover" | "card"
  speaking?: boolean
  decoration?: boolean
  className?: string
}

const SURFACE_RING = {
  sidebar: "ring-sidebar [--status-cutout:var(--sidebar)]",
  background: "ring-background [--status-cutout:var(--background)]",
  panel: "ring-panel [--status-cutout:var(--panel)]",
  popover: "ring-popover [--status-cutout:var(--popover)]",
  card: "ring-card [--status-cutout:var(--card)]",
}

export function UserAvatar({
  profile,
  size = "md",
  showStatus = false,
  status,
  surface = "sidebar",
  speaking = false,
  decoration = false,
  className,
}: UserAvatarProps) {
  const live = usePresence(showStatus && !status ? profile?.id : null)
  const resolved = status ?? live
  const s = SIZES[size]
  const name = displayName(profile)

  return (
    <span className={cn("relative inline-flex shrink-0", s.box, className)}>
      <Avatar
        className={cn(
          "size-full after:hidden",
          speaking &&
            "ring-2 ring-success ring-offset-2 ring-offset-transparent"
        )}
      >
        {profile?.avatar_url && (
          <AvatarImage src={profile.avatar_url} alt={name} draggable={false} />
        )}
        <AvatarFallback
          className={cn(
            "bg-primary font-medium text-primary-foreground",
            s.text
          )}
        >
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {decoration && profile?.avatar_decoration_url && (
        <img
          src={profile.avatar_decoration_url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute -inset-[10%] size-[120%] max-w-none"
        />
      )}
      {showStatus && (
        <StatusDot
          status={resolved}
          className={cn(
            "absolute -right-0.5 -bottom-0.5",
            s.dot,
            SURFACE_RING[surface]
          )}
        />
      )}
    </span>
  )
}
