import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { backendFetch, backendUrlFor } from '../lib/backend'

const ARG_TOKEN_RE = /^[\w\-./:+@=]+$/
const POLL_INTERVAL = 5000
const DEFAULT_TIMEOUT = 60

 type DevJob = {
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

async function emitTelemetry(event: string, data: Record<string, unknown>) {
  try {
    await backendFetch('/api/dev/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data })
    })
  } catch (error) {
    // Telemetrie darf Fehler nicht weiterreichen
  }
}

export default function DevConsolePage() {
  const [commands, setCommands] = useState<string[]>([])
  const [selectedCommand, setSelectedCommand] = useState('')
  const [argsInput, setArgsInput] = useState('')
  const [timeoutSec, setTimeoutSec] = useState<number>(DEFAULT_TIMEOUT)
  const [dryRun, setDryRun] = useState(false)
  const [jobs, setJobs] = useState<DevJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [abortingId, setAbortingId] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)

  const resetLogStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setLogLines([])
  }, [])

  const fetchRoot = useCallback(async () => {
    try {
      const res = await backendFetch('/api/dev')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (Array.isArray(data?.commands)) {
        setCommands(data.commands)
        if (!selectedCommand && data.commands.length > 0) {
          setSelectedCommand(data.commands[0])
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Dev-API nicht erreichbar (DEV_MODE?).')
    }
  }, [selectedCommand])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await backendFetch('/api/dev/jobs')
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as DevJob[]
      setJobs(data)
    } catch (err: any) {
      setError(err?.message || 'Jobliste konnte nicht geladen werden.')
    }
  }, [])

  const fetchLog = useCallback(async (jobId: string, tail = 400) => {
    try {
      const res = await backendFetch(`/api/dev/jobs/${jobId}/log?tail=${tail}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (Array.isArray(data?.lines)) {
        setLogLines(data.lines)
      }
    } catch (err) {
      // ignorieren – Log bleibt ggf. leer
    }
  }, [])

  useEffect(() => {
    void fetchRoot()
    void fetchJobs()
    const id = window.setInterval(() => {
      void fetchJobs()
    }, POLL_INTERVAL)
    return () => {
      window.clearInterval(id)
      resetLogStream()
    }
  }, [fetchJobs, fetchRoot, resetLogStream])

  useEffect(() => {
    if (selectedJobId && !eventSourceRef.current) {
      void fetchLog(selectedJobId)
    }
  }, [fetchLog, jobs, selectedJobId])

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
    async (jobId: string, withStream: boolean) => {
      resetLogStream()
      void emitTelemetry('stream_opened', { job_id: jobId, live: withStream })
      void fetchLog(jobId)
      if (!withStream) return
      const streamUrl = await backendUrlFor(`/api/dev/jobs/${jobId}/stream`)
      const source = new EventSource(streamUrl)
      eventSourceRef.current = source
      source.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { line: string }
          setLogLines((prev) => [...prev, payload.line])
        } catch {
          // ignore
        }
      })
      source.addEventListener('status', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data)
          void emitTelemetry('job_stream_completed', { job_id: jobId, status: payload.status })
        } catch {
          void emitTelemetry('job_stream_completed', { job_id: jobId, status: 'unknown' })
        }
        void fetchJobs()
        resetLogStream()
      })
      source.onerror = () => {
        void emitTelemetry('stream_error', { job_id: jobId })
        resetLogStream()
        source.close()
      }
    },
    [fetchJobs, fetchLog, resetLogStream],
  )

  const handleSubmit = useCallback(
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
      setLoading(true)
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
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        setSelectedJobId(data.job_id)
        await fetchJobs()
        void openLogStream(data.job_id, !dryRun)
      } catch (err: any) {
        setError(err?.message || 'Job konnte nicht gestartet werden.')
      } finally {
        setLoading(false)
      }
    },
    [argsInput, dryRun, fetchJobs, openLogStream, selectedCommand, timeoutSec],
  )

  const handleSelectJob = useCallback(
    async (jobId: string) => {
      setSelectedJobId(jobId)
      await emitTelemetry('job_view_opened', { job_id: jobId })
      const job = jobs.find((item) => item.job_id === jobId)
      const live = job ? job.status === 'running' || job.status === 'queued' : false
      void openLogStream(jobId, live)
    },
    [jobs, openLogStream],
  )

  const handleAbort = useCallback(
    async (jobId: string) => {
      setAbortingId(jobId)
      try {
        await emitTelemetry('job_abort_clicked', { job_id: jobId })
        const res = await backendFetch(`/api/dev/jobs/${jobId}/abort`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        await fetchJobs()
      } catch (err: any) {
        setError(err?.message || 'Abbruch fehlgeschlagen.')
      } finally {
        setAbortingId(null)
      }
    },
    [fetchJobs],
  )

  const renderStatusBadge = useCallback((status: string) => {
    const base = 'rounded-full px-2 py-0.5 text-xs'
    switch (status) {
      case 'ok':
        return <span className={`${base} bg-forest/10 text-forest`}>ok</span>
      case 'running':
        return <span className={`${base} bg-amber-100 text-amber-700 animate-pulse`}>running</span>
      case 'timeout':
      case 'killed':
        return <span className={`${base} bg-red-100 text-red-700`}>{status}</span>
      case 'fail':
        return <span className={`${base} bg-red-50 text-red-600`}>fail</span>
      default:
        return <span className={`${base} bg-stone-200 text-smoke`}>{status}</span>
    }
  }, [])

  return (
    <div className="min-h-screen bg-paper p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-2xl bg-paper-grain p-6 shadow-soft-grain">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif">Dev-Konsole</h1>
            <p className="text-sm text-smoke">Whitelisted Commands starten, Logs verfolgen, Jobs verwalten.</p>
          </div>
        </header>

        <form className="grid gap-3 rounded-xl border border-stone bg-white p-4" onSubmit={handleSubmit}>
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
            <button type="submit" className="button-mystic transition-soft" disabled={loading || !selectedCommand}>
              {loading ? 'Starte…' : 'Job starten'}
            </button>
            {error && <span className="text-sm text-error">{error}</span>}
          </div>
        </form>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-stone bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <h2 className="text-lg font-serif">Jobs</h2>
              <button className="text-forest hover:underline text-xs" onClick={() => void fetchJobs()}>
                Aktualisieren
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {jobs.map((job) => (
                <div
                  key={job.job_id}
                  className={`rounded border px-3 py-2 text-sm transition-soft ${selectedJobId === job.job_id ? 'border-forest bg-forest/10' : 'border-stone bg-white'}`}
                >
                  <div className="flex items-center justify-between">
                    <button className="text-left font-medium text-ink hover:underline" onClick={() => void handleSelectJob(job.job_id)}>
                      {job.cmd} {job.args.join(' ')}
                    </button>
                    {renderStatusBadge(job.status)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-smoke">
                    <span>Timeout: {job.timeout_sec}s</span>
                    {job.status === 'running' && (
                      <button
                        className="rounded border border-stone px-2 py-0.5 text-xs text-smoke hover:border-forest hover:text-forest disabled:opacity-50"
                        disabled={abortingId === job.job_id}
                        onClick={() => void handleAbort(job.job_id)}
                      >
                        {abortingId === job.job_id ? 'Abbruch…' : 'Abbrechen'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {jobs.length === 0 && <p className="text-sm text-smoke">Keine Jobs vorhanden.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-stone bg-white p-4">
            <div className="mb-2 text-sm">
              <h2 className="text-lg font-serif">Logs</h2>
              {selectedJobId ? (
                <p className="text-xs text-smoke">Job {selectedJobId}</p>
              ) : (
                <p className="text-xs text-smoke">Job auswählen, um Logs zu sehen.</p>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto rounded border border-stone/50 bg-paper p-3 text-xs font-mono leading-relaxed">
              {logLines.length > 0 ? logLines.map((line, idx) => <div key={`${idx}-${line}`}>{line}</div>) : <span className="text-smoke">Noch keine Log-Ausgabe.</span>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
