import { BellIcon, BellSlashIcon, ListIcon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

import { TooltipContent } from "@/components/tooltip-content"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { setMobileNav } from "@/features/layout/mobile-nav"
import {
  toggleChannelMute,
  useChannelMuted,
} from "@/features/realtime/muted-channels"
import { cn } from "@/lib/utils"

/** The 48px bar at the top of every main view. */
export function ChatHeader({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="z-10 flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-4 shadow-sm max-md:px-2">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setMobileNav(true)}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-interactive hover:bg-hover hover:text-interactive-hover md:hidden"
      >
        <ListIcon weight="bold" className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {actions && (
        <div className="flex shrink-0 items-center gap-4 max-md:gap-3">
          {actions}
        </div>
      )}
    </header>
  )
}

export function HeaderButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "text-interactive transition-colors hover:text-interactive-hover",
              active && "text-header"
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Bell that mutes notifications for one channel. */
export function MuteChannelButton({ channelId }: { channelId: string }) {
  const muted = useChannelMuted(channelId)
  return (
    <HeaderButton
      label={muted ? "Ativar notificações" : "Silenciar canal"}
      active={muted}
      onClick={() => toggleChannelMute(channelId)}
    >
      {muted ? (
        <BellSlashIcon className="size-5" />
      ) : (
        <BellIcon className="size-5" />
      )}
    </HeaderButton>
  )
}
