import { DiscordLogoIcon, QrCodeIcon } from "@phosphor-icons/react"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { BiscordLogo } from "@/components/biscord-logo"
import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  signInAsGuest,
  signInWithDiscord,
  useAuth,
} from "@/features/auth/auth-provider"
import { isDesktop } from "@/lib/platform"

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: Login,
})

function Login() {
  const { session, loading } = useAuth()
  const { redirect } = Route.useSearch()
  const [pending, setPending] = useState<"discord" | "guest" | null>(null)
  const [guestName, setGuestName] = useState("")

  // only allow in-app redirects
  const target = redirect?.startsWith("/") ? redirect : "/channels/@me"

  if (!loading && session) {
    return <Navigate to={target} replace />
  }

  const login = async () => {
    setPending("discord")
    const { error } = await signInWithDiscord(target)
    if (error) setPending(null)
  }

  const enterAsGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!guestName.trim()) return
    setPending("guest")
    const { error } = await signInAsGuest(guestName)
    if (error) {
      setPending(null)
      toast.error("Não foi possível entrar como convidado.", {
        description: error.message,
      })
    }
  }

  return (
    <main className="flex h-full items-center justify-center bg-primary p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg bg-background p-8 text-center shadow-2xl">
        <span className="flex size-16 items-center justify-center rounded-4xl bg-black text-white">
          <BiscordLogo className="size-10" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-header">
            Que bom te ver de novo!
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre com sua conta do Discord. O Biscord importa seu nome, avatar,
            banner e cores de perfil.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            onClick={login}
            disabled={pending !== null || loading}
          >
            {pending === "discord" ? <Spinner /> : <DiscordLogoIcon />}
            Entrar com Discord
          </Button>
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <QrCodeIcon className="size-4 shrink-0" />
            Sem o Discord logado aqui? A página do Discord mostra um QR code
            para entrar pelo app do celular.
          </p>
        </div>

        <div className="flex w-full items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={enterAsGuest} className="flex w-full flex-col gap-2">
          <label
            htmlFor="guest-name"
            className="text-left text-xs font-bold text-muted-foreground uppercase"
          >
            Entrar como convidado
          </label>
          <div className="flex gap-2">
            <Input
              id="guest-name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Como devemos te chamar?"
              maxLength={32}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={pending !== null || loading || !guestName.trim()}
            >
              {pending === "guest" && <Spinner />}
              Entrar
            </Button>
          </div>
          <p className="text-left text-xs text-muted-foreground">
            Você ganha uma conta normal e pode vincular o Discord depois, nas
            configurações.
          </p>
        </form>

        {!isDesktop && (
          <Link to="/download" className="text-sm text-link hover:underline">
            Baixar o app para desktop
          </Link>
        )}
      </div>
    </main>
  )
}
