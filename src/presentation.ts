import type { Measurement, Status } from "./measurement.js"

const en = {
  title: "Token speed", waiting: "Waiting", streaming: "Generating", tools: "Tool running",
  done: "done", interrupted: "Interrupted", failed: "Failed", disconnected: "Disconnected", unavailable: "Unavailable",
  output: "Output tokens", reasoning: "Reasoning tokens", total: "Total generated", duration: "Request duration",
  model: "Model", precision: "Measurement", reported: "Provider counters", estimated: "Estimate: 4 Unicode characters/token",
  timing: "Includes first-token wait; excludes tool execution",
  caveat: "Hidden reasoning and tool arguments cannot be estimated from displayed text.",
  compatibility: "Requires OpenCode Desktop 2.2.1",
}
const fr: typeof en = {
  title: "Vitesse des tokens", waiting: "En attente", streaming: "Génération", tools: "Outil en cours",
  done: "terminé", interrupted: "Interrompu", failed: "Échec", disconnected: "Déconnecté", unavailable: "Indisponible",
  output: "Tokens de sortie", reasoning: "Tokens de raisonnement", total: "Total généré", duration: "Durée de requête",
  model: "Modèle", precision: "Mesure", reported: "Compteurs du fournisseur", estimated: "Estimation : 4 caractères Unicode/token",
  timing: "Inclut l’attente du premier token ; exclut les outils",
  caveat: "Le raisonnement masqué et les arguments d’outils ne peuvent pas être estimés à partir du texte affiché.",
  compatibility: "Nécessite OpenCode Desktop 2.2.1",
}

export function present(value: Measurement, locale: string, compatible = true) {
  const text = locale.toLowerCase().startsWith("fr") ? fr : en
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const number = (value: number | undefined) => value === undefined ? "—" : format.format(value)
  const prefix = value.approximate ? "≈ " : ""
  const status: Status = value.status
  const rate = value.rate === undefined ? undefined : `${prefix}${number(value.rate)} tok/s`
  const label = !compatible ? text.unavailable : rate ? `${rate} · ${text[status]}` : text[status]
  return {
    label,
    title: text.title,
    rows: !compatible ? [{ id: "compatibility", label: text.compatibility }] : [
      { id: "output", label: text.output, detail: `${prefix}${number(value.output)}` },
      { id: "reasoning", label: text.reasoning, detail: `${prefix}${number(value.reasoning)}` },
      { id: "total", label: text.total, detail: `${prefix}${number(value.total)}` },
      { id: "duration", label: text.duration, detail: value.duration === undefined ? "—" : `${number(value.duration)} s` },
      { id: "model", label: text.model, detail: value.model ?? "—" },
      { id: "precision", label: text.precision, detail: value.approximate ? text.estimated : text.reported },
      { id: "timing", label: text.timing },
      ...(value.approximate ? [{ id: "caveat", label: text.caveat }] : []),
    ],
  }
}
