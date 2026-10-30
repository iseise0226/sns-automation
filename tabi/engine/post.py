"""verify.json が OK の日だけ、output.mp4 と cover.png を一時置き場に上げて Graph API でリール投稿する。カレントは days/YYYY-MM-DD。
GitHub Actions（tabi-reel.yml）から呼ぶ。環境変数 IG_TOKEN（IG_TOKEN_TABI_LIFE_DESIGN）と IG_USER_ID が要る。
DRYRUN=1 なら投稿せず、アカウント確認だけして post.json に dry を残す。"""
import json, os, subprocess, sys, time, urllib.parse, urllib.request

G = "https://graph.facebook.com/v23.0"
CREDIT = "VOICEVOX:No.7"

def build_caption(script: dict, sources: dict) -> str:
    seen, srcs = set(), []
    for v in sources.values():
        if v["url"] not in seen:
            seen.add(v["url"]); srcs.append(f"・{v['url']}（{v['taken']}時点）")
    tags = " ".join(script.get("hashtags", []))
    head = "【PR】\n" if script.get("pr") else ""
    tail = "\n\n出典\n" + "\n".join(srcs) + f"\n※料金・内容は取得日時点の公式表示です。\n音声：{CREDIT}\n\n{tags}"
    body = script["caption"][: 2200 - len(head) - len(tail)]
    return head + body + tail

def upload(path: str) -> str:
    for args in (["-F", "reqtype=fileupload", "-F", "time=24h", "-F", f"fileToUpload=@{path}",
                  "https://litterbox.catbox.moe/resources/internals/api.php"],
                 ["-F", f"files[]=@{path}", "https://uguu.se/upload?output=text"]):
        try:
            out = subprocess.run(["curl", "-s", *args], capture_output=True, text=True, timeout=300).stdout.strip()
            if out.startswith("https://"):
                return out
        except Exception:
            pass
    raise RuntimeError("一時置き場へのアップロードに失敗")

def api(method: str, path: str, **params) -> dict:
    data = urllib.parse.urlencode(params).encode()
    url = f"{G}/{path}" + ("" if method == "POST" else "?" + data.decode())
    req = urllib.request.Request(url, data=data if method == "POST" else None, method=method)
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}

def main():
    token, ig = os.environ["IG_TOKEN"].strip(), os.environ.get("IG_USER_ID", "17841410048474816")
    me = api("GET", ig, fields="username", access_token=token)
    print("account", me.get("username") or me)
    if not me.get("username"):
        sys.exit("トークンが使えない（再発行が必要）")
    if json.load(open("verify.json", encoding="utf-8")).get("ok") is not True:
        sys.exit("verify が OK ではないので投稿しない")
    if os.path.exists("post.json") and json.load(open("post.json", encoding="utf-8")).get("ok"):
        sys.exit("投稿済み")
    if os.environ.get("DRYRUN") == "1":
        json.dump({"ok": False, "dry": True}, open("post.json", "w")); print("dry run"); return
    S = json.load(open("script.json", encoding="utf-8")); src = json.load(open("sources.json", encoding="utf-8"))
    video, cover = upload("output.mp4"), upload("cover.png")
    c = api("POST", f"{ig}/media", media_type="REELS", video_url=video, cover_url=cover, share_to_feed="true",
            caption=build_caption(S, src), access_token=token)
    if "id" not in c:
        sys.exit(f"コンテナ作成失敗: {c}")
    for _ in range(60):
        st = api("GET", c["id"], fields="status_code", access_token=token).get("status_code")
        print("status", st)
        if st == "FINISHED":
            break
        if st == "ERROR":
            sys.exit("Instagram側の処理でエラー")
        time.sleep(10)
    pub = api("POST", f"{ig}/media_publish", creation_id=c["id"], access_token=token)
    res = {"video": video, "cover": cover, "media_id": pub.get("id"), "ok": "id" in pub}
    json.dump(res, open("post.json", "w", encoding="utf-8"), indent=1)
    print(res)
    sys.exit(0 if res["ok"] else 1)

if __name__ == "__main__":
    main()
