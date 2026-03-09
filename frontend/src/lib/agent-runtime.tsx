import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { BACKEND_AGENTS_MATRIX, getBackendAgentDefinition, type BackendAgentDefinition } from './agentsMatrix'
import { loadPrinciplesDocument, type PrinciplesDocument } from './principles'

export type AgentId = 'resonanz' | 'schmiede' | 'editor' | 'chronik' | 'dev'
export type AgentPulse = 'idle' | 'active' | 'busy' | 'delegated' | 'error'
export type AgentIntent =
  | 'navigate'
  | 'create_agent'
  | 'open_editor'
  | 'open_chronik'
  | 'open_dev'
  | 'review_logs'

export type AgentCommand = {
  id: string
  target: AgentId
  raw: string
  body: string
  intent: AgentIntent
  createdAt: string
  seedName?: string
}

type AgentDefinition = {
  id: AgentId
  title: string
  route: string
  aliases: string[]
  essence: string
  frequency: 'solar' | 'ember' | 'azure' | 'violet' | 'aurora'
  legacy: string
  principleFocus: string[]
}

export type AgentViewModel = AgentDefinition & {
  coreConstraints: string[]
  systemPrompt: string
  steeringAgent: BackendAgentDefinition | null
  status: {
    tone: AgentPulse
    label: string
    detail: string
  }
}

type AgentRuntimeValue = {
  agents: AgentViewModel[]
  activeAgentId: AgentId
  backendAgents: BackendAgentDefinition[]
  principles: PrinciplesDocument | null
  principlesReady: boolean
  navigateToAgent: (agentId: AgentId) => void
  delegatePrompt: (rawPrompt: string) => AgentCommand | null
  pendingCommands: Partial<Record<AgentId, AgentCommand>>
  consumePendingCommand: (agentId: AgentId) => void
  setAgentPulse: (agentId: AgentId, tone: AgentPulse, detail: string) => void
  selectBackendAgent: (agentId: AgentId, backendAgentId: string) => void
}

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'resonanz',
    title: 'Resonanz',
    route: '/',
    aliases: ['resonanz', 'chat', 'alpha', 'mitte', 'launcher'],
    essence: 'Alpha-Instanz fuer Delegation, Gespraech und Spiegelung.',
    frequency: 'aurora',
    legacy: 'niro-chat -> Nar φ -> Mφrlin',
    principleFocus: ['Resonanzkern', 'Adaptive Modi', 'Denker-Instanz'],
  },
  {
    id: 'schmiede',
    title: 'Schmiede',
    route: '/schmiede',
    aliases: ['schmiede', 'emanation', 'agent', 'agenten'],
    essence: 'Formt neue Agenten, Rollen und Entwuerfe zu arbeitsfaehigen Emanationen.',
    frequency: 'ember',
    legacy: 'Agenten-Schmiede aus Monaten lokaler Vorarbeit',
    principleFocus: ['Resonanzkern', 'Adaptive Modi', 'Denker-Instanz'],
  },
  {
    id: 'editor',
    title: 'Editor',
    route: '/editor',
    aliases: ['editor', 'text', 'dokument', 'draft'],
    essence: 'Haltet den Textkoerper stabil, editierbar und rueckfuehrbar auf Quellen.',
    frequency: 'solar',
    legacy: 'Datei- und Draft-Arbeit aus der niro/Nar-Linie',
    principleFocus: ['Resonanzkern', 'Adaptive Modi'],
  },
  {
    id: 'chronik',
    title: 'Chronik',
    route: '/chronik',
    aliases: ['chronik', 'journal', 'wizard', 'eintrag'],
    essence: 'Bindet Mikro und Makro zu Tages- und Musterprotokollen zusammen.',
    frequency: 'violet',
    legacy: 'Status-, Review- und Musterarbeit ueber viele Sprints',
    principleFocus: ['Resonanzkern', 'Adaptive Modi', 'Denker-Instanz'],
  },
  {
    id: 'dev',
    title: 'Dev',
    route: '/dev',
    aliases: ['dev', 'konsole', 'planner', 'ops', 'jobs'],
    essence: 'Steuert isolierte Worker, Logs und kontrollierte Eingriffe unter harten Grenzen.',
    frequency: 'azure',
    legacy: 'Job-Runner, Planner und Desktop-Ops aus der Nar-Phase',
    principleFocus: ['Adaptive Modi', 'Denker-Instanz'],
  },
]

const AgentRuntimeContext = createContext<AgentRuntimeValue | null>(null)

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/φ/g, 'phi')
    .replace(/[^a-z0-9]+/g, '')
}

