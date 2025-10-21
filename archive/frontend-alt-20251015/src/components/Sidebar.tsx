import React from "react";

type Props = {
  sessions: string[];
  current: string;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export default function Sidebar({ sessions, current, onSelect, onNew }: Props) {
  return (
    <div className="sidebar">
      <div className="header">Niro – Sessions</div>
      <div style={{margin:"10px 0"}}>
        <button className="btn" onClick={onNew}>+ Neue Session</button>
      </div>
      <ul style={{listStyle:"none", padding:0, margin:0}}>
        {sessions.map(id => (
          <li key={id}>
            <button
              onClick={() => onSelect(id)}
              style={{
                width:"100%", textAlign:"left", padding:"8px 10px",
                border:"1px solid #e5e7eb", borderRadius:8, margin:"6px 0",
                background: id===current ? "#eef2ff" : "#fff", cursor:"pointer"
              }}
            >
              {id}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
