import { GifIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase"

export type Gif = {
  id: string
  title: string
  url: string
  width: number
  height: number
  preview: string
  previewWidth: number
  previewHeight: number
}

const PAGE = 30

function gifsQuery(term: string) {
  return infiniteQueryOptions({
    queryKey: ["gifs", term],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.functions.invoke<{ gifs: Gif[] }>(
        "gifs",
        { body: { query: term, offset: pageParam } }
      )
      if (error) throw error
      return data?.gifs ?? []
    },
    getNextPageParam: (last, pages) =>
      last.length < PAGE ? undefined : pages.length * PAGE,
    staleTime: 5 * 60 * 1000,
  })
}

function GifGrid({
  term,
  onPick,
}: {
  term: string
  onPick: (gif: Gif) => void
}) {
  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery(gifsQuery(term))
  const gifs = data?.pages.flat() ?? []

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Não foi possível carregar os GIFs. Confira se a GIPHY_API_KEY está
        configurada nas edge functions.
      </div>
    )
  }
  if (gifs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Nenhum GIF encontrado.
      </div>
    )
  }

  return (
    <div
      className="flex-1 scrollbar-thin overflow-y-auto p-2"
      onScroll={(e) => {
        const el = e.currentTarget
        if (
          hasNextPage &&
          !isFetchingNextPage &&
          el.scrollHeight - el.scrollTop - el.clientHeight < 300
        ) {
          void fetchNextPage()
        }
      }}
    >
      <div className="columns-2 gap-2">
        {gifs.map((gif) => (
          <button
            key={gif.id}
            type="button"
            title={gif.title}
            onClick={() => onPick(gif)}
            className="mb-2 block w-full overflow-hidden rounded-md bg-card ring-primary transition-shadow hover:ring-2"
            style={{
              aspectRatio: `${gif.previewWidth} / ${gif.previewHeight}`,
            }}
          >
            <img
              src={gif.preview}
              alt={gif.title}
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}
    </div>
  )
}

/** Discord's GIF button in the composer, backed by the `gifs` edge function. */
export function GifPicker({ onPick }: { onPick: (gif: Gif) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const term = useDeferredValue(query.trim())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Abrir seletor de GIF"
        className="mt-3 text-interactive transition-colors hover:text-interactive-hover data-popup-open:text-header"
      >
        <GifIcon className="size-6" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={16}
        className="h-110 w-105 gap-0 overflow-hidden rounded-lg border border-border bg-sidebar p-0"
      >
        <div className="border-b border-border p-3">
          <div className="flex h-8 items-center gap-2 rounded-md bg-input px-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar no GIPHY"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <MagnifyingGlassIcon className="size-4 text-interactive" />
          </div>
        </div>
        <GifGrid
          term={term}
          onPick={(gif) => {
            setOpen(false)
            setQuery("")
            onPick(gif)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
