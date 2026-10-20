import { useLocalParticipant } from "@livekit/components-react"
import { LockSimpleIcon, MicrophoneSlashIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"

import { AppDialogContent } from "@/components/app-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { isDesktop } from "@/lib/platform"
import { createStore } from "@/lib/store"

/** Set when the browser refused the microphone (by the user or a policy). */
export const micBlockedStore = createStore(false)

async function microphoneState() {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    })
    return status
  } catch {
    return null // Firefox/Safari may not support querying it
  }
}

/**
 * Browsers never ask again once the microphone was blocked, so every time we
 * join a call while it's blocked we explain how to unblock it, and retry as
 * soon as the permission flips (or the user clicks "Tentar de novo").
 */
export function MicPermissionGuard({
  connected,
  micEnabled,
}: {
  connected: boolean
  micEnabled: boolean
}) {
  const blocked = micBlockedStore.useStore((value) => value)
  const { localParticipant } = useLocalParticipant()
  const [retrying, setRetrying] = useState(false)

  // check on every join
  useEffect(() => {
    if (!connected || isDesktop) return
    let status: PermissionStatus | null = null
    const sync = () => micBlockedStore.set(status?.state === "denied")
    void microphoneState().then((result) => {
      status = result
      sync()
      status?.addEventListener("change", sync)
    })
    return () => status?.removeEventListener("change", sync)
  }, [connected])

  // unblocked (from the address bar or the retry): turn the mic back on if
  // it's supposed to be open right now (not muted, push-to-talk held…)
  const wasBlocked = useRef(blocked)
  useEffect(() => {
    const unblocked = wasBlocked.current && !blocked
    wasBlocked.current = blocked
    if (!connected || !unblocked || !micEnabled) return
    void localParticipant.setMicrophoneEnabled(true).catch(() => undefined)
  }, [connected, blocked, micEnabled, localParticipant])

  const retry = async () => {
    setRetrying(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      micBlockedStore.set(false)
    } catch {
      micBlockedStore.set(true)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Dialog
      open={connected && blocked}
      onOpenChange={(open) => !open && micBlockedStore.set(false)}
    >
      <AppDialogContent className="sm:max-w-110">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MicrophoneSlashIcon className="size-5 text-danger" />
            Microfone bloqueado
          </DialogTitle>
          <DialogDescription>
            O navegador está bloqueando o microfone para o Biscord, então
            ninguém na chamada consegue te ouvir.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>
            Clique no ícone{" "}
            <LockSimpleIcon className="inline size-4 align-text-bottom" /> ao
            lado do endereço do site.
          </li>
          <li>
            Em <strong className="text-header">Microfone</strong>, escolha{" "}
            <strong className="text-header">Permitir</strong>.
          </li>
          <li>Volte aqui e clique em "Tentar de novo".</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          No app desktop do Biscord o microfone é liberado automaticamente.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => micBlockedStore.set(false)}>
            Agora não
          </Button>
          <Button onClick={retry} disabled={retrying}>
            Tentar de novo
          </Button>
        </div>
      </AppDialogContent>
    </Dialog>
  )
}
