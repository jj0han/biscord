import { CaretRightIcon } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { AppDialogContent } from "@/components/app-dialog"
import { ImagePicker } from "@/components/image-picker"
import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useUserId } from "@/features/auth/auth-provider"
import { useProfile } from "@/features/profiles/queries"
import { createServer, uploadFile } from "@/features/servers/queries"
import { displayName } from "@/lib/format"
import { publicOrigin } from "@/lib/platform"
import { queryKeys } from "@/lib/query-keys"

type Step = "choose" | "create" | "join"

type AddServerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddServerDialog({ open, onOpenChange }: AddServerDialogProps) {
  const [step, setStep] = useState<Step>("choose")

  const change = (next: boolean) => {
    onOpenChange(next)
    if (!next) setTimeout(() => setStep("choose"), 200)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <AppDialogContent className="sm:max-w-110">
        {step === "choose" && <ChooseStep onPick={setStep} />}
        {step === "create" && (
          <CreateStep
            onBack={() => setStep("choose")}
            onDone={() => change(false)}
          />
        )}
        {step === "join" && (
          <JoinStep
            onBack={() => setStep("choose")}
            onDone={() => change(false)}
          />
        )}
      </AppDialogContent>
    </Dialog>
  )
}

function ChooseStep({ onPick }: { onPick: (step: Step) => void }) {
  return (
    <>
      <DialogHeader className="items-center text-center">
        <DialogTitle className="text-2xl font-bold text-header">
          Crie o seu servidor
        </DialogTitle>
        <DialogDescription>
          Seu servidor é onde você e seus amigos se encontram. Crie o seu e
          comece a conversar.
        </DialogDescription>
      </DialogHeader>
      <button
        type="button"
        onClick={() => onPick("create")}
        className="flex items-center gap-3 rounded-lg border border-border p-3 text-left font-semibold text-header transition-colors hover:bg-hover"
      >
        <img src="/biscord.svg" alt="" className="size-10" />
        <span className="flex-1">Criar o meu</span>
        <CaretRightIcon className="size-5 text-interactive" />
      </button>
      <div className="flex flex-col items-center gap-2">
        <span className="text-lg font-semibold text-header">
          Já tem um convite?
        </span>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => onPick("join")}
        >
          Entrar em um servidor
        </Button>
      </div>
    </>
  )
}

function CreateStep({
  onBack,
  onDone,
}: {
  onBack: () => void
  onDone: () => void
}) {
  const userId = useUserId()
  const me = useProfile(userId)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(`Servidor de ${displayName(me)}`)
  const [icon, setIcon] = useState<File | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return
    setPending(true)
    try {
      const iconUrl = icon ? await uploadFile("icons", userId, icon) : null
      const serverId = await createServer(name.trim(), iconUrl)
      await qc.invalidateQueries({ queryKey: queryKeys.servers })
      onDone()
      navigate({ to: "/channels/$serverId", params: { serverId } })
    } catch {
      toast.error("Não foi possível criar o servidor.")
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <DialogHeader className="items-center text-center">
        <DialogTitle className="text-2xl font-bold text-header">
          Personalize o seu servidor
        </DialogTitle>
        <DialogDescription>
          Deixe o seu novo servidor com a sua cara, com um nome e um ícone. Você
          pode mudar isso depois.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center">
        <ImagePicker value={icon} onChange={setIcon} />
      </div>
      <Field>
        <FieldLabel
          htmlFor="server-name"
          className="text-xs font-bold uppercase"
        >
          Nome do servidor
        </FieldLabel>
        <Input
          id="server-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
        />
      </Field>
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="link" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending || name.trim().length < 2}>
          {pending && <Spinner />}
          Criar
        </Button>
      </DialogFooter>
    </form>
  )
}

function JoinStep({
  onBack,
  onDone,
}: {
  onBack: () => void
  onDone: () => void
}) {
  const navigate = useNavigate()
  const [value, setValue] = useState("")

  const code = value.trim().split("/").filter(Boolean).pop() ?? ""

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) return
    onDone()
    navigate({ to: "/invite/$code", params: { code } })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <DialogHeader className="items-center text-center">
        <DialogTitle className="text-2xl font-bold text-header">
          Entrar em um servidor
        </DialogTitle>
        <DialogDescription>
          Insira um convite abaixo para entrar em um servidor existente.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="invite" className="text-xs font-bold uppercase">
          Link de convite
        </FieldLabel>
        <Input
          id="invite"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${publicOrigin}/invite/hTKzmak`}
          autoFocus
        />
      </Field>
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="link" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={!code}>
          Entrar no servidor
        </Button>
      </DialogFooter>
    </form>
  )
}
