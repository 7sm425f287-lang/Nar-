import React, { useState } from 'react'

type Message = { role: 'user' | 'bot'; text: string }

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!input.trim()) return
    const userMsg: Message = { role: 'user', text: input }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setMessages((m) => [...m, { role: 'bot', text: data.reply }])
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{maxWidth:700,margin:'2rem auto',fontFamily:'sans-serif'}}>
      <h1>Nar φ Chat</h1>
      {error && <div style={{background:'#fee',padding:8,border:'1px solid #f99'}}>{error}</div>}
      <div style={{minHeight:200,border:'1px solid #ddd',padding:12,marginTop:12}}>
        {messages.map((m, i) => (
          <div key={i} style={{textAlign: m.role === 'user' ? 'right' : 'left', margin:8}}>
            <div style={{display:'inline-block',background:m.role==='user'?'#def':'#eee',padding:8,borderRadius:8}}>{m.text}</div>
          </div>
        ))}
        {loading && <div>Loading…</div>}
      </div>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} style={{flex:1,padding:8}} onKeyDown={(e)=>{if(e.key==='Enter')send()}} />
        <button onClick={send} disabled={loading} style={{padding:'8px 12px'}}>Send</button>
      </div>
    </div>
  )
}
import { useState } from "react";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role:"user"|"assistant"; content:string}[]>([]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setMessages(m => [...m, {role:"user", content:text}]);
    setInput("");

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({message: text})
      });
      const data = await r.json();
      setMessages(m => [...m, {role:"assistant", content: String(data.reply ?? "")}]);
    } catch (e:any) {
      setMessages(m => [...m, {role:"assistant", content: "Fehler: "+ (e?.message || e)}]);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Niro Chat</h1>
        <div className="space-y-3 mb-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span className={m.role === "user" ? "inline-block rounded-2xl px-3 py-2 bg-blue-100" : "inline-block rounded-2xl px-3 py-2 bg-gray-200"}>
                {m.content}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2"
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") sendMessage(); }}
            placeholder="Nachricht eingeben…"
          />
          <button onClick={sendMessage} className="px-4 py-2 rounded bg-blue-600 text-white">
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
