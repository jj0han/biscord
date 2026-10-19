import { DiscordLogoIcon } from "@phosphor-icons/react"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { signInWithDiscord, useAuth } from "@/features/auth/auth-provider"
import { isDesktop } from "@/lib/platform"

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: Login,
})

function Login() {
  const { session, loading } = useAuth()
  const { redirect } = Route.useSearch()
  const [pending, setPending] = useState(false)

  // only allow in-app redirects
  const target = redirect?.startsWith("/") ? redirect : "/channels/@me"

  if (!loading && session) {
    return <Navigate to={target} replace />
  }

  const login = async () => {
    setPending(true)
    const { error } = await signInWithDiscord(target)
    if (error) setPending(false)
  }

  return (
    <main className="flex h-full items-center justify-center bg-primary p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg bg-background p-8 text-center shadow-2xl">
        <img src="/biscord.svg" alt="Biscord" className="size-16" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-header">
            Que bom te ver de novo!
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre com sua conta do Discord. O Biscord importa seu nome, avatar,
            banner e cores de perfil.
          </p>
        </div>
        <Button
          size="lg"
          className="w-full"
          onClick={login}
          disabled={pending || loading}
        >
          {pending ? <Spinner /> : <DiscordLogoIcon />}
          Entrar com Discord
        </Button>
        <p className="text-xs text-muted-foreground">
          O Biscord só lê seu perfil público. Seus servidores e mensagens do
          Discord continuam lá.
        </p>
        {!isDesktop && (
          <Link to="/download" className="text-sm text-link hover:underline">
            Baixar o app para desktop
          </Link>
        )}
      </div>
    </main>
  )
}
