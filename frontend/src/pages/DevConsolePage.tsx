import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import AgentField from '../components/AgentField'
import { backendFetch, backendUrlFor } from '../lib/backend'
import { useAgentNode } from '../lib/agent-runtime'

const ARG_TOKEN_RE = /^[\w\-./:+@=]+$/
const POLL_INTERVAL = 5000
const DEFAULT_TIMEOUT = 60
const PLANNER_OUTPUT_FALLBACK = 'drafts/social'
const PLANNER_PLATFORMS = [
  { id: 'instagram', label: 'Instagram Reel' },
  { id: 'tiktok', label: 'TikTok Clip' },
  { id: 'youtube-shorts', label: 'YouTube Short' },
] as const

type ShellJob = {
  job_id: string
  cmd: string
  args: string[]
  cwd: string
  status: string
  exit_code: number | null
  dry_run: boolean
  created_at: string | null
  started_at: string | null
  ended_at: string | null
  timeout_sec: number
}

type PlannerJob = {
  job_id: string
  campaign_name: string
  tone: string
  platforms: string[]
  sources: string[]
  output_dir: string
  output_paths: string[]
  status: string
  exit_code: number | null
  dry_run: boolean
  created_at: string | null
  started_at: string | null
  ended_at: string | null
  timeout_sec: number
  max_posts: number
}

type ConsoleJobKind = 'shell' | 'planner'

type ConsoleJob = {
  kind: ConsoleJobKind
  job_id: string
  title: string
  subtitle: string
  status: string
  exit_code: number | null
  dry_run: boolean
  created_at: string | null
  started_at: string | null
  ended_at: string | null
  timeout_sec: number
  detailLine: string
  outputPaths: string[]
}

type SelectedJob = {
  kind: ConsoleJobKind
  jobId: string
}

async function emitTelemetry(event: string, data: Record<string, unknown>) {
  try {
    await backendFetch('/api/dev/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data }),
    })
  } catch {
    // Telemetrie darf Fehler nicht weiterreichen
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  const raw = await response.text()
  if (!raw) return fallback
  try {
    const data = JSON.parse(raw) as { detail?: unknown }
    if (typeof data.detail === 'string') return data.detail
  } catch {
    // noop
  }
  return raw
}

