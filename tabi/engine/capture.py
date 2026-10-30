"""sources.json の各出典ページをスマホ幅（430px）のヘッドレスChromeで開き、画面と本文を取る。カレントは days/YYYY-MM-DD。
- shots/<shot>.png … find の文字の少し上から height(px) 分を切り取った画面（ヘッダーは写らない）
- shots/<shot>.json … mark があれば、その文字の位置 {"hl": [x, y, w, h]}（切り取り内の割合。build.mjs の hl:"auto" が使う）
- pages/<出典ID>.txt … ページ本文。verify.py はこれと台本の数字を照合する（quote はただのメモ）
find の文字が見つからなければ失敗で止まる（その日は投稿されない）。"""
import json, os, sys

W, H = 430, 900

def clip_box(rect, page_h, height, width=W):
    y = max(0, int(rect["y"]) - 40)
    y = min(y, max(0, int(page_h) - height))
    return {"x": 0, "y": y, "width": width, "height": height}

def rel_box(rect, clip, pad=10):
    x = (rect["x"] - pad - clip["x"]) / clip["width"]
    y = (rect["y"] - pad - clip["y"]) / clip["height"]
    w = (rect["width"] + pad * 2) / clip["width"]
    h = (rect["height"] + pad * 2) / clip["height"]
    return [round(max(0, v), 2) for v in (x, y, w, h)]

def shot_specs(sources):
    seen, out = set(), []
    for v in sources.values():
        s = v.get("shot")
        if s and s not in seen and v.get("find"):
            seen.add(s)
            out.append({"shot": s, "url": v["url"], "find": v["find"], "height": v.get("height", 560), "mark": v.get("mark")})
    return out

FIND_JS = """(t) => {
  const norm = (s) => s.replace(/\\s+/g, '');
  const want = norm(t);
  const els = [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && norm(e.innerText || '').includes(want));
  els.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
  const e = els[0];
  if (!e) return null;
  e.scrollIntoView({block: 'center'});
  const r = e.getBoundingClientRect();
  return {x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height};
}"""

def main():
    from playwright.sync_api import sync_playwright
    src = json.load(open("sources.json", encoding="utf-8"))
    os.makedirs("shots", exist_ok=True); os.makedirs("pages", exist_ok=True)
    texts = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, locale="ja-JP",
                            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
        page = ctx.new_page()
        def open_url(url):
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3500)
        for k, v in src.items():  # 本文
            if v["url"] not in texts:
                open_url(v["url"]); texts[v["url"]] = page.inner_text("body")
            open(f"pages/{k}.txt", "w", encoding="utf-8").write(texts[v["url"]])
        for s in shot_specs(src):  # 画面
            open_url(s["url"])
            r = page.evaluate(FIND_JS, s["find"])
            if not r:
                sys.exit(f"{s['url']} に「{s['find']}」が見つからない")
            page.wait_for_timeout(800)
            r = page.evaluate(FIND_JS, s["find"])
            clip = clip_box(r, page.evaluate("document.documentElement.scrollHeight"), s["height"])
            page.evaluate(f"window.scrollTo(0, {clip['y']})"); page.wait_for_timeout(500)
            page.screenshot(path=f"shots/{s['shot']}.png", clip={**clip, "y": clip["y"]}, full_page=True)
            meta = {}
            if s["mark"]:
                m = page.evaluate(FIND_JS, s["mark"])
                if m:
                    meta["hl"] = rel_box(m, clip)
            json.dump(meta, open(f"shots/{s['shot']}.json", "w"))
            print("shot", s["shot"], clip, meta)
        b.close()

if __name__ == "__main__":
    main()
