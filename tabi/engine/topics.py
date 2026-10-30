"""topics.json の記録と、週ごとの成績から系統の重みを動かす。score = 保存×3 + シェア×3 + フォロー×5 + 再生/100。
python topics.py record <days/YYYY-MM-DD>   … その日の投稿を記録
python topics.py ids / weekly <ファイル>      … 直近7本のID／成績（INSIGHT行）から重みを更新"""
import copy, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def record(topics: dict, day: dict) -> dict:
    t = copy.deepcopy(topics); t["done"].append(day)
    if day.get("hook"):
        t["hooks"].append({"hook": day["hook"], "media_id": day.get("media_id")})
    return t

def is_done(topics: dict, service: str) -> bool:
    return any(d["service"].lower() == service.lower() for d in topics["done"])

def update_weights(topics: dict, stats: list[dict]) -> dict:
    t = copy.deepcopy(topics)
    if not stats:
        return t
    avg_all = sum(s["score"] for s in stats) / len(stats)
    for cat in t["weights"]:
        xs = [s["score"] for s in stats if s["category"] == cat]
        if not xs or avg_all == 0:
            continue
        ratio = (sum(xs) / len(xs)) / avg_all
        t["weights"][cat] = round(min(3.0, max(0.3, t["weights"][cat] * (0.5 + 0.5 * ratio))), 2)
    t["weekly"].append({"stats": stats, "weights": t["weights"]})
    return t

def parse_insights(log: str, cats: dict) -> list[dict]:
    out = []
    for mid, js in re.findall(r"INSIGHT (\d+) (\{.*\})", log):
        v = json.loads(js)
        score = v.get("views", 0) / 100 + v.get("saved", 0) * 3 + v.get("shares", 0) * 3 + v.get("follows", 0) * 5
        out.append({"media_id": mid, "category": cats.get(mid, "ai"), "score": score})
    return out

def main():
    path = ROOT / "topics.json"
    t = json.load(open(path, encoding="utf-8"))
    if sys.argv[1] == "record":
        d = Path(sys.argv[2])
        S = json.load(open(d / "script.json", encoding="utf-8")); P = json.load(open(d / "post.json", encoding="utf-8"))
        t = record(t, {"date": d.name, "service": S["service"], "category": S["category"], "hook": S["hook"],
                       "media_id": P.get("media_id")})
    elif sys.argv[1] == "ids":  # 直近7本の media_id（週の見直しでワークフローが成績を取る）
        print(",".join([d["media_id"] for d in t["done"] if d.get("media_id")][-7:]))
        return
    elif sys.argv[1] == "weekly":  # python topics.py weekly <INSIGHT行のファイル>
        recent = [d for d in t["done"] if d.get("media_id")][-7:]
        stats = parse_insights(open(sys.argv[2], encoding="utf-8").read(), {d["media_id"]: d["category"] for d in recent})
        t = update_weights(t, stats)
        print(json.dumps(t["weights"], ensure_ascii=False))
    json.dump(t, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
