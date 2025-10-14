import React from "react";
export default function MessageBubble({ role, content }: {role:"user"|"assistant", content:string}) {
  return (
    <div className={`row ${role === "user" ? "user" : "bot"}`}>
      <span className={`bubble ${role === "user" ? "user" : "bot"}`}>{content}</span>
    </div>
  );
}
