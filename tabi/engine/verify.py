"""投稿前の関門。台本の数字が出典の文字に本当にあるか、動画が正しく書き出せたかを見る。カレントは days/YYYY-MM-DD。"""
import json, os, re, subprocess, sys, unicodedata

def numbers_in(text: str) -> list[str]:
    t = unicodedata.normalize("NFKC", text)
    return [m.replace(",", "") for m in re.findall(r"\d[\d,]*(?:\.\d+)?", t)]

def check_facts(script: dict, sources: dict, pages: dict | None = None) -> list[str]:
    """pages（出典ID→ページ本文）があれば本文と照合する。無ければ sources の quote と照合する（手元で撮った日）。"""
    problems = []
    for i, l in enumerate(script["lines"]):
        nums = numbers_in(l["t"] + " " + l.get("big", ""))
        if not nums or l.get("brand"):  # brand: アカウントの決まり文句（「使う前に30秒」など）で事実の数字ではない行
            continue
        ids = l.get("src", [])
        if not ids:
            problems.append(f"文{i}「{l['t']}」: 数字があるのに出典なし")
            continue
        missing = [s for s in ids if s not in sources]
        if missing:
            problems.append(f"文{i}: sources.json に {','.join(missing)} がない")
            continue
        if pages is not None and any(s not in pages for s in ids):
            problems.append(f"文{i}: 出典 {','.join(s for s in ids if s not in pages)} のページ本文が取れていない")
            continue
        pool = set()
        for s in ids:
            pool.update(numbers_in(pages[s] if pages is not None else sources[s]["quote"]))
        for n in nums:
            if n not in pool:
                problems.append(f"文{i}「{l['t']}」: {n} が出典の文字に見つからない")
    return problems

def check_video(path: str, total: float) -> list[str]:
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height",
                              "-show_entries", "format=duration", "-of", "json", path],
                             capture_output=True, text=True, check=True).stdout
    except Exception as e:
        return [f"動画が読めない: {e}"]
    j = json.loads(out); p = []
    v = [s for s in j["streams"] if s["codec_type"] == "video"]
    if not v or (v[0]["width"], v[0]["height"]) != (1080, 1920):
        p.append("動画が1080x1920ではない")
    if not any(s["codec_type"] == "audio" for s in j["streams"]):
        p.append("音声がない")
    d = float(j["format"]["duration"])
    if not 25 <= d <= 45:
        p.append(f"長さが {d:.1f} 秒（25〜45秒の外）")
    if abs(d - total) > 1.0:
        p.append(f"長さ {d:.1f} 秒が lines.json の {total} 秒と合わない")
    return p

def main():
    S = json.load(open("script.json", encoding="utf-8"))
    src = json.load(open("sources.json", encoding="utf-8"))
    total = json.load(open("lines.json", encoding="utf-8"))["total"]
    pages = None
    if os.path.isdir("pages"):
        pages = {f[:-4]: open(os.path.join("pages", f), encoding="utf-8").read() for f in os.listdir("pages") if f.endswith(".txt")}
    problems = check_facts(S, src, pages) + check_video("output.mp4", total)
    json.dump({"ok": not problems, "problems": problems}, open("verify.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK" if not problems else "\n".join(problems))
    sys.exit(0 if not problems else 1)

if __name__ == "__main__":
    main()
