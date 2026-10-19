import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { supabase, unwrap } from "@/lib/supabase"

export type FavoriteGif = {
  url: string
  preview: string
  width: number
  height: number
  created_at: string
}

export const favoriteGifsQuery = queryOptions({
  queryKey: ["favorite-gifs"],
  queryFn: async () =>
    unwrap<FavoriteGif[]>(
      await supabase
        .from("favorite_gifs")
        .select("url, preview, width, height, created_at")
        .order("created_at", { ascending: false })
    ),
  staleTime: 5 * 60 * 1000,
})

/** Star/unstar a GIF, like the star on Discord's GIFs. */
export function useFavoriteGif(url: string) {
  const qc = useQueryClient()
  const { data } = useQuery(favoriteGifsQuery)
  const favorite = data?.some((g) => g.url === url) ?? false

  const toggle = async (gif: Omit<FavoriteGif, "created_at">) => {
    const key = favoriteGifsQuery.queryKey
    const previous = qc.getQueryData(key)
    qc.setQueryData(key, (list) =>
      favorite
        ? list?.filter((g) => g.url !== url)
        : [{ ...gif, created_at: new Date().toISOString() }, ...(list ?? [])]
    )
    const { error } = favorite
      ? await supabase.from("favorite_gifs").delete().eq("url", url)
      : await supabase.from("favorite_gifs").insert(gif)
    if (error) {
      qc.setQueryData(key, previous)
      toast.error("Não foi possível atualizar os favoritos.")
    }
  }

  return { favorite, toggle }
}
