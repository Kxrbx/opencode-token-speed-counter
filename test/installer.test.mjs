import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { configure, editConfiguration } from "../scripts/configure.mjs"
import { parse } from "jsonc-parser"

// Absolute on every platform; the relative test entry resolves back to `extension`.
const base = path.join(tmpdir(), "token-speed-counter-tests")
const extension = path.join(base, "Extensions", "token-speed-counter")
const directory = path.join(base, ".config", "opencode")

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
  for (const entry of [pathToFileURL(extension).href, "../../Extensions/token-speed-counter", `${extension}/`]) {
    const source = JSON.stringify({ plugins: [entry, "other-plugin"] })
    assert.equal(editConfiguration(source, extension, directory, "install"), source)
    assert.deepEqual(parse(editConfiguration(source, extension, directory, "uninstall")), { plugins: ["other-plugin"] })
  }
})

test("Windows: letter-case variants of the installed path are still recognized", async (t) => {
  if (process.platform !== "win32") { t.skip(); return }
  await fixture(async ({ extension, directory }) => {
    const source = JSON.stringify({ plugins: [extension.toLowerCase(), "other-plugin"] })
    assert.equal(editConfiguration(source, extension, directory, "install"), source)
    assert.deepEqual(
      parse(editConfiguration(source, extension, directory, "uninstall")),
      { plugins: ["other-plugin"] },
    )
  })
})

test("installer rejects malformed config and invalid or duplicate plugins fields", () => {
  for (const source of ["{broken", "[]", "null", '{"plugins": false}', '{"plugins": [], "plugins": []}']) {
    assert.throws(() => editConfiguration(source, extension, directory, "install"))
  }
})

async function fixture(run, t) {
  const root = await mkdtemp(path.join(tmpdir(), "token-speed-installer-"))
  const extension = path.join(root, "extension with spaces")
  const directory = path.join(root, "config")
  await mkdir(path.join(extension, "dist"), { recursive: true })
  await writeFile(path.join(extension, "dist/server.js"), "")
  await writeFile(path.join(extension, "dist/gui-experimental.cjs"), "")
  try { await run({ root, extension, directory }, t) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test("fresh installation and repeated activation/uninstallation are idempotent", async (t) => {
  await fixture(async ({ extension, directory }, t) => {
    const initial = await configure({ extension, directory, action: "uninstall" })
    assert.equal(initial.changed, false)
    const result = await configure({ extension, directory, action: "install" })
    assert.equal(result.changed, true)
    assert.equal(result.backup, undefined)
    const source = await readFile(result.config, "utf8")
    assert.deepEqual(parse(source), { plugins: [extension] })
    // POSIX-only: Windows ignores file mode bits.
    if (process.platform !== "win32") assert.equal((await stat(result.config)).mode & 0o777, 0o600)
    const again = await configure({ extension, directory, action: "install" })
    assert.equal(again.changed, false)
    assert.equal(await readFile(result.config, "utf8"), source)
    const removed = await configure({ extension, directory, action: "uninstall" })
    assert.equal(await readFile(removed.backup, "utf8"), source)
    assert.deepEqual(parse(await readFile(result.config, "utf8")), { plugins: [] })
    assert.equal((await configure({ extension, directory, action: "uninstall" })).changed, false)
  })
})

test("existing JSON config is backed up exactly and symlinked config remains linked", async (t) => {
  await fixture(async ({ root, extension, directory }, t) => {
    await mkdir(directory)
    const target = path.join(root, "dotfile.json")
    const source = '{"plugins":["keep-me"],"username":"unchanged"}\n'
    await writeFile(target, source, { mode: 0o600 })
    const link = path.join(directory, "opencode.json")
    try { await symlink(target, link) }
    catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        t.skip("symlinks unavailable here (Windows: enable Developer Mode or run as administrator)")
        return
      }
      throw error
    }
    const result = await configure({ extension, directory, action: "install" })
    assert.equal(result.config, link)
    assert.equal(await readFile(result.backup, "utf8"), source)
    assert.deepEqual(parse(await readFile(target, "utf8")), { plugins: ["keep-me", extension], username: "unchanged" })
    const { lstat } = await import("node:fs/promises")
    assert((await lstat(link)).isSymbolicLink())
  })
})

test("ambiguous config files, missing build and invalid configs leave settings intact", async (t) => {
  await fixture(async ({ extension, directory }, t) => {
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

test("a dangling configuration symlink is never overwritten", async (t) => {
  await fixture(async ({ root, extension, directory }, t) => {
    await mkdir(directory)
    const link = path.join(directory, "opencode.jsonc")
    try { await symlink(path.join(root, "missing-config"), link) }
    catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        t.skip("symlinks unavailable here (Windows: enable Developer Mode or run as administrator)")
        return
      }
      throw error
    }
    await assert.rejects(configure({ extension, directory, action: "install" }), { code: "ENOENT" })
    const { lstat } = await import("node:fs/promises")
    assert((await lstat(link)).isSymbolicLink())
  })
})
