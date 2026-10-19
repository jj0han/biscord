import {
  FacebookLogoIcon,
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkIcon,
  RedditLogoIcon,
  SealCheckIcon,
  SpotifyLogoIcon,
  SteamLogoIcon,
  TiktokLogoIcon,
  TwitchLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react"
import type { ComponentType } from "react"

import { TooltipContent } from "@/components/tooltip-content"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useAccessibility } from "@/features/settings/accessibility"
import type { DiscordConnection, Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

const BADGE_CDN = "https://cdn.discordapp.com/badge-icons"

/** Discord's public user flags that come with a profile badge. */
const FLAG_BADGES: { bit: number; label: string; icon: string }[] = [
  {
    bit: 0,
    label: "Equipe do Discord",
    icon: "5e74e9b61934fc1f67c65515d1f7e60d",
  },
  {
    bit: 1,
    label: "Dono de servidor parceiro",
    icon: "3f9748e53446a137a052f3454e2de41e",
  },
  {
    bit: 2,
    label: "Eventos do HypeSquad",
    icon: "bf01d1073931f921909045f3a39fd264",
  },
  {
    bit: 6,
    label: "HypeSquad Bravery",
    icon: "8a88d63823d8a71cd5e390baa45efa02",
  },
  {
    bit: 7,
    label: "HypeSquad Brilliance",
    icon: "011940fd013da3f7fb926e4a1cd2e618",
  },
  {
    bit: 8,
    label: "HypeSquad Balance",
    icon: "3aa41de486fa12454c3761e8e223442e",
  },
  {
    bit: 3,
    label: "Caçador de Bugs do Discord",
    icon: "2717692c7dca7289b35297368a940dd0",
  },
  {
    bit: 14,
    label: "Caçador de Bugs do Discord",
    icon: "848f79194d4be5ff5f81505cbd0ce1e6",
  },
  {
    bit: 9,
    label: "Apoiador inicial",
    icon: "7060786766c9c840eb3019e725d2b358",
  },
  {
    bit: 17,
    label: "Desenvolvedor de bots verificado pioneiro",
    icon: "6df5892e0f35b051f8b61eace34f4967",
  },
  {
    bit: 18,
    label: "Moderador certificado",
    icon: "fee1624003e2fee35cb398e125dc479b",
  },
  {
    bit: 22,
    label: "Desenvolvedor ativo",
    icon: "6bdc42827a38498929a4920da12695d9",
  },
]

const NITRO_BADGE = "2ba85e8026a8614b640c2837bcdfe21b"

function badgesOf(profile: Profile) {
  const badges = FLAG_BADGES.filter(
    (badge) => (profile.public_flags ?? 0) & (1 << badge.bit)
  )
  return profile.premium_type
    ? [{ bit: -1, label: "Assinante Nitro", icon: NITRO_BADGE }, ...badges]
    : badges
}

/** The badge row under the username (only what OAuth exposes: flags + Nitro). */
export function ProfileBadges({ profile }: { profile: Profile }) {
  const badges = badgesOf(profile)
  if (badges.length === 0) return null
  return (
    <div className="flex w-fit flex-wrap items-center gap-0.5 rounded-md border border-border px-1 py-0.5">
      {badges.map((badge) => (
        <Tooltip key={badge.bit}>
          <TooltipTrigger
            render={
              <img
                src={`${BADGE_CDN}/${badge.icon}.png`}
                alt={badge.label}
                className="size-5"
                draggable={false}
              />
            }
          />
          <TooltipContent>{badge.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`
}

/**
 * A display name with the user's Discord name style colors (one color or a
 * gradient), unless styles are turned off in accessibility settings.
 */
export function StyledName({
  profile,
  name,
  className,
}: {
  profile: Profile | null | undefined
  name: string
  className?: string
}) {
  const { nameStyles } = useAccessibility()
  const colors = profile?.display_name_styles?.colors ?? []
  if (!nameStyles || colors.length === 0) {
    return <span className={className}>{name}</span>
  }
  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          colors.length === 1
            ? `linear-gradient(${hex(colors[0])}, ${hex(colors[0])})`
            : `linear-gradient(90deg, ${colors.map(hex).join(", ")})`,
      }}
    >
      {name}
    </span>
  )
}

type Service = {
  label: string
  icon: ComponentType<{ className?: string }>
  url?: (c: DiscordConnection) => string
}

const SERVICES: Record<string, Service> = {
  spotify: {
    label: "Spotify",
    icon: SpotifyLogoIcon,
    url: (c) => `https://open.spotify.com/user/${c.id}`,
  },
  github: {
    label: "GitHub",
    icon: GithubLogoIcon,
    url: (c) => `https://github.com/${c.name}`,
  },
  twitch: {
    label: "Twitch",
    icon: TwitchLogoIcon,
    url: (c) => `https://www.twitch.tv/${c.name}`,
  },
  youtube: {
    label: "YouTube",
    icon: YoutubeLogoIcon,
    url: (c) => `https://www.youtube.com/channel/${c.id}`,
  },
  steam: {
    label: "Steam",
    icon: SteamLogoIcon,
    url: (c) => `https://steamcommunity.com/profiles/${c.id}`,
  },
  twitter: {
    label: "X",
    icon: XLogoIcon,
    url: (c) => `https://x.com/${c.name}`,
  },
  reddit: {
    label: "Reddit",
    icon: RedditLogoIcon,
    url: (c) => `https://www.reddit.com/user/${c.name}`,
  },
  instagram: {
    label: "Instagram",
    icon: InstagramLogoIcon,
    url: (c) => `https://www.instagram.com/${c.name}`,
  },
  tiktok: {
    label: "TikTok",
    icon: TiktokLogoIcon,
    url: (c) => `https://www.tiktok.com/@${c.name}`,
  },
  facebook: { label: "Facebook", icon: FacebookLogoIcon },
  bluesky: {
    label: "Bluesky",
    icon: LinkIcon,
    url: (c) => `https://bsky.app/profile/${c.id}`,
  },
}

/** Public connections imported from Discord (needs the connections scope). */
export function ProfileConnections({ profile }: { profile: Profile }) {
  const connections = profile.connections ?? []
  if (connections.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {connections.map((connection) => {
        const service = SERVICES[connection.type]
        const Icon = service?.icon ?? LinkIcon
        const href = service?.url?.(connection)
        const content = (
          <>
            <Icon className="size-6 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1 truncate font-medium text-header">
                {connection.name}
                {connection.verified && (
                  <SealCheckIcon className="size-4 shrink-0 text-primary" />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {service?.label ?? connection.type}
              </span>
            </span>
          </>
        )
        return href ? (
          <a
            key={`${connection.type}:${connection.id}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-md border border-border bg-background p-2 hover:bg-hover"
          >
            {content}
          </a>
        ) : (
          <div
            key={`${connection.type}:${connection.id}`}
            className="flex items-center gap-3 rounded-md border border-border bg-background p-2"
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}
