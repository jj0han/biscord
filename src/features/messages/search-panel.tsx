import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"

import { Spinner } from "@/components/spinner"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { MessagePreview } from "@/features/messages/pins-popover"
import { searchQuery } from "@/features/messages/queries"

export function SearchBox({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex h-6 w-36 items-center gap-1 rounded-sm bg-input px-1.5 transition-all focus-within:w-60">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder="Buscar"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
        >
          <XIcon weight="bold" className="size-4 text-interactive" />
        </button>
      ) : (
        <MagnifyingGlassIcon className="size-4 text-interactive" />
      )}
    </div>
  )
}

/** Results column that replaces the member list while a search is active. */
export function SearchPanel({
  channelIds,
  term,
}: {
  channelIds: string[]
  term: string
}) {
  const { data, isFetching } = useQuery(searchQuery(channelIds, term))

  return (
    <aside className="flex w-105 shrink-0 scrollbar-thin flex-col gap-2 overflow-y-auto border-l border-border bg-sidebar p-4">
      <span className="text-sm font-semibold text-header">
        {isFetching ? "Buscando…" : `${data?.length ?? 0} resultados`}
      </span>
      {isFetching && !data && (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      )}
      {data?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nada encontrado</EmptyTitle>
            <EmptyDescription>Tente outra palavra.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {data?.map((message) => (
        <MessagePreview key={message.id} message={message} />
      ))}
    </aside>
  )
}
