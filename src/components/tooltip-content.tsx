import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * Discord-style tooltip body: dark popout with an arrow of the same color
 * (the vendor primitive's arrow is always `bg-foreground`).
 */
export function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          className={cn(
            "z-50 w-fit max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-sm font-semibold text-header shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="size-2.5 rotate-45 border-border bg-popover data-[side=bottom]:-top-[5px] data-[side=bottom]:border-t data-[side=bottom]:border-l data-[side=left]:-right-[5px] data-[side=left]:border-t data-[side=left]:border-r data-[side=right]:-left-[5px] data-[side=right]:border-b data-[side=right]:border-l data-[side=top]:-bottom-[5px] data-[side=top]:border-r data-[side=top]:border-b" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}
