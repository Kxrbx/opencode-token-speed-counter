/** Structural projection of OpenCode's synced messages (2.2.1 and later). Never retains prompt text. */
export interface Message {
  id: string
  type: string
  time: { created: number; streamed?: number; completed?: number }
  model?: { providerID: string; id: string }
  content?: readonly {
    type: string
    text?: string
    state?: { status: string }
  }[]
  tokens?: { output: number; reasoning: number }
  error?: unknown
  outcome?: "succeeded" | "failed" | "interrupted"
}

export type Status = "waiting" | "streaming" | "tools" | "done" | "interrupted" | "failed" | "disconnected" | "unavailable"
export interface Snapshot {
  server: string
  session: string
  connected: boolean
  running: boolean
  messages: readonly Message[]
}

export interface Measurement {
  key?: string
  status: Status
  approximate: boolean
  rate?: number
  duration?: number
  output?: number
  reasoning?: number
  total?: number
  model?: string
}

export function latestAssistant(messages: readonly Message[]) {
  return messages.findLast((message) => message.type === "assistant")
}

/** Snapshots replace prior values; replayed events are never added to counters. */
export function measure(snapshot: Snapshot, now: number): Measurement {
  const message = latestAssistant(snapshot.messages)
  const empty: Measurement = { status: "waiting", approximate: true }
  if (!message) return { ...empty, status: snapshot.connected ? "waiting" : "disconnected" }

  const position = snapshot.messages.lastIndexOf(message)
  const following = snapshot.messages.slice(position + 1)
  if (snapshot.running && following.some((item) => item.type === "user" || item.type === "synthetic")) {
    return { ...empty, status: snapshot.connected ? "waiting" : "disconnected" }
  }
  const idle = following.findLast((item) => item.type === "idle")
  const streamed = message.time.streamed !== undefined
  const terminal = streamed || message.time.completed !== undefined || idle !== undefined || !!message.error || !snapshot.running
  const hasTools = message.content?.some((part) => part.type === "tool" &&
    (part.state?.status === "streaming" || part.state?.status === "running")) ?? false
  let status: Status = !terminal ? "streaming" : hasTools && snapshot.running ? "tools" : "done"
  if (idle?.outcome === "interrupted") status = "interrupted"
  else if (idle?.outcome === "failed" || message.error) status = "failed"
  else if (!terminal && !message.content?.some((part) => part.text)) status = "waiting"
  if (!snapshot.connected) status = "disconnected"

  const result: Measurement = {
    key: JSON.stringify([snapshot.server, snapshot.session, message.id]),
    status,
    approximate: true,
    model: message.model ? `${message.model.providerID}/${message.model.id}` : undefined,
  }
  // Never substitute completed: it includes tool settlement. Freeze on disconnect/aborted streams.
  const end = streamed ? message.time.streamed! : terminal || !snapshot.connected ? undefined : now
  if (end !== undefined && Number.isFinite(end) && Number.isFinite(message.time.created) &&
      message.time.created > 0 && end > message.time.created) {
    result.duration = (end - message.time.created) / 1000
  }

  const valid = (value: number) => Number.isFinite(value) && value >= 0
  if (streamed && message.tokens && valid(message.tokens.output) && valid(message.tokens.reasoning)) {
    result.output = message.tokens.output
    result.reasoning = message.tokens.reasoning
    result.total = result.output + result.reasoning
    result.approximate = false
  } else {
    const characters = (type: string) => (message.content ?? []).reduce((sum, part) =>
      sum + (part.type === type ? Array.from(part.text ?? "").length : 0), 0)
    result.output = characters("text") / 4
    result.reasoning = characters("reasoning") / 4
    result.total = result.output + result.reasoning
  }
  if (result.duration !== undefined && result.total !== undefined &&
      (result.total > 0 || !result.approximate)) result.rate = result.total / result.duration
  if (result.duration === undefined && status !== "waiting" && status !== "disconnected" &&
      status !== "interrupted" && status !== "failed") result.status = "unavailable"
  return result
}
