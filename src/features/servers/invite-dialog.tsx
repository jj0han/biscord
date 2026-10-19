import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { createInvite, useServer } from "@/features/servers/queries"

const EXPIRY_OPTIONS = [
  { label: "30 minutos", seconds: 1800 },
  { label: "1 hora", seconds: 3600 },
  { label: "1 dia", seconds: 86400 },
  { label: "7 dias", seconds: 604800 },
  { label: "Nunca", seconds: 0 },
]

type InviteDialogProps = {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteDialog({
  serverId,
  open,
  onOpenChange,
}: InviteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <InviteContent serverId={serverId} />}
      </DialogContent>
    </Dialog>
  )
}

function InviteContent({ serverId }: { serverId: string }) {
  const server = useServer(serverId)
  const [expiry, setExpiry] = useState(604800)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCode(null)
    setError(false)
    createInvite(serverId, expiry)
      .then((next) => !cancelled && setCode(next))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [serverId, expiry])

  const link = code ? `${window.location.origin}/invite/${code}` : ""

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
    </>
  )
}
