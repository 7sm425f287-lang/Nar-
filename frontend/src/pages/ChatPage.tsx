import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { backendFetch } from '../lib/backend'

type ChatStatus = 'idle' | 'sending' | 'receiving' | 'error'

type Message = { id: string; role: 'user' | 'bot'; text: string }

const BACKOFF_MS = [300, 900, 1500]

const generateId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [lastRequestId, setLastRequestId] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const streamTimerRef = useRef<number | null>(null)

  const clearStreamTimer = useCallback(() => {
    if (streamTimerRef.current !== null) {
      window.clearTimeout(streamTimerRef.current)
      streamTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    abortRef.current?.abort()
    clearStreamTimer()
  }, [clearStreamTimer])

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message])
  }, [])

  const updateMessageText = useCallback((id: string, text: string) => {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, text } : msg)))
  }, [])

  const streamReply = useCallback(
    (reply: string) => {
      const botMessage: Message = { id: generateId(), role: 'bot', text: '' }
      appendMessage(botMessage)

      if (!reply) {
        setStatus('idle')
        return
      }

      setStatus('receiving')
      const total = reply.length
      const stepDelay = Math.min(90, Math.max(22, 12000 / total))
      let index = 0

      const tick = () => {
        index += 1
        updateMessageText(botMessage.id, reply.slice(0, index))
        if (index < total) {
          streamTimerRef.current = window.setTimeout(tick, stepDelay)
        } else {
          clearStreamTimer()
          setStatus('idle')
        }
      }

      tick()
    },
    [appendMessage, clearStreamTimer, updateMessageText],
  )

  const sendMessage = useCallback(
    async (prompt: string, attempt = 0) => {
      abortRef.current?.abort()
      clearStreamTimer()

      const controller = new AbortController()
      abortRef.current = controller

      setStatus('sending')
      setError(null)
      setLatency(null)

      const startedAt = performance.now()

      try {
        const res = await backendFetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt }),
          signal: controller.signal,
        })

        const requestIdHeader = res.headers.get('X-Request-ID')

        if (!res.ok) {
          const detail = await res.text()
          throw new Error(detail || `Request fehlgeschlagen (${res.status})`)
        }

        const data = await res.json()
        const duration = Math.round(performance.now() - startedAt)
        setLatency(duration)

        const computedRequestId = (data?.request_id as string | undefined) || requestIdHeader || null
        setLastRequestId(computedRequestId)

        streamReply(String(data?.reply ?? ''))
      } catch (err: any) {
        if (controller.signal.aborted) {
          setStatus('idle')
          setError('Abgebrochen.')
        } else if (attempt < BACKOFF_MS.length) {
          const delay = BACKOFF_MS[attempt]
          setError(`Versuch ${attempt + 1} fehlgeschlagen – neuer Versuch in ${delay} ms.`)
          window.setTimeout(() => {
            void sendMessage(prompt, attempt + 1)
          }, delay)
          return
        } else {
          const duration = Math.round(performance.now() - startedAt)
          setLatency(duration)
          setStatus('error')
          setError(err?.message || 'Unbekannter Fehler')
        }
      } finally {
        abortRef.current = null
      }
    },
    [clearStreamTimer, streamReply],
  )

  const isBusy = status === 'sending' || status === 'receiving'

  const send = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault()
      if (isBusy) return
      const prompt = input.trim()
      if (!prompt) return
      const userMessage: Message = { id: generateId(), role: 'user', text: prompt }
      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setLastPrompt(prompt)
      setLastRequestId(null)
      setError(null)
      setLatency(null)
      void sendMessage(prompt, 0)
    },
    [input, isBusy, sendMessage],
  )

  const handleRetry = useCallback(() => {
    if (!lastPrompt) return
    setError(null)
    setLatency(null)
    setLastRequestId(null)
    void sendMessage(lastPrompt, 0)
  }, [lastPrompt, sendMessage])

  const handleAbort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    clearStreamTimer()
    setStatus('idle')
    setError('Abgebrochen.')
  }, [clearStreamTimer])

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'sending':
        return 'Senden…'
      case 'receiving':
        return 'Empfangen…'
      case 'error':
        return 'Fehlgeschlagen'
      default:
        return 'Bereit'
    }
  }, [status])

  const showRetry = status === 'error' && Boolean(lastPrompt)

  return (
    <div className="min-h-screen flex items-start justify-center bg-paper p-6">
      <div className="w-full max-w-3xl bg-paper-grain shadow-soft-grain rounded-2xl p-6 relative vignette">
        <div className="lightpoint" aria-hidden="true"></div>
        <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/seal.svg" alt="seal" width="44" height="44" aria-hidden="true" />
            <div>
              <h1 className="text-3xl font-serif">Nar φ</h1>
              <p className="text-sm text-smoke">Ein ruhiger Ort für Forschung und Gespräch</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {latency !== null && (
              <span className="rounded-full border border-forest/40 bg-forest/10 px-3 py-1 text-xs text-forest">
                Latenz {latency} ms
              </span>
            )}
            <nav className="flex gap-3 text-sm">
              <Link to="/editor" className="text-forest hover:underline transition-soft">
                Editor
              </Link>
              <Link to="/chronik" className="text-forest hover:underline transition-soft">
                Chronik
              </Link>
              <Link to="/dev" className="text-forest hover:underline transition-soft">
                Dev
              </Link>
            </nav>
          </div>
        </header>

        <div className="mb-3 text-xs uppercase tracking-wide text-smoke">{statusLabel}</div>

        {error && (
          <div className="mb-3 space-y-2 rounded border border-red-100 bg-red-50 p-3 text-red-700">
            <div>{error}</div>
            {lastRequestId && <div className="text-xs text-smoke">Request-ID: {lastRequestId}</div>}
            {showRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full border border-forest/40 bg-forest/5 px-3 py-1 text-xs text-forest transition-soft hover:bg-forest/10"
              >
                Erneut versuchen
              </button>
            )}
          </div>
        )}

        <main className="min-h-[260px] border border-stone rounded-lg p-4 mb-4 bg-white">
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                <div className={message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>{message.text}</div>
              </div>
            ))}
            {status === 'sending' && <div className="text-sm text-smoke">Senden…</div>}
            {status === 'receiving' && <div className="text-sm text-smoke">Empfangen…</div>}
          </div>
        </main>

        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={send}>
          <div className="flex-1">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              className="w-full input-mystic"
              placeholder="Schreibe eine Nachricht…"
              aria-label="message"
              disabled={isBusy}
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button type="submit" className="button-mystic transition-soft" disabled={isBusy}>
              {isBusy ? 'Sende…' : 'Senden'}
            </button>
            <button
              type="button"
              onClick={handleAbort}
              className="rounded-full border border-stone px-3 py-2 text-sm text-smoke transition-soft hover:border-forest hover:text-forest disabled:opacity-50"
              disabled={!isBusy}
            >
              Stop
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
