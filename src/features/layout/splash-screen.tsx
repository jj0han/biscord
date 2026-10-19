import { Spinner } from "@/components/spinner"

export function SplashScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-rail">
      <img src="/biscord.svg" alt="" className="size-16 animate-pulse" />
      <Spinner className="text-muted-foreground" />
    </div>
  )
}
