import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { ServerIcon } from "@/components/server-icon"
import { Spinner } from "@/components/spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { isGuest, useAuth } from "@/features/auth/auth-provider"
import {
  botInviteUrl,
  type DiscordGuild,
  discordGuildsQuery,
  DiscordImportError,
  importDiscordServer,
  runDiscordImport,
} from "@/features/discord/queries"
import { queryKeys } from "@/lib/query-keys"

const HISTORY_OPTIONS = [
  { label: "Nenhuma mensagem", value: 0 },
  { label: "Últimas 100 por canal", value: 100 },
  { label: "Últimas 500 por canal", value: 500 },
  { label: "Últimas 1000 por canal", value: 1000 },
  { label: "Todo o histórico", value: -1 },
]

/** "Importar do Discord" in the add server dialog. */
export function DiscordImportStep({
  onBack,
  onDone,
}: {
  onBack: () => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const guest = isGuest(useAuth().session)
  const { data, error, isPending, isFetching, refetch } = useQuery({
    ...discordGuildsQuery,
    enabled: !guest,
  })
  const [selected, setSelected] = useState<DiscordGuild | null>(null)
  const [history, setHistory] = useState(500)
  const [sync, setSync] = useState(true)
  const [pending, setPending] = useState(false)
  const [duplicate, setDuplicate] = useState<{
    serverId: string | null
  } | null>(null)

  const openServer = (serverId: string) => {
    onDone()
    navigate({ to: "/channels/$serverId", params: { serverId } })
  }

  const pick = (guild: DiscordGuild) => {
    if (guild.importedServerId) {
      setDuplicate({ serverId: guild.importedServerId })
      return
    }
    setSelected(guild)
  }

  const submit = async () => {
    if (!selected) return
    setPending(true)
    try {
      const result = await importDiscordServer({
        guildId: selected.id,
        historyLimit: history,
        sync,
      })
      await qc.invalidateQueries({ queryKey: queryKeys.servers })
      await qc.invalidateQueries({ queryKey: queryKeys.discordGuilds })
      if (result.warning) toast.warning(result.warning)
      toast.success(`${selected.name} foi importado.`, {
        description:
          history === 0
            ? undefined
            : "O histórico de mensagens continua chegando em segundo plano.",
      })
      void runDiscordImport(qc, result.serverId)
      openServer(result.serverId)
    } catch (e) {
      setPending(false)
      if (e instanceof DiscordImportError && e.message === "already_imported") {
        setDuplicate({ serverId: e.serverId })
        return
      }
      toast.error("Não foi possível importar o servidor.", {
        description: (e as Error).message,
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <DialogHeader className="items-center text-center">
        <DialogTitle className="text-2xl font-bold text-header">
          Importar do Discord
        </DialogTitle>
        <DialogDescription>
          Copia canais, cargos, membros que usam o Biscord e o histórico de
          mensagens. Só o dono ou administradores do servidor no Discord podem
          importá-lo.
        </DialogDescription>
      </DialogHeader>

      {guest ? (
        <p className="text-center text-sm text-muted-foreground">
          Vincule sua conta do Discord nas configurações para importar um
          servidor.
        </p>
      ) : isPending ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : error ? (
        <p className="text-center text-sm text-danger">{error.message}</p>
      ) : selected ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-card p-3">
            <ServerIcon
              name={selected.name}
              iconUrl={selected.iconUrl}
              className="size-10 rounded-xl text-sm"
            />
            <span className="flex-1 truncate font-semibold text-header">
              {selected.name}
            </span>
            <Button variant="link" size="sm" onClick={() => setSelected(null)}>
              Trocar
            </Button>
          </div>
          <Field>
            <FieldLabel className="text-xs font-bold uppercase">
              Histórico de mensagens
            </FieldLabel>
            <NativeSelect
              value={String(history)}
              onChange={(e) => setHistory(Number(e.target.value))}
              className="w-full"
            >
              {HISTORY_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col gap-1">
              <span className="font-medium text-header">
                Manter em sincronia com o Discord
              </span>
              <span className="text-xs text-muted-foreground">
                Mensagens, canais, cargos e membros novos do Discord chegam aqui
                a cada poucos minutos. O que muda no Biscord não volta para o
                Discord.
              </span>
            </span>
            <Switch checked={sync} onCheckedChange={setSync} />
          </label>
          <p className="text-xs text-muted-foreground">
            Canais privados no Discord (ocultos para @everyone) não são
            importados.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(!data.intents.members || !data.intents.content) && (
            <p className="flex gap-2 rounded-md bg-warning/15 p-2 text-xs text-header">
              <WarningIcon className="size-4 shrink-0 text-warning" />
              No portal do Discord, ative no bot os intents{" "}
              {[
                !data.intents.members && "Server Members",
                !data.intents.content && "Message Content",
              ]
                .filter(Boolean)
                .join(" e ")}
              , ou membros e mensagens não vêm junto.
            </p>
          )}
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {data.guilds.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                O bot do Biscord ainda não está em nenhum servidor seu.
              </p>
            )}
            {data.guilds.map((guild) => (
              <button
                key={guild.id}
                type="button"
                disabled={!guild.canImport}
                onClick={() => pick(guild)}
                className="flex items-center gap-3 rounded-lg p-2 text-left transition-colors not-disabled:hover:bg-hover disabled:opacity-50"
              >
                <ServerIcon
                  name={guild.name}
                  iconUrl={guild.iconUrl}
                  className="size-10 rounded-xl text-sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-header">
                    {guild.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {guild.importedServerId
                      ? "Já importado"
                      : guild.canImport
                        ? "Pronto para importar"
                        : "Você não é dono nem administrador"}
                  </span>
                </span>
                {guild.canImport && (
                  <CaretRightIcon className="size-5 text-interactive" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <a
              href={botInviteUrl(data.applicationId)}
              target="_blank"
              rel="noreferrer"
              className="text-link hover:underline"
            >
              Adicionar o bot a um servidor
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? <Spinner /> : <ArrowClockwiseIcon />}
              Atualizar
            </Button>
          </div>
        </div>
      )}

      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="link" onClick={onBack}>
          Voltar
        </Button>
        {selected && (
          <Button onClick={submit} disabled={pending}>
            {pending && <Spinner />}
            Importar
          </Button>
        )}
      </DialogFooter>

      <AlertDialog
        open={duplicate !== null}
        onOpenChange={(open) => !open && setDuplicate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Servidor já importado</AlertDialogTitle>
            <AlertDialogDescription>
              Este servidor do Discord já foi importado para o Biscord. Cada
              servidor do Discord só pode ser importado uma vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            {duplicate?.serverId && (
              <AlertDialogAction
                onClick={() => openServer(duplicate.serverId!)}
              >
                Abrir servidor
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
