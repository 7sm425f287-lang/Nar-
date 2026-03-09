export type PrinciplesSection = {
  title: string
  lines: string[]
}

export type PrinciplesDocument = {
  raw: string
  sections: PrinciplesSection[]
  source: 'bridge' | 'fallback'
}

const FALLBACK_PRINCIPLES = `# ϕ / Nar ϕ – Arbeitsprinzipien

## Resonanzkern
- Erkenntnisse entstehen aus Spiegelung von Texten, Logs und Chroniken.
- Jede Session lädt memory/state.yaml, die neuesten Status- und Plan-Dateien sowie system/ und backend/core/config.py.
- Antworten folgen dem Duktus der Eingabe; stille Resonanz ist erlaubt.

## Adaptive Modi
- **Sprint** – knappe To-dos, Abschluss mit „Nächster Schritt“.
- **Research** – Kurzfazit, 3–5 Fakten, Entscheidungsoptionen A/B/C.
- **Reflexion** – 2–4 Absätze mit Spannungen, Hypothese, Frage und Kernsatz.
- **Komposition** – 2–3 Varianten einer Passage, Abschluss „Welche Richtung trägt?“.

### Erkennungsregeln
- **Sprint** – telegrammartige Eingaben, imperative Verben, Zeitdruck → antworte maximal 5 Sätze, direkte Action.
- **Research** – Fragen nach Vergleich/Fakten, klare Strukturwünsche → liefere Kurzfazit + Bulletpoints + Optionen.
- **Reflexion** – kontemplative, bildhafte Sprache, Wunsch nach Deutung → antworte in Absätzen, führe Spannungen und Kernsatz.
- **Komposition** – poetische oder lyrische Formulierungen, Bitte um Varianten → generiere 2–3 Fassungen ohne Kommentarzeilen.

## Denker-Instanz
- Liest Muster aus logs/chronik/, drafts/, atlas/.
- Baut Proto-Modelle mit Vertrauensgrad und Quellen.
- Verfasst monatlich Kohärenzkarten (drafts/chronik/) mit „Kernsatz des Monats“.
- Markiert spekulative Passagen und respektiert personenbezogene Grenzen.
`

function normalizeContent(raw: string) {
  return raw.replace(/\r\n/g, '\n').trim()
}

export function parsePrinciples(raw: string): PrinciplesSection[] {
  const lines = normalizeContent(raw).split('\n')
  const sections: PrinciplesSection[] = []
  let current: PrinciplesSection | null = null
  let subsection = ''

  const pushCurrent = () => {
    if (!current) return
    current.lines = current.lines.filter(Boolean)
    sections.push(current)
    current = null
  }

  for (const sourceLine of lines) {
    const line = sourceLine.trim()
    if (!line) continue

    const sectionMatch = line.match(/^##\s+(.+)$/)
    if (sectionMatch) {
      pushCurrent()
      subsection = ''
      current = {
        title: sectionMatch[1].trim(),
        lines: [],
      }
      continue
    }

    const subsectionMatch = line.match(/^###\s+(.+)$/)
    if (subsectionMatch) {
      subsection = subsectionMatch[1].trim()
      continue
    }

    if (!current) continue

    const bullet = line.startsWith('- ') ? line.slice(2).trim() : line
    const normalized = subsection ? `${subsection}: ${bullet}` : bullet
    current.lines.push(normalized)
  }

  pushCurrent()
  return sections
}

export async function loadPrinciplesDocument(): Promise<PrinciplesDocument> {
  try {
    const response = await window.moerlinPrinciples?.getPrinciples?.()
    if (response?.ok && response.content) {
      const raw = normalizeContent(response.content)
      return {
        raw,
        sections: parsePrinciples(raw),
        source: 'bridge',
      }
    }
  } catch {
    // Fallback below keeps the frontend usable in browser/dev contexts.
  }

  const raw = normalizeContent(FALLBACK_PRINCIPLES)
  return {
    raw,
    sections: parsePrinciples(raw),
    source: 'fallback',
  }
}
