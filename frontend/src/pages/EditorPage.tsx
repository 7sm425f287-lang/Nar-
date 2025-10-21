import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { backendFetch } from '../lib/backend'

type FsReadResponse = {
  path: string
  content: string
}

type FileSuggestion = {
  path: string
  updated_at: string
  size: number
}

function inferLanguage(path: string): string {
  if (path.endsWith('.md')) return 'markdown'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript'
  if (path.endsWith('.py')) return 'python'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.sh')) return 'shell'
  return 'plaintext'
}

export default function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const pathParam = searchParams.get('path') ?? ''

  const [pathInput, setPathInput] = useState(pathParam)
  const [content, setContent] = useState('')
  const [initialContent, setInitialContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<FileSuggestion[]>([])
  const [autosaveEnabled, setAutosaveEnabled] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const pendingMarker = useRef<string | null>(null)

  const applyMarker = useCallback(
    (msg: string | null) => {
      const editor = editorRef.current
      const monaco = monacoRef.current
      if (!editor || !monaco) {
        pendingMarker.current = msg
        return
      }
      const model = editor.getModel()
      if (!model) return
      const owner = 'narphi-editor'
      if (!msg) {
        monaco.editor.setModelMarkers(model, owner, [])
        return
      }
      monaco.editor.setModelMarkers(model, owner, [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: Math.max(1, model.getLineCount()),
          endColumn: 1,
          message: msg,
          severity: monaco.MarkerSeverity.Error,
        },
      ])
    },
    [],
  )

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      const pending = pendingMarker.current
      if (pending !== null) {
        pendingMarker.current = null
        applyMarker(pending)
      }
    },
    [applyMarker],
  )

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await backendFetch('/fs/list?limit=30')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data?.items)) {
        setSuggestions(data.items as FileSuggestion[])
      }
    } catch (err) {
      console.warn('Failed to load editor suggestions', err)
    }
  }, [])

  useEffect(() => {
    setPathInput(pathParam)
  }, [pathParam])

  useEffect(() => {
    if (!pathParam) {
      setContent('')
      setInitialContent('')
      return
    }

    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      applyMarker(null)
      setMessage(null)
      try {
        const res = await backendFetch(`/fs/read?path=${encodeURIComponent(pathParam)}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          const detail = await res.text()
          throw new Error(detail || `Fehler beim Laden (${res.status})`)
        }
        const data = (await res.json()) as FsReadResponse
        setContent(data.content ?? '')
        setInitialContent(data.content ?? '')
        applyMarker(null)
      } catch (err: any) {
        if (err.name === 'AbortError') return
        setError(err.message || 'Unbekannter Fehler beim Laden')
        applyMarker(err.message || 'Unbekannter Fehler beim Laden')
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [pathParam])

  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  const language = useMemo(() => inferLanguage(pathParam), [pathParam])
  const hasChanges = content !== initialContent
  const savedAtLabel = useMemo(() => {
    if (!savedAt) return null
    return new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [savedAt])

  const submitPath = (event: React.FormEvent) => {
    event.preventDefault()
    if (!pathInput.trim()) {
      setError('Bitte Pfad angeben (z. B. drafts/README.md)')
      return
    }
    setSearchParams({ path: pathInput.trim() })
  }

  const handleSave = useCallback(async () => {
    if (!pathParam) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await backendFetch('/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathParam, content }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(detail || `Speichern fehlgeschlagen (${res.status})`)
      }
      setInitialContent(content)
      setSavedAt(new Date().toISOString())
      applyMarker(null)
      loadSuggestions()
    } catch (err: any) {
      setError(err.message || 'Speichern fehlgeschlagen')
      applyMarker(err.message || 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }, [applyMarker, content, loadSuggestions, pathParam])

  useEffect(() => {
    if (!autosaveEnabled || !pathParam || !hasChanges || saving || loading) {
      return
    }
    const timer = window.setTimeout(() => {
      void handleSave()
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [autosaveEnabled, handleSave, hasChanges, loading, pathParam, saving])

  return (
    <div className="min-h-screen bg-paper p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-2xl bg-paper-grain p-6 shadow-soft-grain">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif">Editor</h1>
            <p className="text-sm text-smoke">
              Lade Dateien aus <code>drafts/</code>, bearbeite und sichere sie zurück.
            </p>
          </div>
          <nav className="flex gap-3 text-sm">
            <Link to="/" className="text-forest hover:underline transition-soft">
              Chat
            </Link>
            <Link to="/chronik" className="text-forest hover:underline transition-soft">
              Chronik
            </Link>
            <Link to="/dev" className="text-forest hover:underline transition-soft">
              Dev
            </Link>
          </nav>
        </header>

        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submitPath}>
          <label className="flex flex-1 flex-col text-sm">
            <span className="mb-1 text-smoke">Pfad innerhalb der Whitelist</span>
            <input
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              placeholder="drafts/README.md"
              className="input-mystic"
              autoComplete="off"
              list="editor-path-suggestions"
            />
          </label>
          <div className="flex flex-shrink-0 items-end gap-2">
            <button type="submit" className="button-mystic transition-soft">
              Laden
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="button-mystic transition-soft"
              disabled={!pathParam || !hasChanges || saving || loading}
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </form>

        <div className="flex items-center gap-2 text-sm text-smoke">
          <input
            id="autosave-toggle"
            type="checkbox"
            checked={autosaveEnabled}
            onChange={(event) => setAutosaveEnabled(event.target.checked)}
            className="h-4 w-4 accent-forest"
          />
          <label htmlFor="autosave-toggle" className="cursor-pointer">
            Automatisch speichern (1,5 s nach Änderung)
          </label>
        </div>

        {suggestions.length > 0 && (
          <>
            <datalist id="editor-path-suggestions">
              {suggestions.map((item) => (
                <option key={item.path} value={item.path} />
              ))}
            </datalist>
            <div className="rounded-xl border border-stone/50 bg-white/70 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-smoke">
                <span>Zuletzt bearbeitet</span>
                <button
                  type="button"
                  onClick={loadSuggestions}
                  className="text-forest underline-offset-2 hover:underline"
                >
                  Aktualisieren
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 8).map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => setSearchParams({ path: item.path })}
                    className="rounded-full border border-stone bg-paper px-3 py-1 text-xs transition-soft hover:border-forest hover:text-forest"
                  >
                    {item.path.split('/').slice(-2).join('/') || item.path}
                    <span className="ml-2 text-[11px] text-smoke">
                      {new Date(item.updated_at).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <div className="rounded border border-red-100 bg-red-50 p-3 text-red-700">{error}</div>}
        {message && <div className="rounded border border-forest/10 bg-forest/5 p-3 text-forest">{message}</div>}
        {savedAtLabel && (
          <p className="text-xs text-smoke">
            Gespeichert um {savedAtLabel}
          </p>
        )}

        <div className="rounded-xl border border-stone bg-white">
          <Editor
            height="70vh"
            language={language}
            value={content}
            onChange={(value) => setContent(value ?? '')}
            onMount={handleEditorMount}
            options={{
              readOnly: loading || !pathParam,
              minimap: { enabled: false },
              fontSize: 14,
              padding: { top: 12 },
            }}
            theme="vs-light"
          />
        </div>

        {pathParam ? (
          <p className="text-sm text-smoke">
            Bearbeitet: <code>{pathParam}</code> {loading && '(lädt…)'}
          </p>
        ) : (
          <p className="text-sm text-smoke">
            Wähle einen Pfad wie <code>drafts/README.md</code>, um den Inhalt zu laden.
          </p>
        )}
      </div>
    </div>
  )
}
