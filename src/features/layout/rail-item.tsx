import type { ReactNode } from "react"

import { TooltipContent } from "@/components/tooltip-content"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type RailItemProps = {
  label: string
  active?: boolean
  unread?: boolean
  mentions?: number
  /** "brand" = blurple when active (home), "action" = the add-server button */
  tone?: "default" | "brand" | "action"
  /** extra tooltip content under the label (e.g. who's in a call) */
  extra?: ReactNode
  onClick?: () => void
  children: ReactNode
}

/** A 40px squircle in the server rail with Discord's pill indicator. */
export function RailItem({
  label,
  active = false,
  unread = false,
  mentions = 0,
  tone = "default",
  extra,
  onClick,
  children,
}: RailItemProps) {
  return (
    <div className="group/rail relative flex w-full justify-center">
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r-full bg-header transition-all duration-200",
          active
            ? "h-10"
            : unread
              ? "h-2 group-hover/rail:h-5"
              : "h-0 group-hover/rail:h-5"
        )}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={label}
              onClick={onClick}
              className={cn(
                "relative flex size-10 items-center justify-center overflow-hidden rounded-4xl transition-colors",
                tone === "brand" &&
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-header hover:bg-primary hover:text-primary-foreground"),
                tone === "action" &&
                  "bg-card text-interactive hover:bg-primary hover:text-primary-foreground"
              )}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={12}
          className="bg-popover px-3 py-2 text-sm font-semibold text-header"
        >
          <span className="flex flex-col gap-1">
            {label}
            {extra}
          </span>
        </TooltipContent>
      </Tooltip>
      {mentions > 0 && (
        <span className="pointer-events-none absolute right-2.5 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-primary-foreground ring-[3px] ring-rail">
          {mentions > 99 ? "99+" : mentions}
        </span>
      )}
    </div>
  )
}
