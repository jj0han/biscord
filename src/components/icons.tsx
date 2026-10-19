import { HeadphonesIcon, type IconProps } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/** Headphones with Discord's red "deafened" slash (Phosphor has no slashed variant). */
export function HeadphonesSlashIcon({ className, ...props }: IconProps) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <HeadphonesIcon {...props} className="size-full" />
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <line
          x1="3"
          y1="3"
          x2="21"
          y2="21"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
