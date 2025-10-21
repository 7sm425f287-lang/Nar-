import React, { useState } from 'react'
export default function App() {
  const [msg, setMsg] = useState(''), [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  async function send() {
    const text = msg.trim(); if (!text) return
    setLoading(true); setMsg(''); setHistory(h => [...h, {role:'user', content:text}])
    try {
      const r = await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text})})
      const data = await r.json()
      setHistory(h => [...h, {role:'assistant', content:`[${data.provider}] ${data.reply}`}])
    } catch(e){ setHistory(h => [...h, {role:'assistant', content:`[error] ${e?.message||e}`}]) }
    finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen flex flex-col items-center p-6 gap-4">
      <h1 className="text-2xl font-bold">niro-chat-app</h1>
      <div className="w-full max-w-2xl border rounded p-4 flex-1 overflow-auto">
        {history.map((m,i)=>(
          <div key={i} className={`mb-3 ${m.role==='user'?'text-right':''}`}>
            <div className={`inline-block px-3 py-2 rounded ${m.role==='user'?'bg-blue-100':'bg-gray-100'}`}>{m.content}</div>
          </div>
        ))}
        {loading && <div className="text-sm opacity-60">…denke…</div>}
      </div>
      <div className="w-full max-w-2xl flex gap-2">
        <input className="flex-1 border rounded px-3 py-2" placeholder="Nachricht eingeben…" value={msg}
               onChange={e=>setMsg(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') send() }}/>
        <button className="px-4 py-2 bg-black text-white rounded" onClick={send} disabled={loading}>Senden</button>
      </div>
    </div>
  )
}
