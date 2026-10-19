import { useProfile } from "@/features/profiles/queries"
import { useMember } from "@/features/servers/queries"
import { displayName } from "@/lib/format"

function TypingName({
  userId,
  serverId,
}: {
  userId: string
  serverId: string | null
}) {
  const profile = useProfile(userId)
  const member = useMember(serverId, userId)
  return (
    <strong className="font-semibold text-header">
      {displayName(profile, member?.nickname)}
    </strong>
  )
}

export function TypingIndicator({
  userIds,
  serverId,
}: {
  userIds: string[]
  serverId: string | null
}) {
  return (
    <div className="flex h-6 items-center gap-1 px-4 text-xs text-foreground">
      {userIds.length > 0 && (
        <>
          <span className="flex gap-0.5 pr-1" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-bounce rounded-full bg-header"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          {userIds.length > 3 ? (
            <span>Várias pessoas estão digitando…</span>
          ) : (
            <span>
              {userIds.map((id, i) => (
                <span key={id}>
                  {i > 0 && (i === userIds.length - 1 ? " e " : ", ")}
                  <TypingName userId={id} serverId={serverId} />
                </span>
              ))}{" "}
              {userIds.length === 1 ? "está digitando…" : "estão digitando…"}
            </span>
          )}
        </>
      )}
    </div>
  )
}
