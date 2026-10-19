import { HashIcon, SpeakerHighIcon } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { AppDialogContent } from "@/components/app-dialog"
import { SettingsLabel, SettingsLayout } from "@/components/settings-layout"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UnsavedBar } from "@/components/unsaved-bar"
import {
  createChannel,
  deleteChannel,
  updateChannel,
  useChannels,
} from "@/features/servers/queries"
import { queryKeys } from "@/lib/query-keys"
import type { Channel } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Discord's text channel naming: lowercase, dashes, no spaces. */
export function normalizeChannelName(name: string, type: Channel["type"]) {
  if (type !== "text") return name.slice(0, 100)
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 100)
}

type CreateChannelDialogProps = {
  serverId: string
  parentId: string | null
  kind?: "channel" | "category"
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateChannelDialog({
  serverId,
  parentId,
  kind = "channel",
  open,
  onOpenChange,
}: CreateChannelDialogProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const channels = useChannels(serverId)
  const [type, setType] = useState<"text" | "voice">("text")
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)

  const category = channels?.find((c) => c.id === parentId)
  const finalType = kind === "category" ? "category" : type

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = normalizeChannelName(name.trim(), finalType)
    if (!clean) return
    setPending(true)
    try {
      const siblings = (channels ?? []).filter(
        (c) => c.parent_id === (kind === "category" ? null : parentId)
      )
      const channel = await createChannel({
        serverId,
        type: finalType,
        name: clean,
        parentId: kind === "category" ? null : parentId,
        position: Math.max(-1, ...siblings.map((c) => c.position)) + 1,
      })
      await qc.invalidateQueries({ queryKey: queryKeys.channels(serverId) })
      onOpenChange(false)
      setName("")
      if (channel.type === "text") {
        navigate({
          to: "/channels/$serverId/$channelId",
          params: { serverId, channelId: channel.id },
        })
      }
    } catch {
      toast.error("Você não tem permissão para criar canais.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-xl text-header">
              {kind === "category" ? "Criar categoria" : "Criar canal"}
            </DialogTitle>
            {category && (
              <DialogDescription>em {category.name}</DialogDescription>
            )}
          </DialogHeader>

          {kind === "channel" && (
            <div className="flex flex-col gap-2">
              <SettingsLabel>Tipo de canal</SettingsLabel>
              {(
                [
                  {
                    value: "text",
                    icon: HashIcon,
                    title: "Texto",
                    hint: "Envie mensagens, imagens, GIFs, emojis e opiniões",
                  },
                  {
                    value: "voice",
                    icon: SpeakerHighIcon,
                    title: "Voz",
                    hint: "Converse com voz, vídeo e compartilhamento de tela",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg bg-card p-3 text-left transition-colors hover:bg-hover",
                    type === option.value && "bg-selected"
                  )}
                >
                  <option.icon className="size-6 text-channel-icon" />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="font-medium text-header">
                      {option.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "size-5 rounded-full border-2 border-interactive",
                      type === option.value && "border-6 border-header"
                    )}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <SettingsLabel>
              {kind === "category" ? "Nome da categoria" : "Nome do canal"}
            </SettingsLabel>
            <Input
              value={name}
              onChange={(e) =>
                setName(normalizeChannelName(e.target.value, finalType))
              }
              placeholder={
                kind === "category" ? "Nova categoria" : "novo-canal"
              }
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="link"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {kind === "category" ? "Criar categoria" : "Criar canal"}
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  )
}

type ChannelSettingsDialogProps = {
  channel: Channel
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChannelSettingsDialog({
  channel,
  open,
  onOpenChange,
}: ChannelSettingsDialogProps) {
  if (!open) return null
  return <ChannelSettings channel={channel} onOpenChange={onOpenChange} />
}

function ChannelSettings({
  channel,
  onOpenChange,
}: {
  channel: Channel
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(channel.name ?? "")
  const [topic, setTopic] = useState(channel.topic ?? "")
  const [saving, setSaving] = useState(false)

  const dirty = name !== (channel.name ?? "") || topic !== (channel.topic ?? "")

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: queryKeys.channels(channel.server_id),
    })

  const save = async () => {
    setSaving(true)
    try {
      await updateChannel(channel.id, {
        name: normalizeChannelName(name.trim(), channel.type) || channel.name,
        topic: topic.trim() || null,
      })
      await invalidate()
    } catch {
      toast.error("Não foi possível salvar o canal.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await deleteChannel(channel.id)
      await invalidate()
      onOpenChange(false)
      if (channel.server_id) {
        navigate({
          to: "/channels/$serverId",
          params: { serverId: channel.server_id },
        })
      }
    } catch {
      toast.error("Não foi possível excluir o canal.")
    }
  }

  const label = channel.type === "category" ? "categoria" : "canal"

  return (
    <SettingsLayout
      open
      onOpenChange={onOpenChange}
      active="overview"
      onActiveChange={() => undefined}
      sections={[
        {
          key: "overview",
          label: "Visão geral",
          group:
            channel.type === "text"
              ? `# ${channel.name}`
              : (channel.name ?? ""),
        },
        {
          key: "delete",
          label: `Excluir ${label}`,
          destructive: true,
          onSelect: remove,
        },
      ]}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <SettingsLabel>Nome do {label}</SettingsLabel>
          <Input
            value={name}
            onChange={(e) =>
              setName(normalizeChannelName(e.target.value, channel.type))
            }
          />
        </div>
        {channel.type === "text" && (
          <div className="flex flex-col gap-2">
            <SettingsLabel>Tópico do canal</SettingsLabel>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={1024}
              placeholder="Deixe todos saberem como usar este canal!"
            />
          </div>
        )}
        {dirty && (
          <UnsavedBar
            saving={saving}
            onReset={() => {
              setName(channel.name ?? "")
              setTopic(channel.topic ?? "")
            }}
            onSave={save}
          />
        )}
      </div>
    </SettingsLayout>
  )
}
