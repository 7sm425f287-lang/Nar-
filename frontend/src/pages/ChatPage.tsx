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
  const hasMessages = messages.length > 0
  const flowMarkerCount = status === 'receiving' ? 7 : 5
  const statusTone =
    status === 'receiving'
      ? 'Resonanz im Fluss'
      : status === 'sending'
        ? 'Impuls wird geordnet'
        : hasMessages
          ? 'Gespräch im ruhigen Takt'
          : 'Raum für einen ersten Impuls'

  return (
    <div className="sanctum-page px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="sanctum-shell bg-paper-grain shadow-soft-grain vignette rounded-[2rem] p-5 sm:p-8">
        <div className="lightpoint" aria-hidden="true"></div>
        <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="seal-sanctum hidden shrink-0 sm:grid" aria-hidden="true">
              <div className="seal-halo"></div>
              <img src="/assets/seal.svg" alt="seal" className="seal-core" />
            </div>
            <div>
              <div className="mb-3 flow-marker-row" aria-hidden="true">
                {Array.from({ length: flowMarkerCount }).map((_, index) => (
                  <span
                    key={`header-marker-${index}`}
                    className="flow-marker"
                    style={{ animationDelay: `${index * 180}ms` }}
                  />
                ))}
              </div>
              <div className="mb-2 text-[11px] uppercase tracking-[0.34em] text-smoke">
                kunzt.freiheit interface
              </div>
              <h1 className="text-4xl leading-none sm:text-6xl">Mφrlin</h1>
              <p className="mt-3 max-w-2xl text-base leading-8 text-smoke sm:text-lg">
                Ein stilles Kraftzentrum für Sprache, Ordnung und Resonanz. Weniger Oberfläche, mehr
                innere Frequenz.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="status-rune">
              <span>{statusLabel}</span>
            </div>
            {latency !== null && (
              <span className="rounded-full border border-forest/25 bg-forest/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-forest">
                Latenz {latency} ms
              </span>
            )}
            <nav className="flex gap-4 text-sm text-forest/90">
              <Link to="/editor" className="transition-soft hover:underline">
                Editor
              </Link>
              <Link to="/chronik" className="transition-soft hover:underline">
                Chronik
              </Link>
              <Link to="/dev" className="transition-soft hover:underline">
                Dev
              </Link>
            </nav>
          </div>
        </header>

        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-smoke">{statusTone}</div>
          <div className="frequency-line" aria-hidden="true">
            {Array.from({ length: flowMarkerCount }).map((_, index) => (
              <span
                key={`status-marker-${index}`}
                className="flow-marker"
                style={{ animationDelay: `${index * 120}ms` }}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="error-banner mb-5 space-y-2 rounded-[1.4rem] p-4">
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

        <main className={`sanctum-panel mb-6 ${hasMessages ? 'min-h-[360px]' : 'min-h-[420px]'}`}>
          {!hasMessages ? (
            <div className="kraftzentrum">
              <div className="seal-sanctum" aria-hidden="true">
                <div className="seal-halo"></div>
                <img src="/assets/seal.svg" alt="seal" className="seal-core" />
              </div>
              <div className="max-w-2xl text-center">
                <div className="mb-4 status-rune">Sprach- &amp; Flow-DNA</div>
                <h2 className="text-3xl leading-tight sm:text-[3.3rem]">
                  Ein Raum, der nicht drängt, sondern bündelt.
                </h2>
                <p className="mt-5 text-lg leading-8 text-smoke">
                  Lege einen Gedanken in die Mitte. Mφrlin antwortet nicht als hektische Maschine,
                  sondern als ruhiger Resonanzraum für Form, Bedeutung und Richtung.
                </p>
                <div className="mt-7 frequency-line" aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span
                      key={`hero-marker-${index}`}
                      className="flow-marker"
                      style={{ animationDelay: `${index * 160}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="message-stream">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="text-[11px] uppercase tracking-[0.3em] text-smoke">
                  Gesprächsfluss
                </div>
                <div className="frequency-line" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <span
                      key={`stream-marker-${index}`}
                      className="flow-marker"
                      style={{ animationDelay: `${index * 140}ms` }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                    <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-smoke">
                      {message.role === 'user' ? 'Impuls' : 'Resonanz'}
                    </div>
                    <div className={message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>
                      {message.text}
                    </div>
                  </div>
                ))}
                {status === 'sending' && (
                  <div className="pt-2 text-sm text-smoke">Der Impuls wird geordnet…</div>
                )}
                {status === 'receiving' && (
                  <div className="flex items-center gap-3 pt-2 text-sm text-smoke">
                    <span>Die Resonanz formt sich…</span>
                    <div className="frequency-line" aria-hidden="true">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <span
                          key={`receiving-marker-${index}`}
                          className="flow-marker"
                          style={{ animationDelay: `${index * 120}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <form className="grid gap-3" onSubmit={send}>
          <div className="ritual-compose">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              className="input-mystic min-h-[118px] resize-none"
              placeholder="Lege hier den ersten Impuls in die Mitte…"
              aria-label="message"
              disabled={isBusy}
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-smoke">
                Enter sendet. Shift + Enter oeffnet eine neue Zeile.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAbort}
                  className="rounded-full border border-stone px-4 py-2 text-sm text-smoke transition-soft hover:border-forest hover:text-forest disabled:opacity-50"
                  disabled={!isBusy}
                >
                  Stillstellen
                </button>
                <button type="submit" className="button-mystic transition-soft" disabled={isBusy}>
                  {isBusy ? 'Im Fluss…' : 'Impuls senden'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
    </div>
  )
}
