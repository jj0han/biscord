import { useEffect, useState } from "react"

import { Switch } from "@/components/ui/switch"
import { isDesktop } from "@/lib/platform"
import { createStore } from "@/lib/store"

const CLOSE_TO_TRAY_KEY = "desktop:close-to-tray"

function loadCloseToTray() {
  try {
    // on by default, like Discord's "Minimizar para a bandeja"
    return localStorage.getItem(CLOSE_TO_TRAY_KEY) !== "false"
  } catch {
    return true
  }
}

const closeToTrayStore = createStore(loadCloseToTray())

function applyCloseToTray(enabled: boolean) {
  void import("@tauri-apps/api/core").then(({ invoke }) =>
    invoke("set_close_to_tray", { enabled }).catch(() => undefined)
  )
}

function setCloseToTray(enabled: boolean) {
  closeToTrayStore.set(enabled)
  applyCloseToTray(enabled)
  try {
    localStorage.setItem(CLOSE_TO_TRAY_KEY, String(enabled))
  } catch {
    // preference only
  }
}

/** Sends the saved tray preference to the native side at launch. */
export function initDesktopSettings() {
  if (isDesktop) applyCloseToTray(closeToTrayStore.get())
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-1">
        <span className="font-medium text-header">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  )
}

/** Discord's "Configurações do Windows": launch at startup and tray. */
export function SystemSection() {
  const closeToTray = closeToTrayStore.useStore((value) => value)
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    void import("@tauri-apps/plugin-autostart").then(({ isEnabled }) =>
      isEnabled()
        .then(setAutostart)
        .catch(() => setAutostart(false))
    )
  }, [])

  const toggleAutostart = async (enabled: boolean) => {
    const { enable, disable } = await import("@tauri-apps/plugin-autostart")
    await (enabled ? enable() : disable()).catch(() => undefined)
    setAutostart(enabled)
  }

  return (
    <div className="flex flex-col gap-6">
      <ToggleRow
        title="Abrir o Biscord ao iniciar o computador"
        description="O Biscord abre sozinho, direto na bandeja do sistema, quando você liga o computador."
        checked={!!autostart}
        disabled={autostart === null}
        onChange={(enabled) => void toggleAutostart(enabled)}
      />
      <ToggleRow
        title="Fechar para a bandeja do sistema"
        description="Ao fechar a janela, o Biscord continua rodando na bandeja (perto do relógio) para você seguir em chamadas e receber notificações."
        checked={closeToTray}
        onChange={setCloseToTray}
      />
    </div>
  )
}
