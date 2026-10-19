const KEY = (kind: MediaDeviceKind) => `voice:device:${kind}`

/** The device chosen in settings, persisted so the next call uses it too. */
export function audioDevice(kind: MediaDeviceKind) {
  try {
    return localStorage.getItem(KEY(kind)) ?? "default"
  } catch {
    return "default"
  }
}

export function rememberDevice(kind: MediaDeviceKind, deviceId: string) {
  try {
    localStorage.setItem(KEY(kind), deviceId)
  } catch {
    // preference only
  }
}
