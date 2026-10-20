import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { SettingsLabel } from "@/components/settings-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UnsavedBar } from "@/components/unsaved-bar"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { ProfileBadges, StyledName } from "@/features/profiles/discord-extras"
import { GuildTag } from "@/features/profiles/profile-popover"
import {
  type ProfilePatch,
  updateMyProfile,
  useProfile,
} from "@/features/profiles/queries"
import { uploadFile } from "@/features/servers/queries"
import {
  ProfileImageDialog,
  type ProfileImageKind,
} from "@/features/settings/profile-image-dialog"
import { displayName } from "@/lib/format"
import { queryKeys } from "@/lib/query-keys"
import type { Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

type NameStyle = "default" | "solid" | "gradient"

type Draft = {
  displayName: string
  avatarUrl: string | null
  avatarFile: File | null
  bannerUrl: string | null
  bannerFile: File | null
  bannerColor: string
  nameStyle: NameStyle
  nameColors: [string, string]
  bio: string
}

const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`
const toInt = (hex: string) => parseInt(hex.slice(1), 16)

function draftOf(profile: Profile): Draft {
  const colors = profile.display_name_styles?.colors ?? []
  return {
    displayName: profile.display_name ?? "",
    avatarUrl: profile.avatar_url,
    avatarFile: null,
    bannerUrl: profile.banner_url,
    bannerFile: null,
    bannerColor:
      profile.banner_color ??
      (profile.accent_color ? toHex(profile.accent_color) : "#5865f2"),
    nameStyle:
      colors.length > 1
        ? "gradient"
        : colors.length === 1
          ? "solid"
          : "default",
    nameColors: [
      colors[0] !== undefined ? toHex(colors[0]) : "#f2c94c",
      colors[1] !== undefined ? toHex(colors[1]) : "#eb459e",
    ],
    bio: profile.bio ?? "",
  }
}

function nameStylesOf(draft: Draft, profile: Profile) {
  if (draft.nameStyle === "default") return null
  const colors =
    draft.nameStyle === "solid"
      ? [toInt(draft.nameColors[0])]
      : draft.nameColors.map(toInt)
  return {
    font_id: profile.display_name_styles?.font_id ?? 0,
    effect_id: profile.display_name_styles?.effect_id ?? 0,
    colors,
  }
}

/** Object URL for a picked file, revoked when it changes. */
function useFileUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

function ColorSwatch({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <label
      className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
      style={{ backgroundColor: value }}
      aria-label={label}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-6">
      <SettingsLabel>{label}</SettingsLabel>
      {children}
    </div>
  )
}

/** Live preview of the profile card with the unsaved changes. */
function Preview({
  profile,
  draft,
  avatar,
  banner,
}: {
  profile: Profile
  draft: Draft
  avatar: string | null
  banner: string | null
}) {
  const shown: Profile = {
    ...profile,
    display_name: draft.displayName || null,
    avatar_url: avatar,
    display_name_styles: nameStylesOf(draft, profile),
  }
  return (
    <div className="w-75 shrink-0 overflow-hidden rounded-xl border border-border bg-popover">
      {banner ? (
        <img src={banner} alt="" className="h-26 w-full object-cover" />
      ) : (
        <div
          className="h-16 w-full"
          style={{ backgroundColor: draft.bannerColor }}
        />
      )}
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="-mt-12 w-fit rounded-full bg-popover p-1.5">
          <UserAvatar profile={shown} size="xl" decoration />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl leading-6 font-bold text-header">
            <StyledName profile={shown} name={displayName(shown)} />
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-header">
            <span>{profile.username}</span>
            <GuildTag profile={profile} />
          </div>
          <ProfileBadges profile={profile} className="mt-1" />
        </div>
        {draft.bio.trim() && (
          <p className="text-sm break-words whitespace-pre-wrap">
            {draft.bio.trim()}
          </p>
        )}
      </div>
    </div>
  )
}

/** Discord's "Perfis" page: edit what others see, with a live preview. */
export function ProfileSection() {
  const userId = useUserId()
  const qc = useQueryClient()
  const profile = useProfile(userId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState<ProfileImageKind | null>(null)
  const avatarPreview = useFileUrl(draft?.avatarFile ?? null)
  const bannerPreview = useFileUrl(draft?.bannerFile ?? null)

  // start (and reset) from the saved profile
  const base = profile ? draftOf(profile) : null
  const current = draft ?? base
  if (!profile || !current || !base) return null

  const update = (patch: Partial<Draft>) => setDraft({ ...current, ...patch })

  const patch: ProfilePatch = {}
  if (current.displayName.trim() !== base.displayName.trim()) {
    patch.display_name = current.displayName.trim() || null
  }
  if (current.avatarFile || current.avatarUrl !== base.avatarUrl) {
    patch.avatar_url = current.avatarUrl
  }
  if (current.bannerFile || current.bannerUrl !== base.bannerUrl) {
    patch.banner_url = current.bannerUrl
  }
  if (current.bannerColor !== base.bannerColor) {
    patch.banner_color = current.bannerColor
  }
  const styles = nameStylesOf(current, profile)
  if (JSON.stringify(styles) !== JSON.stringify(nameStylesOf(base, profile))) {
    patch.display_name_styles = styles
  }
  if (current.bio.trim() !== base.bio.trim()) patch.bio = current.bio.trim()
  const dirty = Object.keys(patch).length > 0

  const save = async () => {
    setSaving(true)
    const payload = { ...patch }
    try {
      if (current.avatarFile) {
        payload.avatar_url = await uploadFile(
          "profiles",
          userId,
          current.avatarFile
        )
      }
      if (current.bannerFile) {
        payload.banner_url = await uploadFile(
          "profiles",
          userId,
          current.bannerFile
        )
      }
      const saved = await updateMyProfile(payload)
      qc.setQueryData(queryKeys.profile(userId), saved)
      await qc.invalidateQueries({ queryKey: queryKeys.profiles })
      setDraft(null)
      toast.success("Perfil atualizado.")
    } catch {
      toast.error("Não foi possível salvar o perfil.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col-reverse gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Field label="Nome exibido">
            <Input
              value={current.displayName}
              maxLength={32}
              placeholder={profile.username}
              onChange={(e) => update({ displayName: e.target.value })}
            />
          </Field>

          <Field label="Avatar">
            <p className="text-xs text-muted-foreground">
              Envie uma imagem ou escolha um GIF (até 10 MB).
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setPicking("avatar")}>
                Mudar avatar
              </Button>
              {(current.avatarFile || current.avatarUrl) && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => update({ avatarFile: null, avatarUrl: null })}
                >
                  Remover avatar
                </Button>
              )}
            </div>
          </Field>

          <Field label="Banner do perfil">
            <p className="text-xs text-muted-foreground">
              Envie uma imagem ou escolha um GIF; proporção 5:2.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setPicking("banner")}>
                Mudar banner
              </Button>
              {(current.bannerFile || current.bannerUrl) && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => update({ bannerFile: null, bannerUrl: null })}
                >
                  Remover banner
                </Button>
              )}
            </div>
          </Field>

          <Field label="Cor do banner">
            <p className="text-xs text-muted-foreground">
              Aparece quando você não tem um banner de imagem.
            </p>
            <ColorSwatch
              label="Cor do banner"
              value={current.bannerColor}
              onChange={(bannerColor) => update({ bannerColor })}
            />
          </Field>

          <Field label="Cor do nome">
            <div className="flex gap-2">
              {(
                [
                  ["default", "Padrão"],
                  ["solid", "Cor sólida"],
                  ["gradient", "Degradê"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={
                    current.nameStyle === value ? "default" : "secondary"
                  }
                  onClick={() => update({ nameStyle: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
            {current.nameStyle !== "default" && (
              <div className="flex items-center gap-2">
                <ColorSwatch
                  label="Primeira cor do nome"
                  value={current.nameColors[0]}
                  onChange={(color) =>
                    update({ nameColors: [color, current.nameColors[1]] })
                  }
                />
                {current.nameStyle === "gradient" && (
                  <ColorSwatch
                    label="Segunda cor do nome"
                    value={current.nameColors[1]}
                    onChange={(color) =>
                      update({ nameColors: [current.nameColors[0], color] })
                    }
                  />
                )}
              </div>
            )}
          </Field>

          <Field label="Sobre mim">
            <Textarea
              value={current.bio}
              maxLength={190}
              rows={4}
              placeholder="Conte um pouco sobre você"
              onChange={(e) => update({ bio: e.target.value })}
            />
            <span
              className={cn(
                "self-end text-xs text-muted-foreground",
                current.bio.length > 180 && "text-warning"
              )}
            >
              {190 - current.bio.length}
            </span>
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <SettingsLabel>Prévia</SettingsLabel>
          <Preview
            profile={profile}
            draft={current}
            avatar={avatarPreview ?? current.avatarUrl}
            banner={bannerPreview ?? current.bannerUrl}
          />
        </div>
      </div>

      <ProfileImageDialog
        kind={picking ?? "avatar"}
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        onApply={(file) =>
          update(
            picking === "banner" ? { bannerFile: file } : { avatarFile: file }
          )
        }
      />

      {dirty && (
        <UnsavedBar
          saving={saving}
          onReset={() => setDraft(null)}
          onSave={() => void save()}
        />
      )}
    </div>
  )
}