function routeToAgentId(pathname: string): AgentId {
  const match = AGENT_DEFINITIONS.find((agent) => agent.route === pathname)
  return match?.id || 'resonanz'
}

function generateId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function mapStatusLabel(tone: AgentPulse) {
  switch (tone) {
    case 'busy':
      return 'im Fluss'
    case 'delegated':
      return 'gerufen'
    case 'error':
      return 'gestoert'
    case 'active':
      return 'anwesend'
    default:
      return 'bereit'
  }
}

function extractSeedName(body: string) {
  const quoted = body.match(/["“](.+?)["”]/)
  if (quoted?.[1]) return quoted[1].trim()

  const named = body.match(/(?:namens|name|heisst|heißt)\s+([A-Za-z0-9ÄÖÜäöüß\-_ ]{3,40})/i)
  if (named?.[1]) return named[1].trim()

  return undefined
}

function inferIntent(target: AgentId, body: string): AgentIntent {
  const lowered = body.toLowerCase()
  if (target === 'schmiede' && /(neuen?\s+agent|emanation|agentenform|erschaffe|erstelle)/.test(lowered)) {
    return 'create_agent'
  }
  if (target === 'editor' && /(oeffne|öffne|lade|bearbeite|editiere|datei)/.test(lowered)) {
    return 'open_editor'
  }
  if (target === 'chronik' && /(chronik|eintrag|tagebuch|journal|notiz)/.test(lowered)) {
    return 'open_chronik'
  }
  if (target === 'dev' && /(planner|job|log|test|stream|abort|runner)/.test(lowered)) {
    return lowered.includes('log') ? 'review_logs' : 'open_dev'
  }
  return 'navigate'
}

function buildCoreConstraints(agent: AgentDefinition, principles: PrinciplesDocument | null) {
  if (!principles) {
    return [
      `${agent.title} wahrt Resonanz, Klarheit und Rueckbindung an bestehende Artefakte.`,
      `${agent.title} bleibt Teil der Linie ${agent.legacy}.`,
    ]
  }

  const constraints: string[] = []
  for (const section of principles.sections) {
    for (const line of section.lines) {
      constraints.push(`${section.title}: ${line}`)
    }
  }

  constraints.push(`Agentenfokus: ${agent.essence}`)
  constraints.push(`Legacy-Linie: ${agent.legacy}`)

  return constraints
}

function buildSystemPrompt(agent: AgentDefinition, principles: PrinciplesDocument | null) {
  const constraints = buildCoreConstraints(agent, principles)
  const focus = agent.principleFocus.join(', ')
  return [
    `Du bist ${agent.title}, ein souveraener Agent innerhalb von Mφrlin.`,
    `Rolle: ${agent.essence}`,
    `Fokusbereiche: ${focus}.`,
    ...constraints.map((line) => `- ${line}`),
  ].join('\n')
}

