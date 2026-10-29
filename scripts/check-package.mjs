import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { runInNewContext } from "node:vm"
import { createRoot, onCleanup } from "solid-js"
import * as sdk from "@opencode/plugin/gui"

const root = fileURLToPath(new URL("../", import.meta.url))
const temporary = await mkdtemp(path.join(tmpdir(), "token-speed-package-"))
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], {
    cwd: root, encoding: "utf8", env: { ...process.env, npm_config_cache: path.join(temporary, "cache") },
  }))
  const files = packed[0].files.map((item) => item.path)
  assert(files.includes("dist/server.js"))
  assert(files.includes("dist/gui-experimental.cjs"))
  assert(files.includes("README.md"))
  assert(!files.some((file) => file.startsWith("src/") || file.startsWith("node_modules/")))
  const modules = path.join(temporary, "node_modules")
  const installed = path.join(modules, "opencode-token-speed-counter")
  await mkdir(installed, { recursive: true })
  execFileSync("tar", ["-xzf", path.join(temporary, packed[0].filename), "--strip-components=1", "-C", installed])
  // Emulate the host-provided peer SDK; the plugin itself is loaded only from its tarball.
  await mkdir(path.join(modules, "@opencode"), { recursive: true })
  await symlink(path.join(root, "node_modules/@opencode/plugin"), path.join(modules, "@opencode/plugin"), "dir")
  const probe = path.join(temporary, "probe.mjs")
  await writeFile(probe, `
    import assert from 'node:assert/strict';
    import plugin from 'opencode-token-speed-counter';
    assert.equal(plugin.id, 'token-speed-counter');
    await plugin.setup({});
    export const guiPath = import.meta.resolve('opencode-token-speed-counter/gui-experimental');
  `)
  const { guiPath } = await import(pathToFileURL(probe).href)
  const source = await readFile(fileURLToPath(guiPath), "utf8")
  const solid = await import("solid-js")
  const module = { exports: {} }
  const timers = new Set()
  runInNewContext(source, {
    module, exports: module.exports,
    require(name) {
      if (name === "@opencode/plugin/gui") return sdk
      if (name === "solid-js") return solid
      throw new Error(`Unexpected bundled dependency: ${name}`)
    },
    setInterval(callback, ms) { const timer = setInterval(callback, ms); timers.add(timer); return timer },
    clearInterval(timer) { clearInterval(timer); timers.delete(timer) },
  })
  const plugin = module.exports.default
  assert.equal(typeof plugin.setup, "function")
  const { createSignal } = solid
  const instance = createRoot((dispose) => {
    const [messages, setMessages] = createSignal([{
      id: "m1", type: "assistant", model: { providerID: "zen", id: "test-model" },
      time: { created: Date.now() - 2000 }, content: [{ type: "text", text: "abcdefgh" }],
    }])
    const session = {
      key: "sidecar\ns1", id: "s1", server: {
        id: "sidecar", connected: true,
        data: { session: { status: () => "running", message: { list: () => messages() } } },
      },
    }
    let registration
    plugin.setup({
      app: { version: "2.2.1" }, sessions: { current: () => session }, locale: { locale: () => "fr-FR" },
      add(registry, contribution) {
        assert.equal(registry, sdk.ComposerPill)
        assert.equal(registration, undefined)
        registration = contribution
        onCleanup(() => { registration = undefined })
      },
    })
    return { dispose, setMessages, session, pill: () => registration }
  })
  assert.equal(instance.pill().id, "speed")
  assert.match(instance.pill().show({ session: instance.session }).label, /^≈ /)
  assert.equal(timers.size, 1)
  instance.setMessages([{
    id: "m1", type: "assistant", model: { providerID: "zen", id: "test-model" },
    time: { created: 1000, streamed: 3000, completed: 9000 },
    tokens: { output: 80, reasoning: 20 }, content: [],
  }])
  assert.equal(instance.pill().show({ session: instance.session }).label, "50 tok/s · terminé")
  assert.equal(timers.size, 0)
  instance.dispose()
  assert.equal(instance.pill(), undefined)
  console.log("Packed server and GUI exports loaded from an isolated directory; live/final pill and teardown passed.")
} finally {
  await rm(temporary, { recursive: true, force: true })
}
