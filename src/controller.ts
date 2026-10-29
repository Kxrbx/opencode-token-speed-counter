import { createKeyed } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import { measure, type Snapshot } from "./measurement.js"

export interface Clock {
  now(): number
  every(callback: () => void, milliseconds: number): () => void
}

export const systemClock: Clock = {
  now: () => Date.now(),
  every(callback, milliseconds) {
    const timer = setInterval(callback, milliseconds)
    return () => clearInterval(timer)
  },
}

/** Owns only a clock. Message data and connection state remain owned by the host. */
export function createCounter(snapshot: Accessor<Snapshot | undefined>, clock: Clock = systemClock) {
  const [now, setNow] = createSignal(clock.now())
  const value = createMemo(() => {
    const current = snapshot()
    return current ? measure(current, Math.max(now(), clock.now())) : undefined
  })
  createKeyed(
    () => {
      const current = snapshot()
      const measurement = value()
      return current?.connected && current.running &&
        (measurement?.status === "streaming" || measurement?.status === "waiting") && measurement.key
    },
    () => {
      setNow(clock.now())
      onCleanup(clock.every(() => setNow(clock.now()), 250))
    },
  )
  return value
}