export function AgentRuntimeProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [principles, setPrinciples] = useState<PrinciplesDocument | null>(null)
  const [pendingCommands, setPendingCommands] = useState<Partial<Record<AgentId, AgentCommand>>>({})
  const [pulses, setPulses] = useState<Record<AgentId, { tone: AgentPulse; detail: string }>>({
    resonanz: { tone: 'active', detail: 'Alpha-Feld' },
    schmiede: { tone: 'idle', detail: 'Emanationen ruhen' },
    editor: { tone: 'idle', detail: 'Textkoerper bereit' },
    chronik: { tone: 'idle', detail: 'Mikro und Makro warten' },
    dev: { tone: 'idle', detail: 'Runner in Reserve' },
  })
  const [selectedBackendAgents, setSelectedBackendAgents] = useState<Record<AgentId, string>>({
    resonanz: 'phi-resonance-core',
    schmiede: 'phi-soulforge',
    editor: 'phi-metamorph',
    chronik: 'phi-mirror',
    dev: 'phi-zerotrust',
  })

  useEffect(() => {
    let cancelled = false
    loadPrinciplesDocument().then((document) => {
      if (cancelled) return
      setPrinciples(document)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const activeAgentId = routeToAgentId(location.pathname)

  const navigateToAgent = useCallback(
    (agentId: AgentId) => {
      const target = AGENT_DEFINITIONS.find((agent) => agent.id === agentId)
      if (!target) return
      navigate(target.route)
    },
    [navigate],
  )

  const consumePendingCommand = useCallback((agentId: AgentId) => {
    setPendingCommands((current) => {
      if (!current[agentId]) return current
      const next = { ...current }
      delete next[agentId]
      return next
    })
  }, [])

  const setAgentPulse = useCallback((agentId: AgentId, tone: AgentPulse, detail: string) => {
    setPulses((current) => {
      const previous = current[agentId]
      if (previous?.tone === tone && previous.detail === detail) return current
      return {
        ...current,
        [agentId]: { tone, detail },
      }
    })
  }, [])

  const selectBackendAgent = useCallback((agentId: AgentId, backendAgentId: string) => {
    if (!getBackendAgentDefinition(backendAgentId)) return
    setSelectedBackendAgents((current) => {
      if (current[agentId] === backendAgentId) return current
      return {
        ...current,
        [agentId]: backendAgentId,
      }
    })
    const backend = getBackendAgentDefinition(backendAgentId)
    if (backend) {
      setPulses((current) => ({
        ...current,
        [agentId]: {
          tone: current[agentId]?.tone === 'error' ? 'error' : 'delegated',
          detail: `${backend.name} steuert ${agentId}`,
        },
      }))
    }
  }, [])

  const delegatePrompt = useCallback(
    (rawPrompt: string) => {
      const match = rawPrompt.trim().match(/^@([^\s,:;!?]+)\s*[:,]?\s*(.*)$/u)
      if (!match) return null

      const alias = normalizeToken(match[1])
      const target = AGENT_DEFINITIONS.find((agent) =>
        agent.aliases.some((entry) => normalizeToken(entry) === alias),
      )
      if (!target) return null

      const body = match[2].trim()
      const command: AgentCommand = {
        id: generateId(),
        target: target.id,
        raw: rawPrompt,
        body,
        intent: inferIntent(target.id, body),
        createdAt: new Date().toISOString(),
        seedName: extractSeedName(body),
      }

      setPendingCommands((current) => ({
        ...current,
        [target.id]: command,
      }))
      setPulses((current) => ({
        ...current,
        [target.id]: {
          tone: 'delegated',
          detail: body || `Delegation aus Resonanz an ${target.title}`,
        },
      }))

      window.setTimeout(() => {
        navigate(target.route)
      }, 90)

      return command
    },
    [navigate],
  )

  const agents = useMemo<AgentViewModel[]>(() => {
    return AGENT_DEFINITIONS.map((agent) => {
      const pulse = pulses[agent.id]
      const pending = pendingCommands[agent.id]
      const steeringAgent = getBackendAgentDefinition(selectedBackendAgents[agent.id])
      const tone: AgentPulse = agent.id === activeAgentId ? (pulse?.tone === 'error' ? 'error' : pulse?.tone === 'busy' ? 'busy' : 'active') : pending ? 'delegated' : pulse?.tone || 'idle'
      const detail =
        agent.id === activeAgentId
          ? pulse?.detail || `${agent.title} ist im Fokus`
          : pending?.body || pulse?.detail || `${agent.title} wartet`

      return {
        ...agent,
        coreConstraints: buildCoreConstraints(agent, principles),
        systemPrompt: buildSystemPrompt(agent, principles),
        steeringAgent,
        status: {
          tone,
          label: mapStatusLabel(tone),
          detail: steeringAgent ? `${detail} · ${steeringAgent.name}` : detail,
        },
      }
    })
  }, [activeAgentId, pendingCommands, principles, pulses, selectedBackendAgents])

  const value = useMemo<AgentRuntimeValue>(
    () => ({
      agents,
      activeAgentId,
      backendAgents: BACKEND_AGENTS_MATRIX,
      principles,
      principlesReady: Boolean(principles),
      navigateToAgent,
      delegatePrompt,
      pendingCommands,
      consumePendingCommand,
      setAgentPulse,
      selectBackendAgent,
    }),
    [
      activeAgentId,
      agents,
      selectBackendAgent,
      consumePendingCommand,
      delegatePrompt,
      navigateToAgent,
      pendingCommands,
      principles,
      setAgentPulse,
    ],
  )

  return <AgentRuntimeContext.Provider value={value}>{children}</AgentRuntimeContext.Provider>
}

export function useAgentRuntime() {
  const context = useContext(AgentRuntimeContext)
  if (!context) {
    throw new Error('useAgentRuntime must be used within AgentRuntimeProvider')
  }
  return context
}

export function useAgentNode(agentId: AgentId) {
  const runtime = useAgentRuntime()
  const agent = runtime.agents.find((entry) => entry.id === agentId)
  if (!agent) {
    throw new Error(`Unknown agent node: ${agentId}`)
  }

  return {
    ...runtime,
    agent,
    pendingCommand: runtime.pendingCommands[agentId] || null,
  }
}
