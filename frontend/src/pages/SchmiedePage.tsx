import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  Brain,
  Flame,
  Network,
  Orbit,
  type LucideIcon,
  Shield,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import AgentField from '../components/AgentField'
import { backendFetch } from '../lib/backend'
import {
  BACKEND_AGENTS_MATRIX,
  type BackendAgentCategory,
  type BackendAgentDefinition,
} from '../lib/agentsMatrix'
import { type AgentId, useAgentNode } from '../lib/agent-runtime'
import BackendAgentCard from '../components/BackendAgentCard'

const contextTargets: Array<{ id: AgentId; label: string }> = [
  { id: 'resonanz', label: 'Resonanz' },
  { id: 'editor', label: 'Editor' },
  { id: 'chronik', label: 'Chronik' },
  { id: 'dev', label: 'Dev' },
  { id: 'schmiede', label: 'Schmiede' },
]

const categoryIconMap: Record<BackendAgentCategory, LucideIcon> = {
  core: Orbit,
  cognitive: Brain,
  creative: Sparkles,
  manifestation: Bot,
  security: Shield,
  experimental: Flame,
  integration: Network,
}

const categoryLabelMap: Record<BackendAgentCategory, string> = {
  core: 'Core',
  cognitive: 'Cognitive',
  creative: 'Creative',
  manifestation: 'Manifestation',
  security: 'Security',
  experimental: 'Experimental',
  integration: 'Integration',
}

const ease = [0.22, 1, 0.36, 1] as const
const categoryOrder: BackendAgentCategory[] = [
  'core',
  'cognitive',
  'creative',
  'manifestation',
  'security',
  'experimental',
  'integration',
]

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'emanation'
  )
}

