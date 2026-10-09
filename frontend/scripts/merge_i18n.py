"""Deep-merge locale additions into src/i18n/locales/<lang>.json (additions win)."""
import json, sys
from pathlib import Path

def merge(base, add):
    for k, v in add.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            merge(base[k], v)
        else:
            base[k] = v
    return base

root = Path(__file__).resolve().parent
for lang in ("en", "ta", "hi"):
    loc = root.parent / "src" / "i18n" / "locales" / f"{lang}.json"
    data = json.loads(loc.read_text())
    for add_file in sys.argv[1:]:
        p = root / add_file.replace("{lang}", lang)
        if p.exists():
            merge(data, json.loads(p.read_text()))
    loc.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(lang, "ok")
