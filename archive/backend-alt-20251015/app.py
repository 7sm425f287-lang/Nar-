cat > app.py <<'PY'
import os, uvicorn, requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

NIRO_LLM = os.getenv("NIRO_LLM", "lmstudio").lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_ORG = os.getenv("OPENAI_ORG")
OPENAI_PROJECT = os.getenv("OPENAI_PROJECT")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
LMSTUDIO_BASE_URL = os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234")
LMSTUDIO_MODEL = os.getenv("LMSTUDIO_MODEL", "qwen2.5:7b-instruct")

app = FastAPI(title="niro-chat-app", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173","http://127.0.0.1:5173",
        "http://localhost:5174","http://127.0.0.1:5174"
    ],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

class ChatIn(BaseModel):
    message: str
    system: str | None = None

class ChatOut(BaseModel):
    reply: str
    provider: str

@app.get("/health")
def health():
    return {"ok": True, "mode": NIRO_LLM}

@app.post("/chat", response_model=ChatOut)
def chat(body: ChatIn):
    if not body.message or not body.message.strip():
        raise HTTPException(400, "empty message")
    if NIRO_LLM == "openai":
        if not OPENAI_API_KEY:
            raise HTTPException(500, "OPENAI_API_KEY missing")
        import httpx
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
        if OPENAI_ORG: headers["OpenAI-Organization"] = OPENAI_ORG
        if OPENAI_PROJECT: headers["OpenAI-Project"] = OPENAI_PROJECT
        payload = {
            "model": OPENAI_MODEL,
            "input": body.message if not body.system else [
                {"role":"system","content":body.system},
                {"role":"user","content":body.message}
            ],
        }
        try:
            with httpx.Client(timeout=60) as client:
                r = client.post("https://api.openai.com/v1/responses", headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
                reply = data.get("output_text") or str(data)
        except Exception as e:
            raise HTTPException(502, f"OpenAI error: {e}")
        return ChatOut(reply=reply, provider="openai")

    try:
        r = requests.post(
            f"{LMSTUDIO_BASE_URL}/v1/chat/completions",
            json={
                "model": LMSTUDIO_MODEL,
                "messages": (
                    [{"role":"system","content":body.system}] if body.system else []
                ) + [{"role":"user","content": body.message}],
                "temperature": 0.7,
            },
            timeout=60,
        )
        j = r.json()
        if r.status_code >= 400 or "error" in j:
            raise RuntimeError(j.get("error", {}).get("message", f"HTTP {r.status_code}"))
        reply = j.get("choices",[{}])[0].get("message",{}).get("content")
        if not reply:
            reply = j.get("choices",[{}])[0].get("text")
        if not isinstance(reply, str) or not reply.strip():
            reply = str(j)
    except Exception:
        try:
            r2 = requests.post(
                f"{LMSTUDIO_BASE_URL}/v1/completions",
                json={
                    "model": LMSTUDIO_MODEL,
                    "prompt": (body.system + "\n\n" if body.system else "") + body.message,
                    "temperature": 0.7,
                },
                timeout=60,
            )
            j2 = r2.json()
            if r2.status_code >= 400 or "error" in j2:
                raise RuntimeError(j2.get("error", {}).get("message", f"HTTP {r2.status_code}"))
            reply = j2.get("choices",[{}])[0].get("text") or str(j2)
        except Exception as e2:
            raise HTTPException(502, f"LM Studio error: {e2}")
    return ChatOut(reply=reply, provider="lmstudio")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8001")))
PY
