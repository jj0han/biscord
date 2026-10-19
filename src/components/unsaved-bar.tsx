import { Button } from "@/components/ui/button"

/** Discord's floating "unsaved changes" bar at the bottom of settings pages. */
export function UnsavedBar({
  onReset,
  onSave,
  saving,
}: {
  onReset: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg bg-popover p-3 shadow-xl">
      <span className="text-sm font-medium">
        Cuidado — você tem alterações que não foram salvas!
      </span>
      <div className="flex gap-2">
        <Button variant="link" onClick={onReset}>
          Redefinir
        </Button>
        <Button
          className="bg-success hover:bg-success/80"
          onClick={onSave}
          disabled={saving}
        >
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}
