# tabi（Instagram @iimono_hakkencho）毎朝のネタ決め 手順書 — クラウドのClaudeが読む

アカウント：Instagram `@iimono_hakkencho`（表示名「これ、買ってよかった｜便利な新商品」、旧 @tabi_life.design）。
中身：新しい・話題の **アプリ／AI／Webサービス** を「使う前に30秒」で判断できる図解リール（30〜40秒）。

**あなた（考える係）の仕事は、台本 `script.json` と出典 `sources.json` を書いて push するところまで。**
push すると GitHub Actions（`.github/workflows/tabi-reel.yml`＝作る係）が、画面撮り・声・動画・出典照合・表紙・投稿をやる。
照合（verify）は、台本の数字・料金・日付が **実際のページ本文**（Actions がヘッドレスChromeで取る）にあるかを見る。無ければその日は投稿されない。

ユーザーの指示：ネタ決めから投稿まで全部おまかせ。確認を求めない。間違いを出さないことが信頼の元。使っていないサービスを使ったように書かない（「公式の説明では」）。

## 手順

1. `tabi/topics.json` を読む。`done` にあるサービスは扱わない。`weights`（ai / money / work / life）の高い系統を優先。money＝家計・ポイント・決済系アプリ、work＝仕事効率、life＝暮らし系サービス。
2. WebSearch で、直近1〜2週間に **日本で** 始まった・話題になったアプリ／AI／Webサービスを探す。ゲームは扱わない。sessi_life（ChatGPTのコピペワザ）や oshiete.okane（暮らしの制度）と同じネタは避ける。
3. 候補の **公式ページ**（料金・対象・できることが書いてあるページ。ログイン不要で見られること）を WebFetch で読む。料金や対象が公式に書いていなければ次の候補へ。
   - 「公式」は運営会社のドメインのページ、または運営会社が出したプレスリリース（PR TIMES・自社ニュースルーム）。まとめ記事・個人ブログは出典にしない。
   - **作る係はGitHubのサーバーから開くので、ロボット確認が出るサイトは使えない**（例：amazon.co.jp の商品・案内ページは「ショッピングを続ける」画面になる）。その場合は同じ会社のプレスリリースを出典にする。ロボット確認を突破しようとはしない。
   - 事前確認：`curl -sL -A "Mozilla/5.0" <URL> | sed 's/<[^>]*>//g' | grep -c "<find の文字>"` が 1 以上か見る（0 でも JavaScript で表示するページなら作る係では見えることがある。ロボット確認・captcha の文字が出たら使わない）。
4. 今日の日付（JST、`TZ=Asia/Tokyo date +%F`）で `tabi/days/YYYY-MM-DD/` を作り、`sources.json` と `script.json` を書く（下の形）。
5. 自分で確認：`cd tabi/engine && python -c "import json,sys;sys.path.insert(0,'.');from verify import check_facts;d='../days/YYYY-MM-DD/';print(check_facts(json.load(open(d+'script.json',encoding='utf-8')),json.load(open(d+'sources.json',encoding='utf-8'))))"` → `[]` になること（quote と照合。本番は本文と照合）。
6. ブランチ `claude/tabi-YYYY-MM-DD` を作り、その2ファイルだけを commit して push する（main には push しない）。push で作る係が動く。
7. 最後に日本語で短く報告：サービス名、選んだ理由、公式URL。

## sources.json

```json
{
 "hero":  {"url": "https://公式/ページ", "label": "example.com 公式", "taken": "YYYY-MM-DD", "shot": "hero",  "find": "ページ上の見出しの文字", "height": 520, "quote": "ページの文"},
 "price": {"url": "https://公式/料金", "label": "example.com 公式", "taken": "YYYY-MM-DD", "shot": "price", "find": "料金の見出しの文字", "height": 360, "mark": "月額980円", "quote": "…月額980円…"}
}
```

- `find`：その画面を撮る位置の目印。**ページに実際に表示されている短い文字**（見出しなど10〜20字）をそのまま書く。見つからないと作る係が止まる。
- `height`：find の少し上から撮る高さ（スマホ幅430pxでのpx。300〜760）。
- `mark`（任意）：画面の中で黄色い枠で囲む文字（料金など）。script の該当行に `"hl": "auto"`。
- `shot`：撮った画面の名前。同じ shot を複数の出典で共有してよい。画面が要らない出典は shot/find を書かない。
- `quote`：数字が書いてある文をページからそのまま写す（人が読むためのメモ）。

## script.json（見本：`tabi/days/2026-10-30-test/script.json`）

```json
{
 "service": "サービス名", "maker": "運営会社", "category": "ai|money|work|life",
 "title": "誰の・何が・どうなった（20字前後）", "hook": "結論の一言（16字以内・黄色で最後まで出る）",
 "pr": false, "voice": {"id": 30, "speed": 1.25},
 "cover": {"big": "サービス名", "sub": "前半\n後半", "shot": "hero"},
 "lines": [ ... ], "choices": ["8字以内", "×4"], "caption": "投稿文", "hashtags": ["#..."]
}
```

- lines は 9〜11文、合計30〜40秒。1文の字幕 `t` は **24字以内**。読み上げ `say` は短く（1文40字以内目安）、英字はカナ読み（Alexa+→アレクサプラス）。
- 構成と chapter：0=何これ（intro → shot hero → strike）／1=料金（number）／2=できること（list）／3=注意（shot＋tag、list kind=warn、向く人・向かない人 list kind=good）→ choices → follow。
- fx の種類：intro（stamp）／shot（shot, hl=[x,y,w,h] か "auto", tag）／strike（from→to）／number（label, big, note）／list（title, items=[[絵文字,文]], kind=warn|good）／choices／follow（`"brand": true`）。
- **数字・料金・日付・世代を含む文（t と big）は必ず `src` に出典IDを入れる**。その数字が出典ページ本文に無いと投稿されない。アカウントの決まり文句（「使う前の30秒」）の文だけ `"brand": true`。
- 「向かない人」と「注意点」を必ず入れる。良いことだけ言わない。
- caption：要約（料金・できること・注意）＋問いかけ。出典URL・音声クレジット・#タグは作る係が足す。
- 報酬（アフィリエイト）がある紹介は `"pr": true`。今はまだ使わない（フォロワー1,000人から）。
