import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { backendFetch } from '../lib/backend'
import { useAgentNode } from '../lib/agent-runtime'

type ChatStatus = 'idle' | 'sending' | 'receiving' | 'error'

type Message = { id: string; role: 'user' | 'bot'; text: string }

const BACKOFF_MS = [300, 900, 1500]
const sealSrc = './assets/seal.svg'
const ease = [0.22, 1, 0.36, 1] as const
const breathTransition = {
  duration: 5,
  repeat: Infinity,
  ease: 'easeInOut' as const,
}
const delegationExamples = [
  '@Schmiede, erstelle einen neuen Agenten fuer Release-Resonanz',
  '@Editor, oeffne drafts/social/ und bereite den Textkoerper vor',
  '@Chronik, lege einen neuen Eintrag fuer heute an',
  '@Dev, oeffne die Planner-Protokolle',
]

const generateId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export default function ChatPage() {
  const { agent, delegatePrompt, setAgentPulse } = useAgentNode('resonanz')
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
          setError(`Versuch ${attempt + 1} fehlgeschlagen - neuer Versuch in ${delay} ms.`)
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

      const delegated = delegatePrompt(prompt)
      setInput('')
      setLastPrompt(prompt)
      setLastRequestId(null)
      setError(null)
      setLatency(null)

      if (delegated) {
        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: 'user', text: prompt },
          {
            id: generateId(),
            role: 'bot',
            text: `${delegated.target} wurde gerufen. Auftrag: ${delegated.body || 'Fokus uebernehmen.'}`,
          },
        ])
        setStatus('idle')
        return
      }

      const userMessage: Message = { id: generateId(), role: 'user', text: prompt }
      setMessages((prev) => [...prev, userMessage])
      void sendMessage(prompt, 0)
    },
    [delegatePrompt, input, isBusy, sendMessage],
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
        return 'Senden'
      case 'receiving':
        return 'Empfangen'
      case 'error':
        return 'Fehler'
      default:
        return 'Bereit'
    }
  }, [status])

  const statusTone = useMemo(() => {
    switch (status) {
      case 'receiving':
        return 'Resonanz im Fluss'
      case 'sending':
        return 'Impuls wird geordnet'
      case 'error':
        return 'Verbindung braucht einen neuen Anlauf'
      default:
        return messages.length > 0 ? 'Gespräch im ruhigen Takt' : 'Raum fuer einen ersten Impuls'
    }
  }, [messages.length, status])

  const showRetry = status === 'error' && Boolean(lastPrompt)
  const hasMessages = messages.length > 0
  const activeConstraint = agent.coreConstraints[0] || agent.essence

  useEffect(() => {
    const tone =
      status === 'error'
        ? 'error'
        : status === 'sending' || status === 'receiving'
          ? 'busy'
          : 'active'
    setAgentPulse('resonanz', tone, statusTone)
    return () => {
      setAgentPulse('resonanz', 'idle', 'Alpha-Feld')
    }
  }, [setAgentPulse, status, statusTone])

  return (
    <div className="sanctum-page">
      <div className="launcher-shell">
        <div className="lightpoint" aria-hidden="true"></div>

        <header className="launcher-topbar">
          <div className="launcher-status-stack">
            <div className="status-rune">
              <span>{statusLabel}</span>
            </div>
            <div className="launcher-status-copy">
              <span>{statusTone}</span>
              {latency !== null && <span>Latenz {latency} ms</span>}
            </div>
          </div>

          <div className="launcher-regie-copy">
            <span>{agent.legacy}</span>
            <span>{activeConstraint}</span>
          </div>
        </header>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              key="launcher-error"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease }}
              className="launcher-error"
            >
              <div className="error-banner space-y-2 rounded-[1.4rem] p-4">
                <div>{error}</div>
                {lastRequestId && <div className="text-xs text-smoke">Request-ID: {lastRequestId}</div>}
                {showRetry && (
                  <button type="button" onClick={handleRetry} className="secondary-button">
                    Erneut versuchen
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="launcher-stage">
          <AnimatePresence mode="wait">
            {!hasMessages ? (
              <motion.section
                key="launcher-altar"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.4, ease }}
                className="launcher-altar"
              >
                <motion.div
                  className="launcher-seal-wrap"
                  animate={{ scale: [0.97, 1.02, 0.97], opacity: [0.78, 1, 0.78] }}
                  transition={breathTransition}
                >
                  <div className="launcher-seal-glow" aria-hidden="true"></div>
                  <div className="seal-sanctum launcher-seal" aria-hidden="true">
                    <div className="seal-halo"></div>
                    <img src={sealSrc} alt="seal" className="seal-core" />
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.38, ease, delay: 0.08 }}
                  className="launcher-altar-copy"
                >
                  <h1 className="launcher-wordmark">Mφrlin</h1>
                  <p className="launcher-tagline">
                    Alpha-Instanz fuer Sprache, Richtung und Delegation. Resonanz bindet die Geister
                    von niro-chat, Nar φ und Mφrlin in eine einzige Huelle.
                  </p>
                </motion.div>

                <div className="agent-command-grid">
                  {delegationExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="agent-command-chip"
                      onClick={() => setInput(example)}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="launcher-conversation"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.34, ease }}
                className="launcher-conversation"
              >
                <div className="launcher-conversation-head">
                  <div className="launcher-conversation-label">Gespräch</div>
                  <AnimatePresence initial={false}>
                    {status === 'receiving' && (
                      <motion.div
                        key="receiving-flow"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="frequency-line"
                        aria-hidden="true"
                      >
                        {Array.from({ length: 4 }).map((_, index) => (
                          <span
                            key={`receiving-marker-${index}`}
                            className="flow-marker"
                            style={{ animationDelay: `${index * 140}ms` }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="launcher-message-scroll">
                  {messages.map((message, index) => (
                    <motion.div
                      key={message.id}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease, delay: Math.min(index, 6) * 0.04 }}
                      className={message.role === 'user' ? 'message-entry-user' : 'message-entry-bot'}
                    >
                      <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-smoke">
                        {message.role === 'user' ? 'Impuls' : 'Resonanz'}
                      </div>
                      <div className={message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>
                        {message.text}
                      </div>
                    </motion.div>
                  ))}

                  {status === 'sending' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="pt-2 text-sm text-smoke"
                    >
                      Der Impuls wird geordnet...
                    </motion.div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>

        <motion.form
          layout
          transition={{ duration: 0.28, ease }}
          className="launcher-compose-shell"
          onSubmit={send}
        >
          <div className="launcher-compose">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              className="input-mystic launcher-input resize-none"
              placeholder="@Schmiede, @Editor, @Chronik oder @Dev delegieren..."
              aria-label="message"
              disabled={isBusy}
            />

            <div className="launcher-compose-meta">
              <div className="launcher-compose-hint">Enter sendet. Shift + Enter setzt eine neue Zeile.</div>
              <div className="launcher-compose-actions">
                <button
                  type="button"
                  onClick={handleAbort}
                  className="secondary-button"
                  disabled={!isBusy}
                >
                  Stillstellen
                </button>
                <button type="submit" className="button-mystic" disabled={isBusy}>
                  {isBusy ? 'Im Fluss' : 'Impuls senden'}
                </button>
              </div>
            </div>
          </div>
        </motion.form>
      </div>
    </div>
  )
}
