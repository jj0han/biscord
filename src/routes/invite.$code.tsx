import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { ServerIcon } from "@/components/server-icon"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/features/auth/auth-provider"
import { SplashScreen } from "@/features/layout/splash-screen"
import { acceptInvite, invitePreviewQuery } from "@/features/servers/queries"
import { queryKeys } from "@/lib/query-keys"

export const Route = createFileRoute("/invite/$code")({
  component: Invite,
})

function Invite() {
  const { code } = Route.useParams()
  const { session, loading } = useAuth()

  if (loading) return <SplashScreen />
  if (!session) {
    return (
      <Navigate to="/login" search={{ redirect: `/invite/${code}` }} replace />
    )
  }
  return <InviteCard code={code} />
}

function InviteCard({ code }: { code: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)

  const { data: invite, isPending } = useQuery(invitePreviewQuery(code))

  const join = async () => {
    if (!invite) return
    setJoining(true)
    try {
      const serverId = invite.is_member
        ? invite.server_id
        : await acceptInvite(code)
      await qc.invalidateQueries({ queryKey: queryKeys.servers })
      navigate({ to: "/channels/$serverId", params: { serverId } })
    } catch {
      toast.error("Não foi possível entrar no servidor.")
      setJoining(false)
    }
  }

  return (
    <main className="flex h-full items-center justify-center bg-primary p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg bg-background p-8 text-center shadow-2xl">
        {isPending ? (
          <Spinner />
        ) : invite ? (
          <>
            <ServerIcon
              name={invite.server_name}
              iconUrl={invite.server_icon_url}
              className="size-16 rounded-2xl text-xl"
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
                {invite.inviter_name} convidou você para entrar em
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-header">
                {invite.server_name}
              </h1>
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="size-2 rounded-full bg-status-offline" />
                {invite.member_count}{" "}
                {invite.member_count === 1 ? "membro" : "membros"}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={join}
              disabled={joining}
            >
              {joining && <Spinner />}
              {invite.is_member ? "Abrir servidor" : "Aceitar convite"}
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-header">
              Convite inválido
            </h1>
            <p className="text-sm text-muted-foreground">
              Este convite pode ter expirado ou você não tem permissão para
              entrar.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate({ to: "/channels/@me" })}
            >
              Voltar ao Biscord
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
