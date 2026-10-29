import assert from "node:assert/strict"
import { test } from "node:test"
import { measure, type Message, type Snapshot } from "../src/measurement.js"
import { present } from "../src/presentation.js"

export function assistant(changes: Partial<Message> = {}): Message {
  return {
    id: "m1", type: "assistant", time: { created: 1000 },
    model: { providerID: "openrouter", id: "model" },
    content: [{ type: "text", text: "abcdefgh" }, { type: "reasoning", text: "1234" }],
    ...changes,
  }
}
export function snapshot(messages: Message[] = [assistant()], changes: Partial<Snapshot> = {}): Snapshot {
  return { server: "sidecar", session: "s1", connected: true, running: true, messages, ...changes }
}

test("live estimate includes output and reasoning and first-token latency", () => {
  const value = measure(snapshot(), 3000)
  assert.equal(value.total, 3)
  assert.equal(value.duration, 2)
  assert.equal(value.rate, 1.5)
  assert.equal(value.approximate, true)
  assert.equal(value.status, "streaming")
})

test("final counters replace estimates, exclude tool settlement and survive reload", () => {
  const input = snapshot([assistant({
    time: { created: 1000, streamed: 3000, completed: 15000 },
    tokens: { output: 80, reasoning: 20 },
  })], { running: false })
  const value = measure(input, 50000)
  assert.equal(value.total, 100)
  assert.equal(value.rate, 50)
  assert.equal(value.duration, 2)
  assert.equal(value.approximate, false)
  assert.equal(value.status, "done")
  assert.deepEqual(value, measure(structuredClone(input), 90000))
  assert.deepEqual(value, measure({ ...input, messages: [...input.messages, ...input.messages] }, 90000))
})

test("a new model request starts its own measurement after tools", () => {
  const value = measure(snapshot([
    assistant({ time: { created: 1000, streamed: 2000 }, tokens: { output: 50, reasoning: 10 } }),
    assistant({ id: "m2", time: { created: 10000 } }),
  ]), 12000)
  assert.equal(value.total, 3)
  assert.equal(value.rate, 1.5)
  assert.match(value.key!, /m2/)
})

test("missing or invalid usage stays explicitly approximate, including local endpoints", () => {
  for (const tokens of [undefined, { output: NaN, reasoning: 1 }, { output: -1, reasoning: 0 }]) {
    const value = measure(snapshot([assistant({ tokens, time: { created: 1000, streamed: 3000 } })]), 90000)
    assert.equal(value.rate, 1.5)
    assert.equal(value.approximate, true)
    assert.match(present(value, "fr").label, /^≈ /)
  }
})

test("zero reported tokens are valid; tool-only output is not guessed", () => {
  const value = measure(snapshot([assistant({
    content: [{ type: "tool", state: { status: "completed" } }],
    tokens: { output: 0, reasoning: 0 }, time: { created: 1000, streamed: 3000 },
  })]), 4000)
  assert.equal(value.rate, 0)
  assert.equal(value.approximate, false)
})

test("Unicode code points, rather than UTF-16 units, are estimated", () => {
  const value = measure(snapshot([assistant({ content: [{ type: "text", text: "😀😀😀😀" }] })]), 2000)
  assert.equal(value.total, 1)
})

test("zero, missing and backwards durations do not show Infinity or invent tool timings", () => {
  for (const time of [
    { created: 1000, streamed: 1000 }, { created: NaN, streamed: 3000 },
    { created: 4000, streamed: 3000 }, { created: 1000, completed: 9000 },
  ]) {
    const value = measure(snapshot([assistant({ time })], { running: false }), 10000)
    assert.equal(value.rate, undefined)
    assert.equal(value.status, "unavailable")
  }
})

test("waiting for the first fragment or a newly admitted prompt", () => {
  assert.equal(measure(snapshot([]), 2000).status, "waiting")
  assert.equal(measure(snapshot([assistant({ content: [] })]), 2000).status, "waiting")
  const value = measure(snapshot([
    assistant({ time: { created: 1000, streamed: 3000 } }),
    { id: "u2", type: "user", time: { created: 5000 } },
  ]), 6000)
  assert.equal(value.status, "waiting")
  assert.equal(value.rate, undefined)
})

test("tool execution keeps the final generation rate frozen", () => {
  const input = snapshot([assistant({
    time: { created: 1000, streamed: 3000 }, tokens: { output: 100, reasoning: 0 },
    content: [{ type: "tool", state: { status: "running" } }],
  })])
  assert.equal(measure(input, 9000).status, "tools")
  assert.equal(measure(input, 9000).rate, 50)
  assert.deepEqual(measure(input, 9000), measure(input, 19000))
})

test("interruption and failure never use time spent stopped as generation", () => {
  for (const outcome of ["interrupted", "failed"] as const) {
    const value = measure(snapshot([
      assistant(), { id: "idle", type: "idle", outcome, time: { created: 3000 } },
    ], { running: false }), 20000)
    assert.equal(value.status, outcome)
    assert.equal(value.duration, undefined)
    assert.equal(value.rate, undefined)
  }
})

test("disconnect invalidates an unfinished measurement; reconnect resumes it", () => {
  assert.equal(measure(snapshot(undefined, { connected: false }), 3000).status, "disconnected")
  assert.equal(measure(snapshot(undefined, { connected: false }), 3000).rate, undefined)
  assert.equal(measure(snapshot(), 3000).rate, 1.5)
})

test("measurement identities isolate servers, sessions and messages", () => {
  const keys = [
    measure(snapshot(), 3000).key,
    measure(snapshot(undefined, { server: "remote" }), 3000).key,
    measure(snapshot(undefined, { session: "s2" }), 3000).key,
    measure(snapshot([assistant({ id: "m2" })]), 3000).key,
  ]
  assert.equal(new Set(keys).size, 4)
})

test("French and English labels expose status, model, precision and compatibility", () => {
  const value = measure(snapshot([assistant({ tokens: { output: 80, reasoning: 20 }, time: { created: 1000, streamed: 3000 } })]), 3000)
  assert.equal(present(value, "fr-FR").label, "50 tok/s · terminé")
  assert.equal(present(value, "en-US").label, "50 tok/s · done")
  assert.equal(present(value, "fr").rows.find((row) => row.id === "model")?.detail, "openrouter/model")
  assert.equal(present(value, "fr", false).label, "Indisponible")
  assert.match(present(measure(snapshot(), 3000), "fr").label, /1,5/)
})
