import { useState } from "react"

import { AppDialogContent } from "@/components/app-dialog"
import { DiscordIcon } from "@/components/brand-icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { signInWithDiscord } from "@/features/auth/auth-provider"
import {
  setSyncOverwrite,
  SYNCED_FIELDS,
  type SyncedField,
} from "@/features/profiles/queries"
import type { Profile } from "@/lib/types"

/**
 * "Sincronizar com o Discord": fields customized in Biscord are kept unless
 * ticked here, in which case Discord's value replaces them.
 */
export function DiscordResyncButton({ profile }: { profile: Profile }) {
  const customized = (profile.overrides ?? []).filter(
    (field): field is SyncedField => field in SYNCED_FIELDS
  )
  const [open, setOpen] = useState(false)
  const [overwrite, setOverwrite] = useState<SyncedField[]>([])

  const sync = (fields: SyncedField[]) => {
    setSyncOverwrite(fields)
    void signInWithDiscord(window.location.pathname)
  }

  return (
    <>
      <Button
        className="w-fit"
        onClick={() => (customized.length ? setOpen(true) : sync([]))}
      >
        <DiscordIcon />
        Sincronizar com o Discord
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <AppDialogContent className="sm:max-w-110">
          <DialogHeader>
            <DialogTitle>Sincronizar com o Discord</DialogTitle>
            <DialogDescription>
              Você personalizou estes itens no Biscord. Marque os que devem
              voltar a ser os do Discord; os outros continuam como estão.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {customized.map((field) => (
              <label key={field} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={overwrite.includes(field)}
                  onCheckedChange={(on) =>
                    setOverwrite((prev) =>
                      on ? [...prev, field] : prev.filter((f) => f !== field)
                    )
                  }
                />
                Substituir {SYNCED_FIELDS[field].toLowerCase()} pelo do Discord
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => sync(overwrite)}>
              <DiscordIcon />
              Sincronizar
            </Button>
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  )
}
