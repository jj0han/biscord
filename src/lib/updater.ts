import { toast } from "sonner"

import { isDesktop } from "@/lib/platform"

const CHECK_EVERY_MS = 30 * 60 * 1000

let offered: string | null = null

/** Asks GitHub Releases for a newer signed build and offers to install it. */
async function checkForUpdates() {
  const { check } = await import("@tauri-apps/plugin-updater")
  const update = await check().catch(() => null)
  if (!update || offered === update.version) return
  offered = update.version

  toast(`Atualização ${update.version} disponível`, {
    description: "Reinicie o Biscord para instalar a nova versão.",
    duration: Infinity,
    action: {
      label: "Atualizar",
      onClick: () => {
        const id = toast.loading("Baixando atualização…")
        void update
          .downloadAndInstall()
          .then(async () => {
            const { relaunch } = await import("@tauri-apps/plugin-process")
            await relaunch()
          })
          .catch((error: unknown) => {
            offered = null
            toast.error("Não foi possível atualizar.", {
              id,
              description: String(error),
            })
          })
      },
    },
  })
}

/** The desktop app updates itself: checks at launch and every half hour. */
export function initUpdater() {
  if (!isDesktop || import.meta.env.DEV) return
  void checkForUpdates()
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}
