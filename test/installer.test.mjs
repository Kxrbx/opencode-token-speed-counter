import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { configure, editConfiguration } from "../scripts/configure.mjs"
import { parse } from "jsonc-parser"

const extension = "/Users/test/Extensions/token-speed-counter"
const directory = "/Users/test/.config/opencode"

test("installer preserves comments, trailing commas, other plugins and settings", () => {
  const source = `{
  // Keep my provider settings
  "providers": { "local": { "name": "local" } },
  "plugins": [
    // Keep my other plugin
    "other-plugin",
  ],
}\n`
  const result = editConfiguration(source, extension, directory, "install")
  assert(result.includes("// Keep my provider settings"))
  assert(result.includes("// Keep my other plugin"))
  assert.deepEqual(parse(result), {
    providers: { local: { name: "local" } }, plugins: ["other-plugin", extension],
  })
  assert.equal(editConfiguration(result, extension, directory, "install"), result)
  const removed = editConfiguration(result, extension, directory, "uninstall")
  assert.deepEqual(parse(removed), { providers: { local: { name: "local" } }, plugins: ["other-plugin"] })
  assert(removed.includes("// Keep my other plugin"))
  assert.equal(editConfiguration(removed, extension, directory, "uninstall"), removed)
})

test("installer recognizes equivalent file URLs and relative local paths", () => {
  for (const entry of [`file://${extension}`, "../../Extensions/token-speed-counter", `${extension}/`]) {
    const source = JSON.stringify({ plugins: [entry, "other-plugin"] })
    assert.equal(editConfiguration(source, extension, directory, "install"), source)
    assert.deepEqual(parse(editConfiguration(source, extension, directory, "uninstall")), { plugins: ["other-plugin"] })
  }
})

test("installer rejects malformed config and invalid or duplicate plugins fields", () => {
  for (const source of ["{broken", "[]", "null", '{"plugins": false}', '{"plugins": [], "plugins": []}']) {
    assert.throws(() => editConfiguration(source, extension, directory, "install"))
  }
})

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "token-speed-installer-"))
  const extension = path.join(root, "extension with spaces")
  const directory = path.join(root, "config")
  await mkdir(path.join(extension, "dist"), { recursive: true })
  await writeFile(path.join(extension, "dist/server.js"), "")
  await writeFile(path.join(extension, "dist/gui-experimental.cjs"), "")
  try { await run({ root, extension, directory }) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test("fresh installation and repeated activation/uninstallation are idempotent", async () => {
  await fixture(async ({ extension, directory }) => {
    const initial = await configure({ extension, directory, action: "uninstall" })
    assert.equal(initial.changed, false)
    const result = await configure({ extension, directory, action: "install" })
    assert.equal(result.changed, true)
    assert.equal(result.backup, undefined)
    const source = await readFile(result.config, "utf8")
    assert.deepEqual(parse(source), { plugins: [extension] })
    assert.equal((await stat(result.config)).mode & 0o777, 0o600)
    const again = await configure({ extension, directory, action: "install" })
    assert.equal(again.changed, false)
    assert.equal(await readFile(result.config, "utf8"), source)
    const removed = await configure({ extension, directory, action: "uninstall" })
    assert.equal(await readFile(removed.backup, "utf8"), source)
    assert.deepEqual(parse(await readFile(result.config, "utf8")), { plugins: [] })
    assert.equal((await configure({ extension, directory, action: "uninstall" })).changed, false)
  })
})

test("existing JSON config is backed up exactly and symlinked config remains linked", async () => {
  await fixture(async ({ root, extension, directory }) => {
    await mkdir(directory)
    const target = path.join(root, "dotfile.json")
    const source = '{"plugins":["keep-me"],"username":"unchanged"}\n'
    await writeFile(target, source, { mode: 0o600 })
    const link = path.join(directory, "opencode.json")
    await symlink(target, link)
    const result = await configure({ extension, directory, action: "install" })
    assert.equal(result.config, link)
    assert.equal(await readFile(result.backup, "utf8"), source)
    assert.deepEqual(parse(await readFile(target, "utf8")), { plugins: ["keep-me", extension], username: "unchanged" })
    const { lstat } = await import("node:fs/promises")
    assert((await lstat(link)).isSymbolicLink())
  })
})

test("ambiguous config files, missing build and invalid configs leave settings intact", async () => {
  await fixture(async ({ extension, directory }) => {
    await mkdir(directory)
    const config = path.join(directory, "opencode.jsonc")
    await writeFile(config, "{broken")
    await assert.rejects(configure({ extension, directory, action: "install" }), /valid JSON/)
    assert.equal(await readFile(config, "utf8"), "{broken")
    assert.deepEqual(await readdir(directory), ["opencode.jsonc"])
    await writeFile(path.join(directory, "opencode.json"), "{}")
    await assert.rejects(configure({ extension, directory, action: "install" }), /Both/)
    await rm(path.join(extension, "dist/server.js"))
    await assert.rejects(configure({ extension, directory, action: "install" }), /Missing dist/)
  })
})

test("a dangling configuration symlink is never overwritten", async () => {
  await fixture(async ({ root, extension, directory }) => {
    await mkdir(directory)
    const link = path.join(directory, "opencode.jsonc")
    await symlink(path.join(root, "missing-config"), link)
    await assert.rejects(configure({ extension, directory, action: "install" }), { code: "ENOENT" })
    const { lstat } = await import("node:fs/promises")
    assert((await lstat(link)).isSymbolicLink())
  })
})