export default function SchmiedePage() {
  const {
    pendingCommand,
    consumePendingCommand,
    setAgentPulse,
    agents,
    selectBackendAgent,
  } = useAgentNode('schmiede')
  const [matrixAgents] = useState<BackendAgentDefinition[]>(BACKEND_AGENTS_MATRIX)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [agentNotice, setAgentNotice] = useState<string | null>(null)
  const [steeringTarget, setSteeringTarget] = useState<AgentId>('resonanz')
  const [newName, setNewName] = useState('')
  const [newTask, setNewTask] = useState('')
  const [newPath, setNewPath] = useState('drafts/agents/')
  const [newTone, setNewTone] = useState('klar, ruhig, hochfokussiert')

  useEffect(() => {
    const tone = saving ? 'busy' : 'active'
    const detail =
      saving
        ? 'Emanation wird gerufen'
        : `${matrixAgents.length} Emanationen sind direkt in der Matrix verankert`
    setAgentPulse('schmiede', tone, detail)
    return () => {
      setAgentPulse('schmiede', 'idle', 'Emanationen ruhen')
    }
  }, [matrixAgents.length, saving, setAgentPulse])

  useEffect(() => {
    if (!pendingCommand) return

    if (pendingCommand.intent === 'create_agent') {
      setShowForm(true)
      setSteeringTarget('schmiede')
      if (pendingCommand.seedName) {
        setNewName(pendingCommand.seedName)
      }
      if (pendingCommand.body) {
        setNewTask((current) => current || pendingCommand.body)
      }
    }

    setAgentNotice(`Alpha delegierte an Schmiede: ${pendingCommand.body || 'Neue Emanation vorbereiten.'}`)
    consumePendingCommand('schmiede')
  }, [consumePendingCommand, pendingCommand])

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!newName.trim()) return

      const slug = slugify(newName)
      const date = new Date().toISOString().slice(0, 10)
      const normalizedDir = newPath.trim().replace(/\/+$/, '') || 'drafts/agents'
      const targetPath = `${normalizedDir}/${date}-${slug}.md`
      const content = `# ${newName.trim()}\n\n## Kernauftrag\n${newTask.trim() || '-'}\n\n## Tonalitaet\n${newTone.trim() || '-'}\n\n## Zielpfad\n${normalizedDir}\n`

      setSaving(true)
      setSaveMessage(null)

      try {
        const res = await backendFetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath, content }),
        })
        if (!res.ok) {
          const detail = await res.text()
          throw new Error(detail || `Emanation konnte nicht gespeichert werden (${res.status})`)
        }
        setSaveMessage(`Emanation angelegt unter ${targetPath}`)
        setNewName('')
        setNewTask('')
        setNewTone('klar, ruhig, hochfokussiert')
        setShowForm(false)
      } catch (err: any) {
        setSaveMessage(err?.message || 'Emanation konnte nicht gerufen werden.')
      } finally {
        setSaving(false)
      }
    },
    [newName, newPath, newTask, newTone],
  )

  const activeTarget = useMemo(
    () => agents.find((agent) => agent.id === steeringTarget) || agents[0],
    [agents, steeringTarget],
  )

  const groupedBackendAgents = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          label: categoryLabelMap[category],
          items: matrixAgents.filter((agent) => agent.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [matrixAgents],
  )

  const handleBindBackendAgent = useCallback(
    (backendAgentId: string) => {
      selectBackendAgent(steeringTarget, backendAgentId)
      const backendAgent = matrixAgents.find((entry) => entry.id === backendAgentId)
      if (backendAgent && activeTarget) {
        setAgentNotice(`${backendAgent.name} steuert nun ${activeTarget.title}.`)
      }
    },
    [activeTarget, matrixAgents, selectBackendAgent, steeringTarget],
  )

  return (
    <div className="min-h-screen bg-paper p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[2rem] bg-paper-grain p-6 shadow-soft-grain">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="status-rune">Agenten-Schmiede</div>
              <div>
                <h1 className="text-4xl font-serif sm:text-5xl">Schmiede</h1>
                <p className="mt-3 max-w-3xl text-base leading-8 text-smoke">
                  Hier wird die Backend-Matrix aus <code>~/ϕ-SARIT-EL/modules/</code> in die
                  sichtbare Form von Mφrlin uebersetzt. Jede Emanation kann einen Kontext wie
                  Resonanz oder Editor uebernehmen.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="button-mystic" onClick={() => setShowForm((value) => !value)}>
                Emanation rufen
              </button>
              <Link to="/" className="secondary-button">
                Zur Mitte
              </Link>
            </div>
          </div>

          <div className="mt-5">
            <AgentField agentId="schmiede" compact notice={agentNotice} />
          </div>

          {saveMessage && <div className="mt-5 text-sm text-forest">{saveMessage}</div>}
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-[2rem] bg-paper-grain p-6 shadow-soft-grain">
            <div className="space-y-3">
              <div className="status-rune">Kommandostand</div>
              <h2 className="text-3xl font-serif">Kontext binden</h2>
              <p className="text-sm leading-7 text-smoke">
                Waehle zuerst den Zielkontext. Jeder Klick auf eine Emanation im rechten Feld setzt
                den steuernden Backend-Agenten fuer genau diesen Raum.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {contextTargets.map((target) => {
                const isActive = steeringTarget === target.id
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setSteeringTarget(target.id)}
                    className={`rounded-full border px-4 py-2 text-sm transition-soft ${
                      isActive
                        ? 'border-earth-ocker bg-earth-ocker/12 text-earth-umbra'
                        : 'border-stone bg-white/70 text-smoke hover:border-earth-stein'
                    }`}
                  >
                    {target.label}
                  </button>
                )
              })}
            </div>

            {activeTarget && (
              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/10 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-smoke-soft">Aktuelles Steuerzentrum</div>
                <div className="mt-3 text-2xl font-serif text-ink">{activeTarget.title}</div>
                <div className="mt-2 text-sm leading-7 text-smoke">{activeTarget.essence}</div>
                {activeTarget.steeringAgent && (
                  <div className="mt-4 rounded-[1.15rem] border border-earth-ocker/16 bg-earth-ocker/6 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-smoke-soft">Gebundene Emanation</div>
                    <div className="mt-2 text-base font-medium text-earth-umbra">{activeTarget.steeringAgent.name}</div>
                    <div className="mt-1 text-sm leading-6 text-smoke">{activeTarget.steeringAgent.description}</div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/10 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-smoke-soft">Sichtbare Matrix</div>
              <div className="mt-4 grid gap-3">
                {groupedBackendAgents.map((group) => (
                  <div key={group.category} className="rounded-[1.2rem] border border-white/6 bg-white/3 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-serif text-lg text-ink">{group.label}</div>
                      <div className="status-rune">{group.items.length}</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-smoke">
                      {group.items.map((item) => item.name).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-paper-grain p-6 shadow-soft-grain">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="status-rune">Agenten-Matrix</div>
                <h2 className="mt-3 text-3xl font-serif">24 Emanationen</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-smoke">
                  Die Matrix spiegelt die alte Modul-Architektur aus <code>ϕ-SARIT-EL</code> und
                  bindet ihre Geister in die neue Oberflaeche ein. Anklicken bedeutet: Dieser
                  Backend-Agent steuert den gewaehlten Kontext.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-white/8 bg-black/10 px-4 py-3 text-sm text-smoke">
                Zielkontext: <span className="font-medium text-earth-umbra">{activeTarget?.title}</span>
              </div>
            </div>

            <div className="grid gap-6">
              {groupedBackendAgents.map((group) => (
                <section key={group.category} className="grid gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="status-rune">{group.label}</div>
                      <h3 className="mt-2 text-2xl font-serif text-ink">{group.label}</h3>
                    </div>
                    <div className="rounded-full border border-white/8 bg-black/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-smoke-soft">
                      {group.items.length} Emanationen
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((backendAgent, index) => {
                      const Icon = categoryIconMap[backendAgent.category]
                      const isSelected = activeTarget?.steeringAgent?.id === backendAgent.id
                      const steeringContexts = agents
                        .filter((entry) => entry.steeringAgent?.id === backendAgent.id)
                        .map((entry) => entry.title)

                      return (
                        <BackendAgentCard
                          key={backendAgent.id}
                          backendAgent={backendAgent}
                          index={index}
                          Icon={Icon}
                          isSelected={isSelected}
                          steeringContexts={steeringContexts}
                          onBind={handleBindBackendAgent}
                          activeTargetTitle={activeTarget?.title}
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <AnimatePresence initial={false}>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease }}
              onSubmit={handleSubmit}
              className="rounded-[2rem] bg-paper-grain p-6 shadow-soft-grain"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-2 text-sm text-smoke">
                  <span>Name der Emanation</span>
                  <input
                    className="input-mystic"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="z. B. Publikums-Radar"
                  />
                </label>

                <label className="grid gap-2 text-sm text-smoke">
                  <span>Zielpfad</span>
                  <input
                    className="input-mystic"
                    value={newPath}
                    onChange={(event) => setNewPath(event.target.value)}
                    placeholder="drafts/agents/"
                  />
                </label>

                <label className="grid gap-2 text-sm text-smoke lg:col-span-2">
                  <span>Kernauftrag</span>
                  <textarea
                    className="input-mystic min-h-[120px] resize-none"
                    value={newTask}
                    onChange={(event) => setNewTask(event.target.value)}
                    placeholder="Welche Aufgabe soll diese Emanation buendeln?"
                  />
                </label>

                <label className="grid gap-2 text-sm text-smoke lg:col-span-2">
                  <span>Tonalitaet</span>
                  <input
                    className="input-mystic"
                    value={newTone}
                    onChange={(event) => setNewTone(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-smoke">
                  Erste Version: Es wird ein Draft unterhalb von <code>drafts/agents/</code> erzeugt.
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>
                    Zurueck
                  </button>
                  <button type="submit" className="button-mystic" disabled={saving}>
                    {saving ? 'Wird gerufen...' : 'Emanation rufen'}
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
