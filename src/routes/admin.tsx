import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { UserAvatar } from "@/components/user-avatar"
import {
  appSettingsQuery,
  isAppAdminQuery,
  saveStreamOptions,
  type StreamFrameRate,
  type StreamOptions,
  type StreamResolution,
  voiceStatusQuery,
  voiceUsageQuery,
} from "@/features/admin/queries"
import { useAuth } from "@/features/auth/auth-provider"
import { SplashScreen } from "@/features/layout/splash-screen"
import { useProfile } from "@/features/profiles/queries"
import { displayName, formatBytes } from "@/lib/format"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
})

/** LiveKit Cloud's free ("Build") plan allowance per calendar month. */
const FREE_MINUTES = 5000
const FREE_BYTES = 50 * 1024 ** 3

function AdminRoute() {
  const { session, loading } = useAuth()
  const { data: isAdmin, isPending } = useQuery({
    ...isAppAdminQuery,
    enabled: !!session,
  })

  if (loading || (session && isPending)) return <SplashScreen />
  if (!session) {
    return <Navigate to="/login" search={{ redirect: "/admin" }} replace />
  }
  if (!isAdmin) return <Navigate to="/channels/@me" replace />
  return <AdminPage />
}

function Card({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-6",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-header">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function Meter({
  label,
  value,
  max,
  format,
}: {
  label: string
  value: number
  max: number
  format: (n: number) => string
}) {
  const ratio = Math.min(1, value / max)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium text-header">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {format(value)} de {format(max)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-input">
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width]",
            ratio > 0.8 && "bg-warning",
            ratio >= 1 && "bg-danger"
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}

const minutes = (seconds: number) =>
  `${Math.round(seconds / 60).toLocaleString("pt-BR")} min`

function VoiceServerCard() {
  const { data, isPending, refetch, isFetching } = useQuery(voiceStatusQuery)

  return (
    <Card
      title="Servidor de voz"
      description="Se o LiveKit está aceitando conexões agora e quais salas estão ativas."
    >
      {isPending ? (
        <Spinner />
      ) : !data ? (
        <span className="text-sm text-danger">
          Não foi possível consultar o LiveKit.
        </span>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-3 rounded-full",
                data.accepting ? "bg-success" : "bg-danger"
              )}
            />
            <span className="font-medium text-header">
              {data.accepting
                ? "Aceitando conexões"
                : `Recusando conexões (HTTP ${data.status})`}
            </span>
          </div>
          {data.message && (
            <p className="rounded-md bg-background p-3 font-mono text-xs">
              {data.message}
            </p>
          )}
          {!data.accepting && data.status === 429 && (
            <p className="text-sm text-muted-foreground">
              O limite mensal do plano gratuito acabou. Ele volta no dia 1º do
              próximo mês, ou antes se você mudar de plano no LiveKit.
            </p>
          )}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-header">
              Salas ativas: {data.rooms.length}
            </span>
            {data.rooms.map((room) => (
              <span key={room.name} className="text-muted-foreground">
                {room.name} — {room.participants}{" "}
                {room.participants === 1 ? "pessoa" : "pessoas"}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching && <Spinner />}
          Atualizar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          render={
            <a
              href="https://cloud.livekit.io"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Painel do LiveKit
          <ArrowSquareOutIcon />
        </Button>
      </div>
    </Card>
  )
}

function UserRow({
  userId,
  seconds,
  bytes,
}: {
  userId: string
  seconds: number
  bytes: number
}) {
  const profile = useProfile(userId)
  return (
    <tr className="border-t border-border">
      <td className="py-2">
        <span className="flex items-center gap-2">
          <UserAvatar profile={profile ?? null} size="sm" />
          <span className="truncate text-header">{displayName(profile)}</span>
        </span>
      </td>
      <td className="py-2 text-right tabular-nums">{minutes(seconds)}</td>
      <td className="py-2 text-right tabular-nums">{formatBytes(bytes)}</td>
    </tr>
  )
}

function UsageCard() {
  const [offset, setOffset] = useState(0)
  const now = new Date()
  const month = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`
  const { data, isPending } = useQuery(voiceUsageQuery(key))
  const monthName = month.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })
  const label = monthName.charAt(0).toUpperCase() + monthName.slice(1)
  const maxDay = Math.max(1, ...(data?.days ?? []).map((d) => d.bytes))

  return (
    <Card
      title="Uso do mês"
      description={
        <>
          Medido pelo próprio Biscord (tempo em chamada e dados recebidos por
          cada pessoa), comparado ao plano gratuito do LiveKit. O LiveKit pode
          contar um pouco diferente; os números oficiais ficam no painel dele. A
          medição começou com esta versão.
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOffset((n) => n + 1)}
        >
          Mês anterior
        </Button>
        <span className="flex-1 text-center font-medium text-header">
          {label}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 1))}
        >
          Próximo mês
        </Button>
      </div>

      {isPending || !data ? (
        <Spinner />
      ) : (
        <>
          <Meter
            label="Minutos de participante"
            value={data.seconds / 60}
            max={FREE_MINUTES}
            format={(n) => `${Math.round(n).toLocaleString("pt-BR")} min`}
          />
          <Meter
            label="Dados enviados às pessoas"
            value={data.bytes}
            max={FREE_BYTES}
            format={formatBytes}
          />

          {data.days.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-header">
                Dados por dia
              </span>
              <div className="flex h-32 items-end gap-1">
                {data.days.map((day) => (
                  <div
                    key={day.day}
                    title={`${day.day}: ${formatBytes(day.bytes)} · ${minutes(day.seconds)}`}
                    className="min-w-1 flex-1 rounded-t-sm bg-primary"
                    style={{
                      height: `${Math.max(2, (day.bytes / maxDay) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {data.users.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase">
                  <th className="pb-2 text-left font-semibold">Pessoa</th>
                  <th className="pb-2 text-right font-semibold">Tempo</th>
                  <th className="pb-2 text-right font-semibold">Dados</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <UserRow
                    key={user.user_id}
                    userId={user.user_id}
                    seconds={user.seconds}
                    bytes={user.bytes}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <span className="text-sm text-muted-foreground">
              Nenhuma chamada registrada neste mês.
            </span>
          )}
        </>
      )}
    </Card>
  )
}

const RESOLUTION_OPTIONS: { value: StreamResolution; label: string }[] = [
  { value: "720", label: "720p" },
  { value: "1080", label: "1080p" },
  { value: "1440", label: "1440p" },
]
const FRAME_RATE_OPTIONS: StreamFrameRate[] = [15, 30, 60]

function StreamOptionsCard() {
  const qc = useQueryClient()
  const { data } = useQuery(appSettingsQuery)
  const [draft, setDraft] = useState<StreamOptions | null>(null)
  const [saving, setSaving] = useState(false)
  const current = draft ?? data?.streamOptions
  if (!current) return null

  const toggle = <T,>(list: T[], value: T, on: boolean) =>
    on ? [...list, value] : list.filter((item) => item !== value)

  const save = async () => {
    setSaving(true)
    try {
      await saveStreamOptions(current)
      await qc.invalidateQueries({ queryKey: queryKeys.appSettings })
      setDraft(null)
      toast.success("Opções de transmissão salvas.")
    } catch {
      toast.error("Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  const invalid =
    current.resolutions.length === 0 || current.frameRates.length === 0

  return (
    <Card
      title="Opções de transmissão"
      description="O que aparece para todo mundo no menu Transmitir tela. Qualidades mais altas gastam bem mais dados do plano."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-muted-foreground uppercase">
            Resoluções
          </span>
          {RESOLUTION_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-3 text-sm"
            >
              <Checkbox
                checked={current.resolutions.includes(option.value)}
                onCheckedChange={(on) =>
                  setDraft({
                    ...current,
                    resolutions: toggle(
                      current.resolutions,
                      option.value,
                      !!on
                    ),
                  })
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-muted-foreground uppercase">
            Taxas de quadros
          </span>
          {FRAME_RATE_OPTIONS.map((fps) => (
            <label key={fps} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={current.frameRates.includes(fps)}
                onCheckedChange={(on) =>
                  setDraft({
                    ...current,
                    frameRates: toggle(current.frameRates, fps, !!on),
                  })
                }
              />
              {fps} FPS
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span className="flex flex-col gap-1">
          <span className="font-medium text-header">
            Permitir áudio nas transmissões
          </span>
          <span className="text-xs text-muted-foreground">
            Desligado, as transmissões vão só com vídeo.
          </span>
        </span>
        <Switch
          checked={current.audio}
          onCheckedChange={(audio) => setDraft({ ...current, audio })}
        />
      </label>
      {invalid && (
        <span className="text-sm text-danger">
          Deixe pelo menos uma resolução e uma taxa de quadros.
        </span>
      )}
      <div className="flex justify-end gap-2">
        {draft && (
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Descartar
          </Button>
        )}
        <Button
          disabled={!draft || invalid || saving}
          onClick={() => void save()}
        >
          {saving && <Spinner />}
          Salvar
        </Button>
      </div>
    </Card>
  )
}

function AdminPage() {
  return (
    <main className="h-full scrollbar-thin overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-200 flex-col gap-6 px-4 py-8 md:px-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar ao Biscord"
            render={<Link to="/channels/@me" />}
          >
            <ArrowLeftIcon weight="bold" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-header">
            Painel do Biscord
          </h1>
        </div>
        <VoiceServerCard />
        <UsageCard />
        <StreamOptionsCard />
      </div>
    </main>
  )
}
