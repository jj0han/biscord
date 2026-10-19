import {
  AppleLogoIcon,
  DownloadSimpleIcon,
  LinuxLogoIcon,
  WindowsLogoIcon,
} from "@phosphor-icons/react"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

import { BiscordLogo } from "@/components/biscord-logo"
import { buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { env } from "@/config/env"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/download")({
  component: Download,
})

type Asset = { name: string; browser_download_url: string; size: number }
type Release = { tag_name: string; html_url: string; assets: Asset[] }

const releaseQuery = queryOptions({
  queryKey: ["latest-release", env.VITE_GITHUB_REPO],
  queryFn: async () => {
    const res = await fetch(
      `https://api.github.com/repos/${env.VITE_GITHUB_REPO}/releases/latest`
    )
    if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`)
    return (await res.json()) as Release
  },
  staleTime: 5 * 60 * 1000,
  retry: false,
})

const PLATFORMS = [
  {
    key: "windows",
    label: "Windows",
    icon: WindowsLogoIcon,
    match: (name: string) => name.endsWith("-setup.exe"),
  },
  {
    key: "mac",
    label: "macOS",
    icon: AppleLogoIcon,
    match: (name: string) => name.endsWith(".dmg"),
  },
  {
    key: "linux",
    label: "Linux",
    icon: LinuxLogoIcon,
    match: (name: string) => name.endsWith(".AppImage"),
  },
] as const

function currentPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("win")) return "windows"
  if (ua.includes("mac")) return "mac"
  return "linux"
}

function Download() {
  const { data, isPending, isError } = useQuery(releaseQuery)
  const mine = currentPlatform()
  const options = PLATFORMS.map((platform) => ({
    ...platform,
    asset: data?.assets.find((a) => platform.match(a.name)),
  })).sort((a, b) => Number(b.key === mine) - Number(a.key === mine))

  return (
    <main className="flex h-full items-center justify-center bg-primary p-4">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 rounded-lg bg-background p-8 text-center shadow-2xl">
        <span className="flex size-16 items-center justify-center rounded-4xl bg-primary text-primary-foreground">
          <BiscordLogo className="size-8" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-header">
            Baixe o Biscord
          </h1>
          <p className="text-sm text-muted-foreground">
            O app para desktop tem notificações nativas e janela própria. Também
            dá para usar direto no navegador.
          </p>
        </div>

        {isPending ? (
          <Spinner />
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há uma versão publicada.
          </p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {options.map(({ key, label, icon: Icon, asset }) =>
              asset ? (
                <a
                  key={key}
                  href={asset.browser_download_url}
                  className={cn(
                    buttonVariants({
                      size: "lg",
                      variant: key === mine ? "default" : "secondary",
                    }),
                    "w-full justify-between"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-5" />
                    {label}
                  </span>
                  <span className="flex items-center gap-2 text-xs opacity-80">
                    {formatBytes(asset.size)}
                    <DownloadSimpleIcon className="size-4" />
                  </span>
                </a>
              ) : null
            )}
            <span className="text-xs text-muted-foreground">
              Versão {data.tag_name}
            </span>
          </div>
        )}

        <Link to="/login" className="text-sm text-link hover:underline">
          Abrir no navegador
        </Link>
      </div>
    </main>
  )
}
