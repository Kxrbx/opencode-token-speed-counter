import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createCounter, type Clock } from "../src/controller.js"
import type { Snapshot, Message } from "../src/measurement.js"

test("reactive counter ticks at 250 ms, replaces snapshots and cleans up across reconnect and disposal", () => {
  let time = 2000
  const callbacks = new Set<() => void>()
  const clock: Clock = {
    now: () => time,
    every(callback, milliseconds) {
      assert.equal(milliseconds, 250)
      callbacks.add(callback)
      return () => { callbacks.delete(callback) }
    },
  }
  const message: Message = { id: "m", type: "assistant", time: { created: 1000 }, content: [{ type: "text", text: "abcdefgh" }] }
  const base: Snapshot = { server: "one", session: "s1", connected: true, running: true, messages: [message] }
  const root = createRoot((dispose) => {
    const [input, setInput] = createSignal<Snapshot | undefined>(base)
    const value = createCounter(input, clock)
    return { dispose, setInput, value }
  })
  assert.equal(callbacks.size, 1)
  assert.equal(root.value()?.rate, 2)
  time = 3000
  callbacks.forEach((callback) => callback())
  assert.equal(root.value()?.rate, 1)
  root.setInput({ ...base, connected: false })
  assert.equal(callbacks.size, 0)
  assert.equal(root.value()?.status, "disconnected")
  root.setInput(base)
  assert.equal(callbacks.size, 1)
  root.setInput({ ...base, session: "s2" })
  assert.equal(callbacks.size, 1)
  assert.match(root.value()!.key!, /s2/)
  root.setInput({ ...base, messages: [{ ...message, time: { created: 1000, streamed: 3000 }, tokens: { output: 40, reasoning: 10 } }] })
  assert.equal(root.value()?.rate, 25)
  assert.equal(callbacks.size, 0)
  root.setInput(base)
  assert.equal(callbacks.size, 1)
  root.dispose()
  assert.equal(callbacks.size, 0)
})

test("in-place synced store updates replace estimates without recreating the message", () => {
  const callbacks = new Set<() => void>()
  const root = createRoot((dispose) => {
    const [input, update] = createStore<Snapshot>({
      server: "sidecar", session: "s1", connected: true, running: true,
      messages: [{ id: "m", type: "assistant", time: { created: 1000 }, content: [{ type: "text", text: "abcd" }] }],
    })
    const value = createCounter(() => input, {
      now: () => 3000,
      every(callback) { callbacks.add(callback); return () => { callbacks.delete(callback) } },
    })
    return { dispose, update, value }
  })
  assert.equal(root.value()?.rate, 0.5)
  root.update("messages", 0, "content", 0, "text", "abcdefghijkl")
  assert.equal(root.value()?.rate, 1.5)
  root.update("messages", 0, "time", "streamed", 3000)
  root.update("messages", 0, "tokens", { output: 80, reasoning: 20 })
  assert.equal(root.value()?.rate, 50)
  assert.equal(root.value()?.approximate, false)
  assert.equal(callbacks.size, 0)
  root.dispose()
})
