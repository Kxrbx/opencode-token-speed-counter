import { existsSync, realpathSync } from "node:fs"
import { copyFile, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { applyEdits, modify, parse, parseTree } from "jsonc-parser"

function matches(entry, extension, directory) {
  if (typeof entry !== "string") return false
  let candidate
  if (entry.startsWith("file://")) {
    try { candidate = fileURLToPath(entry) } catch { return false }
  } else if (path.isAbsolute(entry) || entry.startsWith("./") || entry.startsWith("../")) {
    candidate = path.resolve(directory, entry)
  } else return false
  try { candidate = realpathSync(candidate) } catch { /* Keep the normalized path if it no longer exists. */ }
  // NTFS is case-insensitive, but Node realpath keeps the typed casing, so compare without case there.
  return process.platform === "win32"
    ? candidate.toLowerCase() === extension.toLowerCase()
    : candidate === extension
}

/** Edit only the extension entry, retaining JSONC comments and unrelated settings. */
export function editConfiguration(source, extension, directory, action) {
  const errors = []
  const options = { allowTrailingComma: true, disallowComments: false }
  const document = parse(source.trim() ? source : "{}", errors, options)
  if (errors.length || document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("OpenCode configuration is not a valid JSON/JSONC object. No configuration changes were made.")
  }
  const tree = parseTree(source, [], options)
  if ((tree?.children ?? []).filter((item) => item.children?.[0]?.value === "plugins").length > 1) {
    throw new Error("Duplicate plugins fields found. Resolve them manually before running the installer.")
  }
  if (document.plugins !== undefined && !Array.isArray(document.plugins)) {
    throw new Error("The plugins setting must be an array. No configuration changes were made.")
  }
  const entries = document.plugins ?? []
  const indices = entries.flatMap((entry, index) => matches(entry, extension, directory) ? [index] : [])
  if ((action === "install" && indices.length > 0) || (action === "uninstall" && indices.length === 0)) return source
  const formattingOptions = {
    insertSpaces: true, tabSize: 2,
    eol: source.includes("\r\n") ? "\r\n" : "\n",
  }
  let result = source.trim() ? source : "{}\n"
  if (action === "install") {
    const property = document.plugins === undefined ? ["plugins"] : ["plugins", -1]
    const value = document.plugins === undefined ? [extension] : extension
    result = applyEdits(result, modify(result, property, value, { formattingOptions }))
  } else {
    for (const index of indices.reverse()) {
      result = applyEdits(result, modify(result, ["plugins", index], undefined, { formattingOptions }))
    }
  }
  return result
}

export async function configure({ extension, directory, action }) {
  if (action !== "install" && action !== "uninstall") throw new Error("Expected install or uninstall.")
  extension = await realpath(extension)
  if (action === "install") {
    for (const file of ["dist/server.js", "dist/gui-experimental.cjs"]) {
      if (!existsSync(path.join(extension, file))) throw new Error(`Missing ${file}. Run npm run build first.`)
    }
  }
  const candidates = ["opencode.jsonc", "opencode.json"].map((file) => path.join(directory, file))
  const existing = []
  for (const candidate of candidates) {
    try { await lstat(candidate); existing.push(candidate) }
    catch (error) { if (error.code !== "ENOENT") throw error }
  }
  if (existing.length > 1) throw new Error("Both opencode.jsonc and opencode.json exist. Use the manual instructions to select the intended configuration.")
  if (!existing.length && action === "uninstall") return { changed: false }
  const selected = existing[0] ?? candidates[0]
  // Resolve symlinked dotfiles so replacing the contents preserves the symlink itself.
  const target = existing.length ? await realpath(selected) : selected
  const source = existing.length ? await readFile(target, "utf8") : "{}\n"
  const updated = editConfiguration(source, extension, directory, action)
  if (updated === source) return { changed: false, config: selected }
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
  const mode = existing.length ? (await stat(target)).mode & 0o777 : 0o600
  const suffix = `${Date.now()}-${process.pid}`
  const backup = existing.length ? `${target}.backup-${suffix}` : undefined
  if (backup) await copyFile(target, backup, constants.COPYFILE_EXCL)
  const temporary = `${target}.tmp-${suffix}`
  try {
    await writeFile(temporary, updated, { flag: "wx", mode })
    if (existing.length ? await readFile(target, "utf8") !== source : existsSync(target)) {
      throw new Error("Configuration changed during installation. No changes were applied; run again after other edits finish.")
    }
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error })
  }
  return { changed: true, config: selected, backup }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.env.OPENCODE_CONFIG || process.env.OPENCODE_CONFIG_DIR || process.env.OPENCODE_CONFIG_CONTENT) {
      throw new Error("Custom OpenCode configuration overrides detected. Use the manual README instructions.")
    }
    const result = await configure({
      extension: fileURLToPath(new URL("../", import.meta.url)),
      directory: path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode"),
      action: process.argv[2],
    })
    console.log(result.changed ? `Updated ${result.config}` : "Configuration already up to date.")
    if (result.backup) console.log(`Backup: ${result.backup}`)
    console.log("Restart OpenCode Desktop to apply the change.")
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
