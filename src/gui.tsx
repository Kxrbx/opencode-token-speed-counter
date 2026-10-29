import { ComposerPill, Plugin } from "@opencode/plugin/gui"
import { createCounter } from "./controller.js"
import { measure, type Snapshot } from "./measurement.js"
import { present } from "./presentation.js"

export default Plugin.define({
  setup(ctx) {
    const compatible = ctx.app.version === "2.2.1"
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
