import React from 'react'

export function ChatFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen texture-paper texture-grain">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6">
          <h1 className="ink text-3xl tracking-wide">Fi — Gespräch</h1>
          <p className="accent mt-1 text-sm">ruhig · tief · organisch</p>
        </header>
        <main className="space-y-3">{children}</main>
      </div>
    </div>
  )
}

export function BubbleUser({ text }: { text: string }) {
  return (
    <div className="bubble surface ink calm rise-in">
      {text}
    </div>
  )
}
export function BubbleFi({ text }: { text: string }) {
  return (
    <div className="bubble surface-deep calm fade-in">
      {text}
    </div>
  )
}

export function Composer({ onSend }: { onSend: (t: string)=>void }) {
  return (
    <form
      className="mt-4 flex gap-2 card-soft p-2 calm"
      onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSend(String(f.get("m")||"")); e.currentTarget.reset(); }}
    >
      <input
        name="m"
        placeholder="schreib etwas…"
        className="flex-1 bg-transparent outline-none ink placeholder:text-earth-rauch/60 px-2 py-2"
      />
      <button
        type="submit"
        className="rounded-soft bg-earth-ocker/90 text-white px-4 py-2 calm hover:bg-earth-ocker"
      >
        senden
      </button>
    </form>
  )
}
