import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import AgentField from '../components/AgentField'
import { backendFetch } from '../lib/backend'
import { useAgentNode } from '../lib/agent-runtime'

const TEMPLATE_PATH = 'logs/chronik/2025-10-15-template.md'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chronik'

type TemplateState = {
  content: string
  loading: boolean
  error: string | null
}

const TEMPLATES = [
  {
    id: 'standard',
    label: 'Standard (Mikro + Makro)',
    path: TEMPLATE_PATH,
  },
  {
    id: 'mikro',
    label: 'Mikro-Fokus (kurzer Tagesimpuls)',
    path: 'logs/chronik/templates/mikro.md',
  },
  {
    id: 'makro',
    label: 'Makro-Longform (Trend & Synthese)',
    path: 'logs/chronik/templates/makro-longform.md',
  },
  {
    id: 'dialog',
    label: 'Dialog (Hermes <-> Thoth)',
    path: 'logs/chronik/templates/dialog.md',
  },
]

async function emitTelemetry(event: string, data: Record<string, unknown>) {
  try {
    await backendFetch('/api/dev/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
    })
  } catch {
    // Telemetrie darf den Wizard niemals blockieren
  }
}

export default function ChronikPage() {
  const { pendingCommand, consumePendingCommand, setAgentPulse } = useAgentNode('chronik')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [timeWindow, setTimeWindow] = useState('')
  const [location, setLocation] = useState('')
  const [mood, setMood] = useState('')
  const [notes, setNotes] = useState('')
  const [links, setLinks] = useState('')

  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [createdPath, setCreatedPath] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string>('standard')
  const [agentNotice, setAgentNotice] = useState<string | null>(null)

  const templateRef = useRef<TemplateState>({
    content: '',
    loading: true,
    error: null,
  })
  const openedRef = useRef(false)

  const navigate = useNavigate()

  useEffect(() => {
    const controller = new AbortController()
    const loadTemplate = async () => {
      templateRef.current = { content: '', loading: true, error: null }
      const selected = TEMPLATES.find((item) => item.id === templateId) || TEMPLATES[0]
      try {
        const res = await backendFetch(`/api/fs/read?path=${encodeURIComponent(selected.path)}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          const detail = await res.text()
          throw new Error(detail || 'Template konnte nicht geladen werden')
        }
        const data = await res.json()
        templateRef.current = { content: String(data?.content ?? ''), loading: false, error: null }
      } catch (err: any) {
        if (err.name === 'AbortError') return
        templateRef.current = {
          content: DEFAULT_TEMPLATE,
          loading: false,
          error: err.message || 'Falle auf statisches Template zurück',
        }
      }
    }
    loadTemplate()
    return () => controller.abort()
  }, [templateId])

  useEffect(() => {
    if (!title.trim()) {
      setSlug('')
      return
    }
    setSlug((prev) => {
      if (!prev) return slugify(title)
      return prev
    })
  }, [title])

  const today = useMemo(() => {
    const now = new Date()
    return now.toISOString().slice(0, 10)
  }, [])

  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    void emitTelemetry('chronik_wizard_open', {
      template: templateId,
      date: today,
      source: 'frontend',
    })
  }, [templateId, today])

  useEffect(() => {
    const tone = status === 'error' ? 'error' : status === 'saving' || templateRef.current.loading ? 'busy' : 'active'
    const detail =
      statusMessage ||
      (status === 'saving'
        ? 'Chronik wird verdichtet'
        : templateRef.current.loading
          ? 'Template wird geladen'
          : 'Mikro und Makro koennen verbunden werden')
    setAgentPulse('chronik', tone, detail)
    return () => {
      setAgentPulse('chronik', 'idle', 'Mikro und Makro warten')
    }
  }, [setAgentPulse, status, statusMessage, templateId])

  useEffect(() => {
    if (!pendingCommand) return

    if (pendingCommand.body) {
      setNotes((current) => current || pendingCommand.body)
      if (!title) {
        setTitle('Delegierter Chronik-Impuls')
      }
    }

    setAgentNotice(`Alpha delegierte an Chronik: ${pendingCommand.body || 'Neuen Eintrag anlegen.'}`)
    consumePendingCommand('chronik')
  }, [consumePendingCommand, pendingCommand, title])

  const buildContent = useCallback(
    (template: string) => {
      const replacements: Record<string, string> = {
        'YYYY-MM-DD': today,
        '{Uhrzeit oder Phase des Tages}': timeWindow || '{Uhrzeit oder Phase des Tages}',
        '{physisch oder digitaler Kontext}': location || '{physisch oder digitaler Kontext}',
        '{kurzer sensorischer Eindruck}': mood || '{kurzer sensorischer Eindruck}',
        '{Augenblick}': timeWindow || '{Augenblick}',
        '{Kontext oder Setting}': location || '{Kontext oder Setting}',
        '{Kurzer Eindruck}': mood || '{Kurzer Eindruck}',
      }

      let content = template
      for (const [needle, value] of Object.entries(replacements)) {
        content = content.replace(needle, value)
      }

      if (notes.trim()) {
        content = content.replace(
          '{Was ist passiert? Begegnungen, Gespräche, unmittelbare Ereignisse.}',
          notes.trim(),
        )
      }

      if (links.trim()) {
        const items = links
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => `- ${line}`)
          .join('\n')
        const marker = '| Wissenschaft / Technik | [Link oder Zitat] | Kontext |'
        content = content.replace(marker, `${marker}\n${items}`)
      }

      return content
    },
    [links, mood, notes, timeWindow, location, today],
  )

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setStatus('saving')
      setStatusMessage(null)
      setCreatedPath(null)

      const effectiveSlug = slug ? slugify(slug) : slugify(title)
      const filePath = `logs/chronik/${today}-${effectiveSlug}.md`
      const template = templateRef.current.content || DEFAULT_TEMPLATE
      const body = buildContent(template)

      try {
        const res = await backendFetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content: body }),
        })
        if (!res.ok) {
          const detail = await res.text()
          throw new Error(detail || `Konnte Chronik nicht speichern (${res.status})`)
        }
        setStatus('success')
        setStatusMessage('Chronik erstellt – du kannst sie jetzt im Editor öffnen.')
        setCreatedPath(filePath)
        void emitTelemetry('chronik_wizard_create', {
          template: templateId,
          status: 'success',
          path: filePath,
          date: today,
          source: 'frontend',
        })
      } catch (err: any) {
        setStatus('error')
        setStatusMessage(err.message || 'Unerwarteter Fehler beim Speichern')
        void emitTelemetry('chronik_wizard_create', {
          template: templateId,
          status: 'error',
          error: err?.message ?? 'unknown',
          date: today,
          source: 'frontend',
        })
      }
    },
    [buildContent, slug, templateId, title, today],
  )

  const handleOpenEditor = useCallback(() => {
    if (!createdPath) return
    navigate(`/editor?path=${encodeURIComponent(createdPath)}`)
  }, [createdPath, navigate])

  const isSaving = status === 'saving'

  return (
    <div className="min-h-screen bg-paper p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-2xl bg-paper-grain p-6 shadow-soft-grain">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif">Chronik-Wizard</h1>
            <p className="text-sm text-smoke">
              Erstelle einen neuen Eintrag unter <code>logs/chronik/</code> auf Basis des Templates.
            </p>
          </div>
          <nav className="flex gap-3 text-sm">
            <Link to="/" className="text-forest hover:underline transition-soft">
              Chat
            </Link>
            <Link to="/editor" className="text-forest hover:underline transition-soft">
              Editor
            </Link>
            <Link to="/dev" className="text-forest hover:underline transition-soft">
              Dev
            </Link>
          </nav>
        </header>

        <AgentField agentId="chronik" compact notice={agentNotice} />

        {templateRef.current.loading && (
          <div className="rounded border border-stone/50 bg-white/70 p-3 text-sm text-smoke">
            Template wird geladen…
          </div>
        )}
        {templateRef.current.error && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Template konnte nicht geladen werden – nutze statisches Fallback.
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-smoke">Titel *</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="input-mystic"
                placeholder="Integrationstagebuch"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-smoke">Slug</span>
              <input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="input-mystic"
                placeholder="integration"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-smoke">Template-Auswahl</span>
            <select
              value={templateId}
              onChange={(event) => {
                const nextTemplate = event.target.value
                void emitTelemetry('chronik_wizard_template_switch', {
                  from: templateId,
                  to: nextTemplate,
                  date: today,
                  source: 'frontend',
                })
                setTemplateId(nextTemplate)
              }}
              className="input-mystic"
            >
              {TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-smoke">Zeitfenster</span>
              <input
                value={timeWindow}
                onChange={(event) => setTimeWindow(event.target.value)}
                className="input-mystic"
                placeholder="z. B. Vormittag"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-smoke">Ort / Kontext</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="input-mystic"
                placeholder="Workspace, Außenwelt…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-smoke">Wetter / Stimmung</span>
              <input
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                className="input-mystic"
                placeholder="erdig, fokussiert, warm..."
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-smoke">Beobachtungen / Notizen</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="input-mystic min-h-[140px]"
              placeholder="Kurz die Mikroperspektive (was ist passiert, wie wirkt es)..."
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-smoke">Links / Quellen (optional, pro Zeile)</span>
            <textarea
              value={links}
              onChange={(event) => setLinks(event.target.value)}
              className="input-mystic min-h-[100px]"
              placeholder="https://... – Kontext\nhttps://... – Kontext"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="button-mystic transition-soft" disabled={isSaving}>
              {isSaving ? 'Erstelle…' : 'Chronik erstellen'}
            </button>
            {createdPath && (
              <button
                type="button"
                onClick={handleOpenEditor}
                className="rounded-full border border-forest/40 bg-forest/10 px-3 py-1 text-sm text-forest transition-soft hover:bg-forest/20"
              >
                Im Editor öffnen
              </button>
            )}
            {statusMessage && (
              <span
                className={`text-sm ${
                  status === 'error' ? 'text-red-600' : status === 'success' ? 'text-forest' : 'text-smoke'
                }`}
              >
                {statusMessage}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

const DEFAULT_TEMPLATE = `# Chronik — ϕ / Nar ϕ  
## Datum
YYYY-MM-DD  
**Zeitfenster:** {Uhrzeit oder Phase des Tages}  
**Ort:** {physisch oder digitaler Kontext}  
**Wetter / Stimmung / Grundton:** {kurzer sensorischer Eindruck}

---

## I. Ereignisebene — Mikro / Makro

### 1. Mikro (persönlich / lokal)
- **Beobachtung:**  
  {Was ist passiert? Begegnungen, Gespräche, unmittelbare Ereignisse.}  
- **Wahrnehmung:**  
  {Wie wurde es erlebt, gespürt, gesehen? Welche Details blieben hängen?}  
- **Bedeutung im Moment:**  
  {Warum sticht es heraus? Verbindung zu laufenden Mustern oder Projekten.}

### 2. Makro (politisch / wirtschaftlich / kulturell)
- **Kontext:**  
  {Welches Ereignis, Entscheidung, Diskurs, Marktbewegung? Quelle oder Link.}  
- **Analyse:**  
  {Strukturelle Ursachen, Interessen, Dynamiken.}  
- **Langfristige Resonanz:**  
  {Welche größeren Linien könnten hier sichtbar werden?}

---

## II. Reflexionsebene — Synthese

### 1. Verflechtung
{Wie berühren sich Mikro und Makro? Wo spiegelt das Kleine das Große?}

### 2. Muster / Archetypen
{Welche wiederkehrenden Motive, Narrative oder Kräfte tauchen auf?  
(z. B. Fortschritt vs. Angst, Kontrolle vs. Vertrauen, Licht vs. Schatten)}

### 3. Emotionale Signatur
{Welche Gefühle trägt dieser Tag / dieses Ereignis?  
Tonfall, Farben, Temperatur.}

### 4. Sprachliche Destillation
> *Ein Satz, der bleibt.*  
> (Kurz, poetisch oder analytisch, deine Quintessenz.)

---

## III. Daten & Quellen

| Kategorie | Quelle / Referenz | Anmerkung |
|------------|------------------|------------|
| Politik | [Link oder Zitat] | Kontext |
| Wirtschaft | [Link oder Zitat] | Kontext |
| Kultur | [Link oder Zitat] | Kontext |
| Wissenschaft / Technik | [Link oder Zitat] | Kontext |

*(Füge bei Bedarf weitere Spalten oder Themen hinzu.)*

---

## IV. Resonanzbaum

- **Verbunden mit:** {andere Chronik-Einträge, Songs, Projekte, Gespräche}  
- **Betroffene Module:** {backend/, drafts/, memory/, etc.}  
- **Implikationen für:**  
  - *Kunst / Sprache*  
  - *Gesellschaft / Ethik*  
  - *Technik / Struktur*

---

## V. Nachhall / Aufgaben

- **Kurzfristig zu beobachten:** {Themen, Menschen, Indikatoren}  
- **Langfristige Hypothese:** {Welche Richtung wird das nehmen?}  
- **Nächste Handlung im System:** {Was Fi / Builder / Stylist damit tun soll.}

---

## VI. Fußnote

{Freier Raum für Zitate, Zahlen, astrologische / symbolische Marker, Geräusche, Träume, Fragmente.}

---

*Chronik-ID:* \`ϕ-chronik-YYYYMMDD-<slug>\`  
*Erstellt von:* {Autor / Modul / Rolle}  
*Verknüpfte Dateien:* {Pfad-Liste}
`
