import React from "react";
import Editor, { OnMount } from "@monaco-editor/react";

export default function CodeEditor({
  value,
  language = "markdown",
  onChange,
  readOnly = false,
}: {
  value: string;
  language?: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  const handleMount: OnMount = (editor) => {
    editor.focus();
  };

  return (
    <div className="h-[70vh] rounded-md overflow-hidden shadow-soft">
      <Editor
        theme="vs-dark"
        defaultLanguage={language}
        value={value}
        onMount={handleMount}
        onChange={(v) => onChange && onChange(v || "")}
        options={{
          minimap: { enabled: false },
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          automaticLayout: true,
          readOnly,
        }}
      />
    </div>
  );
}
