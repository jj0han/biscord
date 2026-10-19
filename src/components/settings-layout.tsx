import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"
import { type ReactNode, useState } from "react"

import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type SettingsSection<K extends string> = {
  key: K
  label: string
  icon?: ReactNode
  group?: string
  destructive?: boolean
  onSelect?: () => void
}

type SettingsLayoutProps<K extends string> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: SettingsSection<K>[]
  active: K
  onActiveChange: (key: K) => void
  /** shown above the search box (e.g. the user card) */
  header?: ReactNode
  children: ReactNode
}

/**
 * Discord's refreshed settings window: a large centered modal with a
 * searchable, grouped nav on the left and the page with its title bar on the
 * right.
 */
export function SettingsLayout<K extends string>({
  open,
  onOpenChange,
  sections,
  active,
  onActiveChange,
  header,
  children,
}: SettingsLayoutProps<K>) {
  const [filter, setFilter] = useState("")

  const visible = sections.filter((s) =>
    s.label.toLowerCase().includes(filter.trim().toLowerCase())
  )
  const groups = visible.reduce<
    { group: string; items: SettingsSection<K>[] }[]
  >((acc, section) => {
    const group = section.group ?? ""
    const last = acc[acc.length - 1]
    if (last && last.group === group) last.items.push(section)
    else acc.push({ group, items: [section] })
    return acc
  }, [])

  const title = sections.find((s) => s.key === active)?.label

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/70 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[min(56rem,calc(100vh-4rem))] w-[min(80rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-background text-sm text-foreground shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <aside className="flex w-60 shrink-0 scrollbar-thin flex-col gap-2 overflow-y-auto border-r border-border bg-sidebar p-3">
            {header}
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-input px-2">
              <MagnifyingGlassIcon className="size-4 text-interactive" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <nav className="flex flex-col gap-1">
              {groups.map(({ group, items }, index) => (
                <div key={index} className="flex flex-col gap-0.5">
                  {index > 0 && <span className="mx-2 my-1 h-px bg-border" />}
                  {group && (
                    <span className="px-2 pt-1 pb-1 text-xs font-semibold text-muted-foreground">
                      {group}
                    </span>
                  )}
                  {items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        item.onSelect
                          ? item.onSelect()
                          : onActiveChange(item.key)
                      }
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-interactive transition-colors hover:bg-hover hover:text-interactive-hover [&_svg]:size-4",
                        active === item.key && "bg-selected text-header",
                        item.destructive && "text-danger hover:text-danger"
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="font-semibold text-header">{title}</span>
              <DialogClose
                aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-md text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
              >
                <XIcon weight="bold" className="size-5" />
              </DialogClose>
            </div>
            <div className="flex-1 scrollbar-thin overflow-y-auto">
              <div className="mx-auto w-full max-w-160 px-8 py-12">
                {children}
              </div>
            </div>
          </main>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

export function SettingsTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-2xl font-semibold tracking-tight text-header">
      {children}
    </h2>
  )
}

export function SettingsLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-bold text-muted-foreground uppercase">
      {children}
    </span>
  )
}
