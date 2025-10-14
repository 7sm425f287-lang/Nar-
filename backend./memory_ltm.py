import os, json, re, time
from typing import List, Dict

def _now_iso(): return time.strftime("%Y-%m-%dT%H:%M:%S")

FACT_PATTERNS = [
    re.compile(r"\bich\s+bin\s+([^.!\n]{2,80})", re.I),
    re.compile(r"\bmein\s+(?:ziel|ziel ist)\s*[:\-]?\s+([^.!\n]{2,120})", re.I),
    re.compile(r"\bich\s+mag\s+([^.!\n]{2,80})", re.I),
    re.compile(r"\bich\s+arbeite\s+an\s+([^.!\n]{2,120})", re.I),
    re.compile(r"\btermin\s*(?:am|am\s+)\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{2,4})", re.I),
]

def extract_facts(text: str) -> List[str]:
    facts = []
    for rx in FACT_PATTERNS:
        for m in rx.findall(text or ""):
            s = m.strip(" ,.;:!?\n\t")
            if 2 <= len(s) <= 200:
                facts.append(s)
    # Dedupe kurz
    seen, out = set(), []
    for f in facts:
        k = f.lower()
        if k not in seen:
            seen.add(k); out.append(f)
    return out[:5]

def _ensure_file(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f: pass

def save_facts(path: str, user_id: str, facts: List[str], source: str):
    if not facts: return
    _ensure_file(path)
    with open(path, "a", encoding="utf-8") as f:
        for fact in facts:
            rec = {"ts": _now_iso(), "user": user_id, "fact": fact, "source": source}
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

def load_memories(path: str, user_id: str) -> List[Dict]:
    if not os.path.exists(path): return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
                if rec.get("user") == user_id:
                    out.append(rec)
            except Exception:
                continue
    # Neueste zuerst, cap 50
    out.sort(key=lambda r: r.get("ts",""), reverse=True)
    return out[:50]

def search_memories(path: str, user_id: str, query: str, k: int = 5) -> List[str]:
    # billige BM25-nahe Gewichtung (Count-Match)
    mems = load_memories(path, user_id)
    q = set(re.findall(r"\w{3,}", (query or "").lower()))
    scored = []
    for m in mems:
        f = (m.get("fact") or "")
        tokens = set(re.findall(r"\w{3,}", f.lower()))
        score = len(q & tokens)
        if score > 0:
            scored.append((score, f))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in scored][:k] or [m["fact"] for m in mems[:k]]
