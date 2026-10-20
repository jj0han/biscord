import {
  GifIcon,
  MagnifyingGlassIcon,
  StarIcon,
  TrendUpIcon,
} from "@phosphor-icons/react"
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"

import { Spinner } from "@/components/spinner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  favoriteGifsQuery,
  useFavoriteGif,
} from "@/features/messages/favorite-gifs"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type GiphyGif = {
  id: string
  title: string
  url: string
  width: number
  height: number
  preview: string
  previewWidth: number
  previewHeight: number
}

/** What gets sent when a GIF is picked. */
export type Gif = { url: string; width: number; height: number }

const PAGE = 30

function gifsQuery(term: string) {
  return infiniteQueryOptions({
    queryKey: ["gifs", term],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.functions.invoke<{
        gifs: GiphyGif[]
      }>("gifs", { body: { query: term, offset: pageParam } })
      if (error) throw error
      return data?.gifs ?? []
    },
    getNextPageParam: (last, pages) =>
      last.length < PAGE ? undefined : pages.length * PAGE,
    staleTime: 5 * 60 * 1000,
  })
}

/** Star toggle shown on a GIF (picker tiles and GIFs in chat). */
export function FavoriteStar({
  gif,
  className,
}: {
  gif: { url: string; preview: string; width: number; height: number }
  className?: string
}) {
  const { favorite, toggle } = useFavoriteGif(gif.url)
  return (
    <button
      type="button"
      aria-label={
        favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"
      }
      onClick={(e) => {
        e.stopPropagation()
        void toggle(gif)
      }}
      className={cn(
        "flex size-7 items-center justify-center rounded-md bg-black/60 text-white transition-opacity hover:text-warning",
        favorite ? "text-warning opacity-100" : "opacity-0",
        className
      )}
    >
      <StarIcon weight={favorite ? "fill" : "bold"} className="size-4" />
    </button>
  )
}

type Tile = {
  key: string
  url: string
  preview: string
  width: number
  height: number
  ratio: number
  title: string
}

function TileGrid({
  tiles,
  onPick,
  onScrollEnd,
  footer,
}: {
  tiles: Tile[]
  onPick: (tile: Tile) => void
  onScrollEnd?: () => void
  footer?: React.ReactNode
}) {
  return (
    <div
      className="flex-1 scrollbar-thin overflow-y-auto p-2"
      onScroll={(e) => {
        const el = e.currentTarget
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
          onScrollEnd?.()
        }
      }}
    >
      <div className="columns-2 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="group/gif relative mb-2 overflow-hidden rounded-md bg-card"
            style={{ aspectRatio: tile.ratio }}
          >
            <button
              type="button"
              title={tile.title}
              onClick={() => onPick(tile)}
              className="block size-full ring-primary ring-inset hover:ring-2"
            >
              <img
                src={tile.preview}
                alt={tile.title}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
            <FavoriteStar
              gif={tile}
              className="absolute top-1 right-1 group-hover/gif:opacity-100"
            />
          </div>
        ))}
      </div>
      {footer}
    </div>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function SearchResults({
  term,
  onPick,
}: {
  term: string
  onPick: (tile: Tile) => void
}) {
  const {
    data,
    isPending,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery(gifsQuery(term))

  if (isPending) {
    return (
      <Message>
        <Spinner />
      </Message>
    )
  }
  if (isError) {
    return (
      <Message>
        Não foi possível carregar os GIFs. Confira se a GIPHY_API_KEY está
        configurada nas edge functions.
      </Message>
    )
  }

  const tiles: Tile[] = data.pages.flat().map((gif) => ({
    key: gif.id,
    url: gif.url,
    preview: gif.preview,
    width: gif.width,
    height: gif.height,
    ratio: gif.previewWidth / gif.previewHeight || 1,
    title: gif.title,
  }))
  if (tiles.length === 0) return <Message>Nenhum GIF encontrado.</Message>

  return (
    <TileGrid
      tiles={tiles}
      onPick={onPick}
      onScrollEnd={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
      }}
      footer={
        isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )
      }
    />
  )
}

function Favorites({ onPick }: { onPick: (tile: Tile) => void }) {
  const { data, isPending } = useQuery(favoriteGifsQuery)
  if (isPending) {
    return (
      <Message>
        <Spinner />
      </Message>
    )
  }
  if (!data?.length) {
    return <Message>Clique na estrela de um GIF para salvá-lo aqui.</Message>
  }
  return (
    <TileGrid
      tiles={data.map((gif) => ({
        key: gif.url,
        url: gif.url,
        preview: gif.preview,
        width: gif.width,
        height: gif.height,
        ratio: gif.width && gif.height ? gif.width / gif.height : 1,
        title: "",
      }))}
      onPick={onPick}
    />
  )
}

/** Discord's GIF button in the composer, backed by the `gifs` edge function. */
/** Search, "Em alta" and favorites: shared by the chat picker and profiles. */
export function GifBrowser({ onPick }: { onPick: (gif: Gif) => void }) {
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<"favorites" | "trending">("trending")
  const term = useDeferredValue(query.trim())

  const pick = (tile: Tile) => {
    setQuery("")
    onPick({ url: tile.url, width: tile.width, height: tile.height })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
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
        {!term && (
          <div className="flex gap-1">
            {(
              [
                { key: "favorites", label: "Favoritos", icon: StarIcon },
                { key: "trending", label: "Em alta", icon: TrendUpIcon },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTab(option.key)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-interactive hover:bg-hover hover:text-interactive-hover",
                  tab === option.key && "bg-selected text-header"
                )}
              >
                <option.icon className="size-4" />
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {term || tab === "trending" ? (
        <SearchResults term={term} onPick={pick} />
      ) : (
        <Favorites onPick={pick} />
      )}
    </div>
  )
}

export function GifPicker({ onPick }: { onPick: (gif: Gif) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Abrir seletor de GIF"
        className="mt-4 text-interactive transition-colors hover:text-interactive-hover data-popup-open:text-header"
      >
        <GifIcon className="size-6" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={16}
        className="flex h-110 w-105 max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-lg border border-border bg-sidebar p-0"
      >
        <GifBrowser
          onPick={(gif) => {
            setOpen(false)
            onPick(gif)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
