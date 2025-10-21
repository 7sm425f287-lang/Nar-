import React, { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import MessageBubble from "./components/MessageBubble";

const API_BASE = (import.meta as any).env.VITE_API_BASE || "http://localhost:8000";

type Msg = { role: "user" | "assistant"; content: string };

export default function App() {
  const [sessions, setSessions] = useState<string[]>(["default"]);
  const [sessionId, setSessionId] = useState<string>("default");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: text }]);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", content: data.reply }]);
    } catch (e:any) {
      setMessages(m => [...m, { role: "assistant", content: "⚠️ API-Fehler: " + e?.message }]);
    }
  }

  function newSession() {
    const id = `s_${Date.now()}`;
    setSessions(s => [id, ...s]);
    setSessionId(id);
    setMessages([]);
  }

  function selectSession(id:string) {
    setSessionId(id);
    setMessages([]);
  }

  return (
    <div className="app">
      <Sidebar sessions={sessions} current={sessionId} onSelect={selectSession} onNew={newSession} />
      <div className="chat">
        <div className="header">Niro Chat – Session: {sessionId}</div>
        <div className="messages" ref={scroller}>
          {messages.map((m, i) => <MessageBubble key={i} role={m.role} content={m.content} />)}
        </div>
        <div className="inputbar">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Nachricht eingeben…"
          />
          <button className="btn" onClick={sendMessage}>Senden</button>
        </div>
      </div>
    </div>
  );
}
