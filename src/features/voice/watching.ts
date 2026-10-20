import { useRoomContext } from "@livekit/components-react"
import {
  type RemoteParticipant,
  type RemoteTrackPublication,
  RoomEvent,
  Track,
} from "livekit-client"
import { useEffect } from "react"

import { createStore } from "@/lib/store"

/**
 * Whose streams we're watching. Like Discord, being in a call doesn't mean
 * receiving everyone's stream: you pick one with "Assistir transmissão",
 * which also saves the bandwidth of the streams you don't watch.
 */
export const watchingStore = createStore<ReadonlySet<string>>(new Set())

export function watchStream(identity: string) {
  watchingStore.set((prev) => new Set(prev).add(identity))
}

export function stopWatching(identity: string) {
  watchingStore.set((prev) => {
    const next = new Set(prev)
    next.delete(identity)
    return next
  })
}

export function useWatching(identity: string) {
  return watchingStore.useStore((set) => set.has(identity))
}

const STREAM_SOURCES = new Set([
  Track.Source.ScreenShare,
  Track.Source.ScreenShareAudio,
])

/**
 * The room connects with autoSubscribe off; this subscribes to every voice
 * and camera, and to a stream only while it's being watched.
 */
export function useSubscriptions(connected: boolean) {
  const room = useRoomContext()

  useEffect(() => {
    if (!connected) return

    const apply = (
      participant: RemoteParticipant,
      publication: RemoteTrackPublication
    ) => {
      const wanted = STREAM_SOURCES.has(publication.source)
        ? watchingStore.get().has(participant.identity)
        : true
      if (publication.isDesired !== wanted) publication.setSubscribed(wanted)
    }
    const applyAll = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          apply(participant, publication)
        }
      }
    }
    const onPublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => apply(participant, publication)
    // a stream that ends isn't "being watched" anymore next time it starts
    const onUnpublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (publication.source === Track.Source.ScreenShare) {
        stopWatching(participant.identity)
      }
    }

    applyAll()
    const unsubscribe = watchingStore.subscribe(applyAll)
    room
      .on(RoomEvent.TrackPublished, onPublished)
      .on(RoomEvent.TrackUnpublished, onUnpublished)
    return () => {
      unsubscribe()
      room
        .off(RoomEvent.TrackPublished, onPublished)
        .off(RoomEvent.TrackUnpublished, onUnpublished)
      watchingStore.set(new Set())
    }
  }, [room, connected])
}