function parsePlannerSources(input: string) {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function plannerPath(kind: ConsoleJobKind, jobId: string, suffix = '') {
  const base = kind === 'planner' ? `/api/dev/planner/jobs/${jobId}` : `/api/dev/jobs/${jobId}`
  return `${base}${suffix}`
}

function sortJobsByNewest(a: { created_at: string | null }, b: { created_at: string | null }) {
  const aTime = a.created_at ? Date.parse(a.created_at) : 0
  const bTime = b.created_at ? Date.parse(b.created_at) : 0
  return bTime - aTime
}

function normalizeShellJob(job: ShellJob): ConsoleJob {
  const args = job.args.join(' ')
  return {
    kind: 'shell',
    job_id: job.job_id,
    title: args ? `${job.cmd} ${args}` : job.cmd,
    subtitle: `cwd: ${job.cwd}`,
    status: job.status,
    exit_code: job.exit_code,
    dry_run: job.dry_run,
    created_at: job.created_at,
    started_at: job.started_at,
    ended_at: job.ended_at,
    timeout_sec: job.timeout_sec,
    detailLine: `Timeout ${job.timeout_sec}s`,
    outputPaths: [],
  }
}

function normalizePlannerJob(job: PlannerJob): ConsoleJob {
  const platforms = job.platforms.join(' · ')
  const target = job.output_paths[0] || job.output_dir
  return {
    kind: 'planner',
    job_id: job.job_id,
    title: job.campaign_name,
    subtitle: platforms || 'Kunzt.Freiheit Planner',
    status: job.status,
    exit_code: job.exit_code,
    dry_run: job.dry_run,
    created_at: job.created_at,
    started_at: job.started_at,
    ended_at: job.ended_at,
    timeout_sec: job.timeout_sec,
    detailLine: `${job.max_posts} Posts · ${target}`,
    outputPaths: job.output_paths,
  }
}

export default function DevConsolePage() {
  const { pendingCommand, consumePendingCommand, setAgentPulse } = useAgentNode('dev')
  const [commands, setCommands] = useState<string[]>([])
  const [selectedCommand, setSelectedCommand] = useState('')
  const [argsInput, setArgsInput] = useState('')
  const [timeoutSec, setTimeoutSec] = useState<number>(DEFAULT_TIMEOUT)
  const [dryRun, setDryRun] = useState(false)
  const [shellJobs, setShellJobs] = useState<ShellJob[]>([])
  const [plannerJobs, setPlannerJobs] = useState<PlannerJob[]>([])
  const [plannerCampaignName, setPlannerCampaignName] = useState('Release-Orbit')
  const [plannerTone, setPlannerTone] = useState('klar, druckvoll, warm')
  const [plannerSourcesInput, setPlannerSourcesInput] = useState('')
  const [plannerOutputDir, setPlannerOutputDir] = useState(PLANNER_OUTPUT_FALLBACK)
  const [plannerTimeoutSec, setPlannerTimeoutSec] = useState<number>(DEFAULT_TIMEOUT)
  const [plannerDryRun, setPlannerDryRun] = useState(false)
  const [plannerMaxPosts, setPlannerMaxPosts] = useState<number>(3)
  const [plannerPlatforms, setPlannerPlatforms] = useState<string[]>(() =>
    PLANNER_PLATFORMS.map((platform) => platform.id),
  )
  const [loadingShell, setLoadingShell] = useState(false)
  const [loadingPlanner, setLoadingPlanner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<SelectedJob | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [abortingKey, setAbortingKey] = useState<string | null>(null)
  const [agentNotice, setAgentNotice] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)

  const closeLogStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  const resetLogView = useCallback(() => {
    closeLogStream()
    setLogLines([])
  }, [closeLogStream])

  const fetchCapabilities = useCallback(async () => {
    try {
      const [devRes, plannerRes] = await Promise.all([
        backendFetch('/api/dev'),
        backendFetch('/api/dev/planner'),
      ])

      if (!devRes.ok) {
        throw new Error(await readErrorMessage(devRes, 'Dev-API nicht erreichbar (DEV_MODE?).'))
      }
      if (!plannerRes.ok) {
        throw new Error(await readErrorMessage(plannerRes, 'Planner-API nicht erreichbar.'))
      }

      const devData = await devRes.json()
      const plannerData = await plannerRes.json()

      if (Array.isArray(devData?.commands)) {
        setCommands(devData.commands)
        if (!selectedCommand && devData.commands.length > 0) {
          setSelectedCommand(devData.commands[0])
        }
      }

      if (typeof plannerData?.default_output_dir === 'string') {
        setPlannerOutputDir((current) => current || plannerData.default_output_dir || PLANNER_OUTPUT_FALLBACK)
      }
    } catch (err: any) {
      setError(err?.message || 'Dev-Konsole konnte nicht initialisiert werden.')
    }
  }, [selectedCommand])

  const fetchJobs = useCallback(async () => {
    try {
      const [shellRes, plannerRes] = await Promise.all([
        backendFetch('/api/dev/jobs'),
        backendFetch('/api/dev/planner/jobs'),
      ])

      if (!shellRes.ok) {
        throw new Error(await readErrorMessage(shellRes, 'Jobliste konnte nicht geladen werden.'))
      }
      if (!plannerRes.ok) {
        throw new Error(await readErrorMessage(plannerRes, 'Planner-Jobs konnten nicht geladen werden.'))
      }

      const nextShellJobs = (await shellRes.json()) as ShellJob[]
      const nextPlannerJobs = (await plannerRes.json()) as PlannerJob[]
      setShellJobs(nextShellJobs)
      setPlannerJobs(nextPlannerJobs)
    } catch (err: any) {
      setError(err?.message || 'Jobliste konnte nicht geladen werden.')
    }
  }, [])

  const fetchLog = useCallback(async (kind: ConsoleJobKind, jobId: string, tail = 400) => {
    try {
      const res = await backendFetch(`${plannerPath(kind, jobId, '/log')}?tail=${tail}`)
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Log konnte nicht geladen werden.'))
      const data = await res.json()
      if (Array.isArray(data?.lines)) {
        setLogLines(data.lines)
      }
    } catch {
      // Log bleibt ggf. leer
    }
  }, [])

  useEffect(() => {
    void fetchCapabilities()
    void fetchJobs()
    const id = window.setInterval(() => {
      void fetchJobs()
    }, POLL_INTERVAL)
    return () => {
      window.clearInterval(id)
      closeLogStream()
    }
  }, [closeLogStream, fetchCapabilities, fetchJobs])

  useEffect(() => {
    if (selectedJob && !eventSourceRef.current) {
      void fetchLog(selectedJob.kind, selectedJob.jobId)
    }
  }, [fetchLog, selectedJob])

  useEffect(() => {
    const tone = error ? 'error' : loadingShell || loadingPlanner ? 'busy' : 'active'
    const detail =
      error ||
      (loadingPlanner
        ? 'Planner wird gezuendet'
        : loadingShell
          ? 'Shell-Job wird gezuendet'
          : selectedJob
            ? `Live-Fokus: ${selectedJob.kind}`
            : 'Kontrollierte Worker stehen bereit')
    setAgentPulse('dev', tone, detail)
    return () => {
      setAgentPulse('dev', 'idle', 'Runner in Reserve')
    }
  }, [error, loadingPlanner, loadingShell, selectedJob, setAgentPulse])

  useEffect(() => {
    if (!pendingCommand) return
    setAgentNotice(`Alpha delegierte an Dev: ${pendingCommand.body || 'Protokolle und Worker uebernehmen.'}`)
    consumePendingCommand('dev')
  }, [consumePendingCommand, pendingCommand])

  const consoleJobs = useMemo(() => {
    const normalized = [
      ...plannerJobs.map(normalizePlannerJob),
      ...shellJobs.map(normalizeShellJob),
    ]
    return normalized.sort(sortJobsByNewest)
  }, [plannerJobs, shellJobs])

  const selectedConsoleJob = useMemo(() => {
    if (!selectedJob) return null
    return (
      consoleJobs.find(
        (job) => job.kind === selectedJob.kind && job.job_id === selectedJob.jobId,
      ) || null
    )
  }, [consoleJobs, selectedJob])

  const commandOptions = useMemo(
    () =>
      commands.map((cmd) => (
        <option key={cmd} value={cmd}>
          {cmd}
        </option>
      )),
    [commands],
  )

  const openLogStream = useCallback(
    async (kind: ConsoleJobKind, jobId: string, withStream: boolean) => {
      resetLogView()
      void emitTelemetry('stream_opened', { job_id: jobId, kind, live: withStream })
      void fetchLog(kind, jobId)
      if (!withStream) return

      const streamUrl = await backendUrlFor(plannerPath(kind, jobId, '/stream'))
      const source = new EventSource(streamUrl)
      eventSourceRef.current = source

      source.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { line: string }
          setLogLines((prev) => [...prev, payload.line])
        } catch {
          // ignore malformed chunks
        }
      })

      source.addEventListener('status', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { status?: string }
          void emitTelemetry('job_stream_completed', { job_id: jobId, kind, status: payload.status || 'unknown' })
        } catch {
          void emitTelemetry('job_stream_completed', { job_id: jobId, kind, status: 'unknown' })
        }
        void fetchJobs()
        closeLogStream()
      })

      source.onerror = () => {
        void emitTelemetry('stream_error', { job_id: jobId, kind })
        closeLogStream()
      }
    },
    [closeLogStream, fetchJobs, fetchLog, resetLogView],
  )

  const handleShellSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!selectedCommand) {
        setError('Kein Command gewählt.')
        return
      }

      const args = argsInput.trim() ? argsInput.trim().split(/\s+/) : []
      if (args.some((token) => !ARG_TOKEN_RE.test(token))) {
        setError('Argument enthält unzulässige Zeichen.')
        return
      }

      setLoadingShell(true)
      setError(null)

      const payload = {
        cmd: selectedCommand,
        args,
        timeout_sec: timeoutSec,
        dry_run: dryRun,
      }

      try {
        await emitTelemetry('job_start_clicked', payload)
        const res = await backendFetch('/api/dev/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Job konnte nicht gestartet werden.'))
        const data = await res.json()
        setSelectedJob({ kind: 'shell', jobId: data.job_id })
        await fetchJobs()
        void openLogStream('shell', data.job_id, !dryRun)
      } catch (err: any) {
        setError(err?.message || 'Job konnte nicht gestartet werden.')
      } finally {
        setLoadingShell(false)
      }
    },
    [argsInput, dryRun, fetchJobs, openLogStream, selectedCommand, timeoutSec],
  )

  const handlePlannerSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!plannerCampaignName.trim()) {
        setError('Campaign-Name fehlt.')
        return
      }
      if (plannerPlatforms.length === 0) {
        setError('Mindestens eine Plattform muss aktiv sein.')
        return
      }

      setLoadingPlanner(true)
      setError(null)

      const payload = {
        campaign_name: plannerCampaignName.trim(),
        tone: plannerTone.trim() || 'klar, druckvoll, warm',
        platforms: plannerPlatforms,
        sources: parsePlannerSources(plannerSourcesInput),
        output_dir: plannerOutputDir.trim() || undefined,
        max_posts: plannerMaxPosts,
        timeout_sec: plannerTimeoutSec,
        dry_run: plannerDryRun,
      }

      try {
        await emitTelemetry('planner_start_clicked', payload)
        const res = await backendFetch('/api/dev/planner/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Planner konnte nicht gestartet werden.'))
        const data = await res.json()
        setSelectedJob({ kind: 'planner', jobId: data.job_id })
        await fetchJobs()
        void openLogStream('planner', data.job_id, !plannerDryRun)
      } catch (err: any) {
        setError(err?.message || 'Planner konnte nicht gestartet werden.')
      } finally {
        setLoadingPlanner(false)
      }
    },
    [
      fetchJobs,
      openLogStream,
      plannerCampaignName,
      plannerDryRun,
      plannerMaxPosts,
      plannerOutputDir,
      plannerPlatforms,
      plannerSourcesInput,
      plannerTimeoutSec,
      plannerTone,
    ],
  )

  const handleSelectJob = useCallback(
    async (job: ConsoleJob) => {
      setSelectedJob({ kind: job.kind, jobId: job.job_id })
      await emitTelemetry('job_view_opened', { job_id: job.job_id, kind: job.kind })
      const live = job.status === 'running' || job.status === 'queued'
      void openLogStream(job.kind, job.job_id, live)
    },
    [openLogStream],
  )

  const handleAbort = useCallback(
    async (job: ConsoleJob) => {
      const key = `${job.kind}:${job.job_id}`
      setAbortingKey(key)
      try {
        await emitTelemetry('job_abort_clicked', { job_id: job.job_id, kind: job.kind })
        const res = await backendFetch(plannerPath(job.kind, job.job_id, '/abort'), { method: 'POST' })
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Abbruch fehlgeschlagen.'))
        await fetchJobs()
      } catch (err: any) {
        setError(err?.message || 'Abbruch fehlgeschlagen.')
      } finally {
        setAbortingKey(null)
      }
    },
    [fetchJobs],
  )

  const togglePlatform = useCallback((platformId: string) => {
    setPlannerPlatforms((current) => {
      if (current.includes(platformId)) {
        return current.filter((item) => item !== platformId)
      }
      return [...current, platformId]
    })
  }, [])

  const renderStatusBadge = useCallback((status: string) => {
    const base = 'rounded-full px-2 py-0.5 text-xs'
    switch (status) {
      case 'ok':
        return <span className={`${base} bg-forest/10 text-forest`}>ok</span>
      case 'running':
        return <span className={`${base} animate-pulse bg-amber-100 text-amber-700`}>running</span>
      case 'timeout':
      case 'killed':
        return <span className={`${base} bg-red-100 text-red-700`}>{status}</span>
      case 'fail':
        return <span className={`${base} bg-red-50 text-red-600`}>fail</span>
      default:
        return <span className={`${base} bg-stone-200 text-smoke`}>{status}</span>
    }
  }, [])

  const renderKindBadge = useCallback((kind: ConsoleJobKind) => {
    if (kind === 'planner') {
      return (
        <span className="rounded-full border border-earth-ocker/40 bg-earth-ocker/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-earth-umbra">
          Planner
        </span>
      )
    }
    return (
      <span className="rounded-full border border-stone bg-stone-50 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-smoke">
        Shell
      </span>
    )
  }, [])

  return (
    <div className="min-h-screen bg-paper p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-2xl bg-paper-grain p-6 shadow-soft-grain">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif">Dev-Konsole</h1>
            <p className="text-sm text-smoke">
              Kontrollierte Worker, whitelisted Kommandos und Live-Protokolle unter voller DEV_MODE-Grenze.
            </p>
          </div>
        </header>

        <AgentField agentId="dev" compact notice={agentNotice} />

        {error && (
          <div className="rounded border border-red-100 bg-red-50 p-3 text-red-700" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-earth-stein bg-white/90 p-5 shadow-soft">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-serif text-ink">Kunzt.Freiheit: Autonomer Planner</h2>
                <span className="rounded-full border border-earth-stein bg-earth-paper px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-smoke">
                  isoliert
                </span>
              </div>
              <p className="max-w-2xl text-sm text-smoke">
                Generiert strukturierte Social-Media-Entwürfe aus freigegebenen Quellen. Keine Publikations-Credentials,
                kein Zugriff auf <code>memory/</code>, Ausgabe nur innerhalb der Whitelist.
              </p>
            </div>
            <div className="rounded-xl border border-earth-stein/70 bg-earth-paper/70 px-4 py-3 text-sm text-earth-umbra">
              <div className="font-medium">Ausgabeziel</div>
              <div className="mt-1 font-mono text-xs">{plannerOutputDir || PLANNER_OUTPUT_FALLBACK}</div>
            </div>
          </div>

          <form className="grid gap-4" onSubmit={handlePlannerSubmit}>
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-smoke">Campaign</span>
                    <input
                      value={plannerCampaignName}
                      onChange={(event) => setPlannerCampaignName(event.target.value)}
                      className="input-mystic"
                      placeholder="Release-Orbit"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-smoke">Tonlage</span>
                    <input
                      value={plannerTone}
                      onChange={(event) => setPlannerTone(event.target.value)}
                      className="input-mystic"
                      placeholder="klar, druckvoll, warm"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-smoke">Quellenpfade (eine Zeile pro Datei, optional)</span>
                  <textarea
                    value={plannerSourcesInput}
                    onChange={(event) => setPlannerSourcesInput(event.target.value)}
                    className="input-mystic min-h-[148px]"
                    placeholder={'drafts/social/notes-20251015.md\nlogs/chronik/2025-10-15-workspace-editor.md'}
                  />
                </label>
              </div>

              <div className="grid gap-4 rounded-xl border border-earth-stein/70 bg-earth-paper/55 p-4">
                <div className="space-y-2">
                  <div className="text-sm text-smoke">Plattformen</div>
                  <div className="flex flex-wrap gap-2">
                    {PLANNER_PLATFORMS.map((platform) => {
                      const active = plannerPlatforms.includes(platform.id)
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          onClick={() => togglePlatform(platform.id)}
                          className={`rounded-full border px-3 py-1 text-sm transition-soft ${
                            active
                              ? 'border-earth-ocker bg-earth-ocker/10 text-earth-umbra'
                              : 'border-stone bg-white text-smoke hover:border-earth-stein'
                          }`}
                        >
                          {platform.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-smoke">Output-Verzeichnis</span>
                  <input
                    value={plannerOutputDir}
                    onChange={(event) => setPlannerOutputDir(event.target.value)}
                    className="input-mystic"
                    placeholder={PLANNER_OUTPUT_FALLBACK}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-smoke">Posts</span>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={plannerMaxPosts}
                      onChange={(event) => setPlannerMaxPosts(Number(event.target.value))}
                      className="input-mystic"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-smoke">Timeout (Sekunden)</span>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={plannerTimeoutSec}
                      onChange={(event) => setPlannerTimeoutSec(Number(event.target.value))}
                      className="input-mystic"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm text-smoke">
                  <input
                    type="checkbox"
                    checked={plannerDryRun}
                    onChange={(event) => setPlannerDryRun(event.target.checked)}
                    className="h-4 w-4 accent-forest"
                  />
                  Dry-Run (Draft-Ziel nur vorzeichnen)
                </label>

                <button type="submit" className="button-mystic transition-soft" disabled={loadingPlanner}>
                  {loadingPlanner ? 'Planner startet…' : 'Planner auslösen'}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <form className="grid gap-3 rounded-xl border border-stone bg-white p-4" onSubmit={handleShellSubmit}>
            <div>
              <h2 className="text-lg font-serif">Whitelisted Shell-Jobs</h2>
              <p className="mt-1 text-sm text-smoke">Gezielte Dev-Commands innerhalb des bestehenden Job-Runners.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-smoke">Command</span>
                <select
                  value={selectedCommand}
                  onChange={(event) => setSelectedCommand(event.target.value)}
                  className="input-mystic"
                >
                  {commandOptions}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-smoke">Args (space separated)</span>
                <input
                  value={argsInput}
                  onChange={(event) => setArgsInput(event.target.value)}
                  className="input-mystic"
                  placeholder="optional"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-smoke">Timeout (Sekunden)</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={timeoutSec}
                  onChange={(event) => setTimeoutSec(Number(event.target.value))}
                  className="input-mystic"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-smoke">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                  className="h-4 w-4 accent-forest"
                />
                Dry-Run (nur registrieren)
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="button-mystic transition-soft" disabled={loadingShell || !selectedCommand}>
                {loadingShell ? 'Starte…' : 'Shell-Job starten'}
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-earth-stein bg-earth-paper/60 p-4">
            <h2 className="text-lg font-serif">Steuerlogik</h2>
            <div className="mt-3 space-y-3 text-sm text-smoke">
              <p>
                Beide Worker-Typen laufen unter derselben <code>DEV_MODE</code>-Schranke und liefern Logs über denselben
                Echtzeitkanal zurück.
              </p>
              <p>
                Abort greift sofort für laufende Planner- und Shell-Jobs. Fertige Planner-Drafts erscheinen direkt im
                Zielpfad und bleiben manuell review-pflichtig.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-stone bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <h2 className="text-lg font-serif">Jobs</h2>
              <button className="text-forest text-xs hover:underline" onClick={() => void fetchJobs()}>
                Aktualisieren
              </button>
            </div>
            <div className="max-h-[30rem] space-y-2 overflow-y-auto">
              {consoleJobs.map((job) => {
                const jobKey = `${job.kind}:${job.job_id}`
                const selectedKey = selectedJob ? `${selectedJob.kind}:${selectedJob.jobId}` : null
                const canAbort = job.status === 'running' || job.status === 'queued'
                return (
                  <div
                    key={jobKey}
                    className={`rounded border px-3 py-3 text-sm transition-soft ${
                      selectedKey === jobKey ? 'border-forest bg-forest/10' : 'border-stone bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="flex-1 text-left"
                        onClick={() => void handleSelectJob(job)}
                      >
                        <div className="flex items-center gap-2">
                          {renderKindBadge(job.kind)}
                          {renderStatusBadge(job.status)}
                        </div>
                        <div className="mt-2 font-medium text-ink">{job.title}</div>
                        <div className="mt-1 text-xs text-smoke">{job.subtitle}</div>
                        <div className="mt-2 text-xs text-smoke">{job.detailLine}</div>
                        {job.outputPaths.length > 0 && (
                          <div className="mt-2 rounded border border-earth-stein/70 bg-earth-paper/80 px-2 py-1 font-mono text-[11px] text-earth-umbra">
                            {job.outputPaths[0]}
                          </div>
                        )}
                      </button>
                      {canAbort && (
                        <button
                          className="rounded border border-stone px-2 py-1 text-xs text-smoke transition-soft hover:border-forest hover:text-forest disabled:opacity-50"
                          disabled={abortingKey === jobKey}
                          onClick={() => void handleAbort(job)}
                        >
                          {abortingKey === jobKey ? 'Abbruch…' : 'Abbrechen'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {consoleJobs.length === 0 && <p className="text-sm text-smoke">Keine Jobs vorhanden.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-stone bg-white p-4">
            <div className="mb-2 text-sm">
              <h2 className="text-lg font-serif">Live-Protokoll</h2>
              {selectedConsoleJob ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-smoke">
                  {renderKindBadge(selectedConsoleJob.kind)}
                  <span>{selectedConsoleJob.title}</span>
                  <span>·</span>
                  <span>{selectedConsoleJob.job_id}</span>
                </div>
              ) : (
                <p className="text-xs text-smoke">Job auswählen, um Logs und Planner-Entwürfe live zu verfolgen.</p>
              )}
            </div>
            <div className="max-h-[30rem] overflow-y-auto rounded border border-stone/50 bg-paper p-3 font-mono text-xs leading-relaxed">
              {logLines.length > 0 ? (
                logLines.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
              ) : (
                <span className="text-smoke">Noch keine Log-Ausgabe.</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
