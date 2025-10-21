from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import httpx
import logging

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env.local"))

LOG = logging.getLogger("backend")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResp(BaseModel):
    status: str


class ChatReq(BaseModel):
    message: str


@app.get("/health", response_model=HealthResp)
async def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(req: ChatReq, request: Request):
    if not req.message or not req.message.strip():
        LOG.info("Received empty message")
        raise HTTPException(status_code=400, detail="message must not be empty")

    # decide mode from env
    mode = os.getenv("MODE", "local").lower()
    LOG.info(f"Chat request mode={mode}")

    try:
        if mode == "cloud":
            # call OpenAI if configured
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                LOG.warning("OPENAI_API_KEY not set; falling back to local mock")
                return {"reply": f"(mock reply) Echo: {req.message}"}

            headers = {"Authorization": f"Bearer {api_key}"}
            # minimal proxy to OpenAI chat completions (implementation note: real body may differ)
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/chat/completions"),
                                         headers=headers,
                                         json={
                                             "model": os.getenv("MODEL_NAME", "gpt-4o-mini"),
                                             "messages": [{"role": "user", "content": req.message}],
                                         })
                if resp.status_code >= 400:
                    LOG.error(f"Upstream error: {resp.status_code} {resp.text}")
                    raise HTTPException(status_code=502, detail="Upstream LLM error")

                data = resp.json()
                # best-effort extraction
                try:
                    content = data["choices"][0]["message"]["content"]
                except Exception:
                    content = str(data)

                return {"reply": content}

        elif mode == "lmstudio":
            base = os.getenv("LMSTUDIO_BASE_URL")
            model = os.getenv("MODEL_NAME")
            if not base or not model:
                LOG.warning("LM Studio config incomplete; falling back to local mock")
                return {"reply": f"(mock reply) Echo: {req.message}"}

            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"{base.rstrip('/')}/v1/generate"
                resp = await client.post(url, json={"model": model, "input": req.message})
                if resp.status_code >= 400:
                    LOG.error("LMStudio upstream error")
                    raise HTTPException(status_code=502, detail="Upstream LLM error")
                data = resp.json()
                # best-effort
                content = data.get("output", {}).get("text") if isinstance(data, dict) else str(data)
                return {"reply": content or f"(lmstudio reply) {req.message}"}

        else:
            # local mock
            return {"reply": f"(mock reply) Echo: {req.message}"}

    except HTTPException:
        raise
    except Exception as e:
        LOG.exception("Unexpected error in /chat")
        # fallback reply
        raise HTTPException(status_code=500, detail=str(e))
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")


# Load env files permissively; individual variables decide behavior.
ROOT = os.path.dirname(__file__)
load_dotenv(os.path.join(ROOT, '.env.local'))
load_dotenv(os.path.join(ROOT, '.env.cloud'))


def get_env(key: str, default: Optional[str] = None) -> Optional[str]:
    return os.getenv(key) or default


app = FastAPI(title='nar-phi-backend')

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


@app.get('/health')
async def health():
    llm = (get_env('NIRO_LLM', 'openai') or 'openai').lower()
    model = get_env('OPENAI_MODEL') if llm == 'openai' else get_env('LMSTUDIO_MODEL')
    base = get_env('OPENAI_URL') if llm == 'openai' else get_env('LMSTUDIO_URL')
    return {
        'ok': True,
        'llm': llm,
        'model': model,
        'base_url': base,
    }


async def call_openai(prompt: str, timeout: int = 60) -> str:
    api_key = get_env('OPENAI_API_KEY')
    if not api_key:
        raise RuntimeError('OPENAI_API_KEY not set')
    url = get_env('OPENAI_URL', 'https://api.openai.com/v1/chat/completions')
    model = get_env('OPENAI_MODEL', 'gpt-4o-mini')
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    openai_org = get_env('OPENAI_ORG') or get_env('OPENAI_ORGANIZATION')
    openai_project = get_env('OPENAI_PROJECT')
    if openai_org:
        headers['OpenAI-Organization'] = openai_org
    if openai_project:
        headers['OpenAI-Project'] = openai_project

    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        # Try common extraction paths
        try:
            return data['choices'][0]['message']['content']
        except Exception:
            return str(data)


async def call_lmstudio(prompt: str, timeout: int = 120) -> str:
    # Navigator: use local LM Studio endpoint and model from env
    url = get_env('LMSTUDIO_URL', 'http://127.0.0.1:1234/v1/chat/completions')
    model = get_env('LMSTUDIO_MODEL', get_env('LMSTUDIO_MODEL', 'local-model'))

    # LM Studio has several API shapes; send a chat-like payload and accept multiple output forms.
    payload = {
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        # Try standard choices -> message path
        if isinstance(data, dict):
            if 'choices' in data:
                try:
                    return data['choices'][0]['message']['content']
                except Exception:
                    pass
            # LM Studio sometimes returns {'output': '...'} or {'text': '...'}
            for key in ('output', 'text', 'response'):
                if key in data and isinstance(data[key], str):
                    return data[key]
        return str(data)


@app.post('/chat')
async def chat(req: ChatRequest):
    # pydantic already enforces non-empty message; add explicit check for clarity
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail='message must not be empty')

    niro = (get_env('NIRO_LLM', 'openai') or 'openai').lower()
    try:
        if niro == 'openai':
            reply = await call_openai(req.message)
        else:
            reply = await call_lmstudio(req.message)
        return {'reply': reply}

    except httpx.HTTPStatusError as e:
        logger.error('Upstream HTTP error: %s', e)
        raise HTTPException(status_code=502, detail=f'Upstream error: {str(e)}')
    except httpx.RequestError as e:
        logger.error('Upstream request error: %s', e)
        raise HTTPException(status_code=502, detail=f'Upstream request error: {str(e)}')
    except Exception as e:
        logger.exception('Unhandled error in /chat')
        raise HTTPException(status_code=500, detail='Internal server error')


if __name__ == '__main__':
    import uvicorn

    port = int(get_env('PORT', '8001'))
    uvicorn.run('app:app', host='0.0.0.0', port=port, reload=True)

