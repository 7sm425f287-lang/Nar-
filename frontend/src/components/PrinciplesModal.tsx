import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import { useAgentRuntime } from '@/lib/agent-runtime'

export default function PrinciplesModal() {
  const [open, setOpen] = useState(false)
  const { principles, principlesReady } = useAgentRuntime()

  useEffect(() => {
    const dismissed = localStorage.getItem('principles.dismissed') === '1'
    if (dismissed) return
    if (principlesReady && principles?.raw) {
      setOpen(true)
    }
  }, [principles, principlesReady])

  const dismiss = (persist = false) => {
    setOpen(false)
    if (persist) localStorage.setItem('principles.dismissed', '1')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="max-w-3xl w-full mx-4 bg-[#0b0f12] text-[#e6eef6] rounded-xl shadow-xl overflow-hidden">
        <header className="px-6 py-4 border-b border-white/6 flex items-center justify-between">
          <h2 className="text-xl font-serif">LOGON GAIAX — Arbeitsprinzipien</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dismiss(true)}
              className="text-sm text-smoke/80 bg-white/6 rounded px-3 py-1"
            >
              Verstanden
            </button>
            <button
              onClick={() => dismiss(false)}
              className="text-sm text-smoke/60 rounded px-3 py-1"
            >
              Schließen
            </button>
          </div>
        </header>
        <div className="p-6 max-h-[60vh] overflow-auto">
          {!principlesReady && <div>Lade Prinzipien…</div>}
          {principlesReady && principles?.raw && (
            <article className="prose prose-invert max-w-none">
              <ReactMarkdown>{principles.raw}</ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
