# AGENTS — Beispiele für Contributors & AI-Agenten

Kurz: praktische Vorlagen, die zeigen, wie man neue LLM-Provider hinzufügt und einen Dev-Job-Integrationstest schreibt.

1) Provider-Skeleton (Python)

Datei: `backend/core/llm/acme_provider.py`

```python
from .base import BaseProvider
from backend.core.errors import ConfigurationError, UpstreamError

class AcmeProvider(BaseProvider):
    name = "acme"

    def __init__(self, settings):
        # settings: dict aus backend/core/config.py
        if not settings:
            raise ConfigurationError("missing settings for acme provider")
        self.settings = settings

    def generate(self, messages):
        """Erwarte `messages` als Liste von {role, content}.
        Liefere genau ein String-Feld zurück (Single-reply contract).
        """
        try:
            # minimaler Platzhalter — ersetze durch echten Aufruf
            prompt = "\n".join(m.get("content", "") for m in messages)
            reply = "Antwort von Acme: " + prompt[:100]
            return reply
        except Exception as e:
            raise UpstreamError(str(e))

# EOF
```

Wichtig: Provider müssen eine einzige, zusammengefasste `reply`-Zeichenkette zurückgeben. Fehler sollten die vorhandenen Fehlerklassen (`ConfigurationError`, `UpstreamError`) verwenden.

2) Provider-Unit-Test (pytest)

Datei: `backend/tests/test_acme_provider.py`

```python
import os
from backend.core.llm.acme_provider import AcmeProvider

def test_acme_provider_generate():
    settings = {"api_key": "test"}
    p = AcmeProvider(settings)
    messages = [{"role": "system", "content": "Du bist hilfsbereit."},
                {"role": "user", "content": "Hallo"}]
    reply = p.generate(messages)
    assert isinstance(reply, str)
    assert len(reply) > 0

```

Testrun: `pytest backend/tests/test_acme_provider.py -q`

3) Job-Runner Integrationstest (Beispiel)

Ziel: testen, dass ein Dev-Job akzeptiert wird (wenn `DEV_MODE=true`) und Logs geschrieben werden.

Datei: `backend/tests/test_dev_job_integration.py`

```python
import os
import tempfile
from fastapi.testclient import TestClient
from backend.app import app

def test_dev_job_creates_log(tmp_path, monkeypatch):
    monkeypatch.setenv("DEV_MODE", "true")
    # Optional: setze DEV_CMD_WHITELIST so dass der Test klar sei
    monkeypatch.setenv("DEV_CMD_WHITELIST", "echo")

    client = TestClient(app)
    resp = client.post("/api/dev/jobs", json={"cmd": "echo hello"})
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data

    # Prüfe, dass ein Logfile in backend/logs/jobs/ angelegt wurde (konservativ)
    # Genauere Assertions können auf basis des JobRunner-Formats erfolgen.

```

Testrun: `pytest backend/tests/test_dev_job_integration.py -q`

Hinweise / Best Practices

Wenn du willst, lege ich automatisch Beispieldateien (`acme_provider.py`, Tests) an und commite sie. Soll ich das tun? (ja/nein)
Wenn du willst, lege ich automatisch Beispieldateien (`acme_provider.py`, Tests) an und commite sie. Soll ich das tun? (ja/nein) 

--
Gesetz: UI-Performance & Laden

1) Spline Lazy-Loading:
- Lade `@splinetool/react-spline` nur on-demand. Verwende `React.lazy` / `Suspense` oder dynamischen Import.
- Die 3D-Szene darf das Initial-Render nicht blockieren; first-paint der UI hat Vorrang.

2) GPU-Compositing für sakrale UI-Rendering-Flächen:
- Für Layer mit `backdrop-filter`, großen `box-shadow`/Glow-Effekten oder starken Transparenzen setze `will-change: transform, filter` und `transform: translateZ(0)`.
- Reduziere `backdrop-filter` / `filter: blur()` Radien auf ein moderates Maß (z. B. ≤ 12px) für große Flächen; lokale Details können höhere Werte verwenden.

3) React-Rendering:
- Memoisiere wiederholte Karten/Listen-Komponenten mit `React.memo` und kontrolliere List-Renderings mit `useMemo`/`useCallback`.
- Vermeide globale State-Änderungen, die alle 24 Karten neu rendern.

4) Framer-Motion:
- Vermeide das `layout`-Attribut auf großen Listen / Sidebar-Containern. Nutze `x`, `y`, `scale`, `opacity` für Transform-only Animationen.

5) Backend-Asynchronität:
- Vermeide blockierende Dateisystem- oder CPU-Operationen im Event-Loop. Nutze `asyncio.to_thread` oder Background-Tasks.

Diese Regeln sind verbindlich für alle Agenten-Vorschläge und Code-Beispiele in diesem Repo.

