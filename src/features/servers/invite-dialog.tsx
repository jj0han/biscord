import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { AppDialogContent } from "@/components/app-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { createInvite, useServer } from "@/features/servers/queries"
import { publicOrigin } from "@/lib/platform"
import type { Channel } from "@/lib/types"

const EXPIRY_OPTIONS = [
  { label: "30 minutos", seconds: 1800 },
  { label: "1 hora", seconds: 3600 },
  { label: "1 dia", seconds: 86400 },
  { label: "7 dias", seconds: 604800 },
  { label: "Nunca", seconds: 0 },
]

type InviteDialogProps = {
  serverId: string
  /** invite straight into this channel (voice: also as a temporary guest) */
  channel?: Channel
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteDialog({
  serverId,
  channel,
  open,
  onOpenChange,
}: InviteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        {open && <InviteContent serverId={serverId} channel={channel} />}
      </AppDialogContent>
    </Dialog>
  )
}

function InviteContent({
  serverId,
  channel,
}: {
  serverId: string
  channel?: Channel
}) {
  const server = useServer(serverId)
  const [expiry, setExpiry] = useState(604800)
  const [temporary, setTemporary] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCode(null)
    setError(false)
    createInvite(serverId, expiry, {
      channelId: channel?.id,
      temporary: temporary && channel?.type === "voice",
    })
      .then((next) => !cancelled && setCode(next))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [serverId, expiry, channel?.id, channel?.type, temporary])

  const link = code ? `${publicOrigin}/invite/${code}` : ""

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-header">
          Convide amigos para {server?.name}
        </DialogTitle>
        <DialogDescription>
          {error
            ? "Você não tem permissão para criar convites neste servidor."
            : temporary
              ? `Quem abrir o link entra só em ${channel?.name} e sai do servidor ao deixar a chamada.`
              : "Envie este link para um amigo entrar no servidor."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase">
          Envie um link de convite para um amigo
        </span>
        <div className="flex gap-2">
          <Input readOnly value={link} placeholder="Gerando…" />
          <Button onClick={copy} disabled={!code}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          O convite expira em
        </span>
        <NativeSelect
          value={String(expiry)}
          onChange={(e) => setExpiry(Number(e.target.value))}
        >
          {EXPIRY_OPTIONS.map((option) => (
            <NativeSelectOption key={option.seconds} value={option.seconds}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {channel?.type === "voice" && (
        <label className="flex items-center justify-between gap-4">
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium text-header">
              Convite de convidado temporário
            </span>
            <span className="text-xs text-muted-foreground">
              A pessoa entra só neste canal de voz, sem virar membro do
              servidor, e é removida quando sai da chamada (a não ser que você
              dê um cargo para ela).
            </span>
          </span>
          <Switch checked={temporary} onCheckedChange={setTemporary} />
        </label>
      )}
    </>
  )
}
