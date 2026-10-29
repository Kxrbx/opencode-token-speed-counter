import { ComposerPill, Plugin } from "@opencode/plugin/gui"
import { createCounter } from "./controller.js"
import { measure, type Snapshot } from "./measurement.js"
import { present } from "./presentation.js"

function parseVersion(version: string | undefined): number[] {
  const text = String(version ?? "").trim().replace(/^v/i, "")
  const core = text.split(/[+-]/)[0]
  const parts = core.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  while (parts.length < 3) parts.push(0)
  return parts.slice(0, 3)
}

function isCompatibleVersion(version: string | undefined): boolean {
  // OpenCode's GUI API is experimental, but the addon must keep working on
  // current and future releases. Only versions older than 2.2.1 are disabled.
  const current = parseVersion(version)
  const minimum = parseVersion("2.2.1")
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== minimum[index]) return current[index] > minimum[index]
  }
  return true
}

export default Plugin.define({
  setup(ctx) {
    const compatible = isCompatibleVersion(ctx.app?.version)
    const snapshot = (): Snapshot | undefined => {
      const session = ctx.sessions.current()
      if (!session) return
      const data = session.server.data
      return {
        server: session.server.id,
        session: session.id,
        connected: session.server.connected,
        running: data.session.status(session.id) === "running",
        messages: data.session.message.list(session.id),
      }
    }
    const current = createCounter(() => compatible ? snapshot() : undefined)
    ctx.add(ComposerPill, {
      id: "speed",
      show(input) {
        const session = input.session
        // Cached composers can belong to a different session than the current route.
        const value = current()
        const routed = ctx.sessions.current()
        const measurement = routed?.key === session.key && value ? value : measure({
          server: session.server.id,
          session: session.id,
          connected: session.server.connected,
          running: session.server.data.session.status(session.id) === "running",
          messages: session.server.data.session.message.list(session.id),
        }, Date.now())
        return present(measurement, ctx.locale.locale(), compatible)
      },
    })
  },
})
