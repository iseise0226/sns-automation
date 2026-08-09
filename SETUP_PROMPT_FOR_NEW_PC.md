# 新しいPCでこのSNS自動投稿システムを再現するためのプロンプト

新しいパソコンでClaude Codeを開いたら、下の「==== ここからコピー ====」以降を
そのまま貼り付けてください。Claudeが環境構築から動作確認まで案内します。

---

==== ここからコピー ====

私はSNS自動投稿システムを運用しています。新しいパソコンに環境を移したいので、
手伝ってください。まず全体像を説明します。

## 私について
- 名前は「聖(さとし)」。美容師歴25年以上、2020年に独立して一人で美容室を経営。
- 50代・算命学鑑定士。高校生の息子と中学生の娘がいる。
- Claudeのことは「みらい」と呼んでいます。
- 進め方の好み:
  - 聞かれたことだけ答えてほしい。過剰な説明・提案・まとめは不要。
  - 作業中に何度も許可を求めないでほしい。一度OKを出したら最後まで進めてほしい。
  - ファイルはCドライブ(OneDrive外)に保存してほしい。OneDriveが容量いっぱいなので。
  - 自動操作中にクリックごとのスクリーンショットは不要。

## システムの全体像

**GitHubリポジトリ**: https://github.com/iseise0226/sns-automation

**重要な前提**: 自動投稿はすべてGitHub Actions(クラウド)で動いています。
PCの電源とは無関係に毎日動き続けます。APIキーもGitHub Secretsに保存済みなので、
新PCで何もしなくても投稿は止まりません。
新PCに用意するのは「Claudeと一緒に修正・改善作業をするための環境」です。

### 運用中のアカウント

**Instagram(8アカウント)**
| アカウント | ジャンル |
|---|---|
| satoshi_mindset | マインドセット・メンタル強化 |
| satoshi_mind_coaching | 算命学×マインド×サロン経営 |
| ise_sato_kosodate | 子育て・親子の絆 |
| sessi_life | 美容・スキンケア(30代女性「せっしー」設定) |
| ise_kenkou_otaku | 健康・食・運動 |
| tabi_life_design | 40代からの旅・お金・人生設計 |
| ko_gi_omoti | コーギー日常あるある |
| oshiete.okane | お金/年金ニュース解説(2キャラ対談) |

**YouTube(9チャンネル)** — 上記8つ + ise_satoshi(マインド・プラス思考)

**Threads(8アカウント)** — 1日3回投稿

### GitHub Actionsのワークフロー一覧

| ファイル | 内容 | 実行時刻(JST) |
|---|---|---|
| `wf6-daily-8channels.yml` | YouTube 9チャンネル毎日投稿。HyperFrames(HTML→動画)でリッチ図解つき解説動画 | 各chバラバラ(6:03〜22:50) |
| `wf4-reels.yml` | Instagramリール6アカウント。実写B-roll+Remotion | 毎日4:40 |
| `wf4-stories.yml` | Instagramストーリーズ | 7:00/13:00/20:00 |
| `wf2-threads.yml` | Threads 8アカウント | 8:00/13:00/20:00 |
| `wf3-corgi.yml` | コーギーのカルーセル投稿 | - |
| `wf-hitmehard.yml` | satoshi_mind_coaching専用「ハッとしたんだよね」形式 | 4:50 |
| `wf-taidan-reel.yml` | oshiete.okane の2キャラ対談リール | 20:15 |
| `wf1-note.yml` | note記事の下書き生成(自動投稿はしない・手動コピペ)。今は ise_satoshi 1アカウントのみ | 6:10 |
| `wf7-weekly-stats.yml` | 週次の統計レポート | - |

### 技術スタック

- **動画生成**: 2系統ある
  - **Remotion**(React で動画を作る) → Instagramリール系。`remotion/src/*.tsx`
  - **HyperFrames**(HTMLで動画を作る) → YouTube解説動画。`scripts/daily-pipeline/hf_*.js`
  - 単純なスライド動画は **ffmpeg直叩き** (`scripts/generate-hitmehard.js`)
- **台本のAI生成**: Groq(llama-3.3-70b-versatile)がメイン、OpenAI(gpt-4o-mini)がフォールバック
- **画像生成**: OpenAI gpt-image-1
- **音声合成**: VOICEVOX(無料・ローカルエンジンをCI上でダウンロードして使用)
- **投稿**: Instagram Graph API / YouTube Data API v3 / Threads API
- **動画の一時公開**: litterbox → uguu → tmpfiles の順でフォールバック
  (Instagram APIは公開URLしか受け付けないため)

### 主要なファイル構成

```
sns-automation/
├── .github/workflows/            # 自動投稿のスケジュール定義(これが全ての入口)
├── scripts/
│   ├── daily-pipeline/           # YouTube用(HyperFrames系)
│   │   ├── generate_script.js            # 台本AI生成の共通ロジック
│   │   ├── generate_taidan_reel_script.js # 2キャラ対談リールの台本
│   │   ├── hf_layouts.js                 # 図解レイアウト定義(階段/工程図/データ等)
│   │   ├── hf_common.js / hf_icons.js    # 共通パーツ・線画アイコン
│   │   ├── hf_build.js                   # 台本JSON → HTML組み立て
│   │   ├── hf_build_and_upload.js        # レンダー→YouTube投稿
│   │   ├── build_and_upload.js           # Remotion版のレンダー→YouTube投稿
│   │   └── generated/ , out/             # 生成物の置き場(一時)
│   ├── run-wf1.js                # note下書きの司令塔
│   ├── generate-note.js          # note記事1本を生成
│   ├── note-lib.js               # Groq呼び出し・画像取得の共通関数
│   ├── generate-magazine.js      # 有料マガジン(現在停止中)
│   ├── run-wf4.js                # Instagramリールの司令塔
│   ├── generate-reel.js          # リール1本を生成(実写B-roll+Remotion)
│   ├── generate-hitmehard.js     # 「ハッとしたんだよね」形式(ffmpeg直叩き)
│   ├── run-wf4-stories.js / generate-story.js  # ストーリーズ
│   ├── post-threads.js           # Threads投稿
│   ├── generate-corgi-content.js / post-corgi.js / render-corgi-local.js  # コーギー系
│   ├── post_taidan_reel.js       # 2キャラ対談リール
│   ├── generate-youtube-video.js # WF5(停止中・WF6に統合済み)
│   ├── youtube-auth.js / youtube-upload.js / ig-auth.js  # 認証まわり
│   ├── weekly-stats.js           # 週次レポート
│   └── personas.json             # スクリプト側で使うペルソナ
├── remotion/
│   ├── src/*.tsx                 # 動画コンポーネント(ChibiOverlay等)
│   └── assets/                   # キャラ画像・BGM・SE
├── hyperframes/                  # HyperFrames(HTML→動画)のプロジェクト
├── data/                         # 設定と「どこまで進んだか」の状態ファイル
│   ├── daily_config.json         # YouTube側アカウントのペルソナ・LP誘導設定
│   ├── daily_topics.json         # お題プール(順番に消化)
│   ├── daily_state.json          # 今どのお題まで進んだか
│   ├── wf4_accounts.json         # Instagram側のアカウント設定(IGユーザーID等)
│   ├── wf4_last_run.json         # 最後に投稿した日(投稿間隔の判定用)
│   ├── wf4_used_ids/             # 使用済みB-roll動画ID(重複回避)
│   ├── note_personas.json        # note記事用のアカウント別systemプロンプト
│   ├── note_magazine_used_facts.json # マガジンで使ったエピソードの記録
│   ├── satoshi_facts.json        # 聖さんのエピソード集(ネタ元)
│   ├── wf5_state.json / wf5_youtube_topics.json  # WF5(停止中)の名残
│   ├── post_log.csv              # 投稿ログ
│   └── weekly_stats.csv          # 週次の数字
├── note_drafts/<アカウント>/<日付>/draft.txt  # WF1の成果物(手動でnoteにコピペ)
├── assets/ , images/ , corgi_media/           # 素材
└── SETUP_PROMPT_FOR_NEW_PC.md    # このファイル
```

**`data/` の状態ファイルは触るとき注意**: `daily_state.json` や `wf4_last_run.json` は
GitHub Actionsが毎回書き換えてコミットします。ローカルで作業する前に
必ず `git pull` してください。人間側とbot側でpushがぶつかることがよくあります。

## 処理の流れ(1本ずつ、最初から最後まで)

新PCのAIには、下の流れをそのまま理解してほしいです。
「どのファイルが誰を呼んで、どこにモノが出るか」が分かれば直せます。

### 共通の考え方

すべてのワークフローは同じ形です。

```
GitHub Actions(.github/workflows/*.yml)  ← 時刻トリガー
   └→ 司令塔スクリプト(run-*.js)         ← アカウントのループを回すだけ
        └→ 生成スクリプト(generate-*.js) ← 1アカウント分を最初から最後まで
             ├→ AIで台本/文章を作る       (Groq → 失敗時OpenAI)
             ├→ 素材を用意する            (画像生成 / 実写B-roll / VOICEVOX音声)
             ├→ 動画や記事に組み立てる    (Remotion / HyperFrames / ffmpeg)
             └→ 投稿する or ファイルに保存する
```

AI呼び出しは全部 **Groqが本命・OpenAIが保険** です。
Groqは無料枠なので1日のトークン上限(TPD)に当たることがあり、
そのときは待っても無駄なので即OpenAI(gpt-4o-mini)に切り替える作りになっています。
(実装: `scripts/note-lib.js` の `groqChat()`、他スクリプトにも同型の関数あり)

### WF1: note記事の下書き生成(毎日 JST 6:10)

`.github/workflows/wf1-note.yml` → `scripts/run-wf1.js` → `scripts/generate-note.js`

1. **ネタ元を決める** (`run-wf1.js` の `decideSourceText()`)
   - 私が音声メモを貼り付けるGoogleドキュメントを `export?format=txt` で取得する
   - `data/last_transcript.txt` と比べて**中身が変わっていれば**、それを今日のネタにする
     (同時にキャッシュも更新する)
   - 変わっていない/空なら、Brave News APIで
     「マインド プラス思考 自己成長 日本」を検索し、上位3件のタイトルを今日のネタにする
2. **対象アカウントを回す**
   - 今は `ise_satoshi` **1アカウントだけ**。
     他の6アカウントと有料マガジンは2026-07-25から停止中(`WEEKLY_ACCOUNTS = []`)。
     手が回っていないだけなので、再開したくなったら配列に足すだけで戻せる。
3. **章立てを作る** (`generate-note.js` の `generateChapters()`)
   - `data/note_personas.json` からアカウント別のsystemプロンプトを読む
     (「客」ではなく「お客さま」、カタカナの理論用語禁止、
      一人経営なのでスタッフ・部下の話は書かない、等のルールが入っている)
   - GroqにJSONモードで「第1章〜第5章＋あとがき」の6パートの
     `{title, summary}` を作らせる
4. **本文を1章ずつ書く**
   - 章ごとに個別にGroqを呼ぶ。**前の章までの本文(2000字)を毎回渡して**
     「同じエピソード・同じ言い回しの再利用は禁止」と指示する
     → これで全体が同じ話の繰り返しにならない
   - 1章あたり800〜1000字・口語体・2〜4文ごとに空行を入れる
   - 章と章の間で1.5秒待つ(レート制限対策)
   - 出力形式: 冒頭に `目次` ブロック、各章は `【大見出し】タイトル` + 絵文字 + 本文
     (`【大見出し】` はnoteエディタで見出しにする目印。投稿時にこの文字自体は消す)
5. **画像を5枚つける** (`attachImages()`)
   - 記事冒頭1000字をGroqに渡して、英語のストックフォト検索キーワードを5個作らせる
     (失敗したら固定キーワードにフォールバック)
   - `fetchStockImage()` が Pexels → Pixabay → Unsplash の順で試す
     ※ただし `wf1-note.yml` は `UNSPLASH_API_KEY` しか渡していないので実質Unsplashのみ
   - `image1.jpg`〜`image5.jpg` を保存し、本文中に
     `📷【ここに画像1を挿入: image1.jpg】` というマーカーを差し込む
     (1枚目は冒頭直後に固定、残りはランダムな段落間)
6. **保存してコミット**
   - `note_drafts/<アカウント>/<YYYY-MM-DD>/draft.txt` と画像を保存
   - note-bot名義で `git add note_drafts data` → commit → push
   - **noteへの投稿は自動化していない。手動でコピペする運用。**

### WF4: Instagramリール(毎日 JST 4:40)

`wf4-reels.yml` → `scripts/run-wf4.js` → `scripts/generate-reel.js`

- `run-wf4.js` はアカウント配列を回すだけ。各アカウントは内部で投稿間隔を判定してスキップする
- **`satoshi_mind_coaching` はこの配列から外してある**。
  2026-08-05から専用の `wf-hitmehard.yml` に置き換えたので、
  ここに戻すと1日2回投稿になってしまう
- 台本をGroqで作り、Pexels/PixabayのB-roll実写動画を集め、
  VOICEVOXでナレーションを作り、Remotionで合成して投稿する
- 設定は `data/wf4_accounts.json`(ペルソナ・IGユーザーID・投稿間隔・CTA文)

### WF-hitmehard: 「ハッとしたんだよね」(毎日 JST 4:50)

`wf-hitmehard.yml` → `scripts/generate-hitmehard.js`

1. Groqでその日のテーマを決め、5スライド分のシーン説明と
   各スライド3フレーズ(日本語+英語)＝計15フレーズ、キャプションをJSONで作る
2. gpt-image-1(low画質)で**背景が全部違う**ちびキャラ鉛筆画を5枚生成する
   (背景が似ると盗作っぽく見えるので、毎回別のロケーションにするのが決まり)
3. VOICEVOXで15フレーズ分のナレーションを作る
   (玄野武宏・ノーマル、speedScale 0.85、pauseLengthScale 1.2、prePhonemeLength 0)
4. ffmpegで15セグメント(画像+日英テロップ+音声)を作って連結する
   - **各セグメントの音声を `apad` で動画尺ぴったりに伸ばす**のが重要。
     これをしないと1本の中で字幕と音声がじわじわズレていく
5. litterbox → uguu → tmpfiles の順で一時公開URLにアップして、Instagramにリール投稿
6. 同じ動画をYouTube Shortsにも投稿する(`satoshi_mind_coach`チャンネル)
   - WF6の既存投稿は**そのまま残す**。これは置き換えではなく追加

`HITMEHARD_DRY_RUN=1` を付けると投稿せずに生成だけ試せます。

### WF6: YouTube 9チャンネル(各チャンネル毎日・時刻バラバラ)

`wf6-daily-8channels.yml` → `scripts/daily-pipeline/generate_script.js`
→ `scripts/daily-pipeline/hf_build_and_upload.js`

- cronが9本あり、**どのcronで起動したかでアカウントを決めている**
- `data/daily_topics.json` のお題プールを順番に消化し、
  どこまで進んだかを `data/daily_state.json` に記録してコミットで戻す
- ペルソナ・ナレーター・LP誘導文は `data/daily_config.json`
- **今の形(ちびキャラのスライドを2枚出してからフリー動画に移る流れ)は
  気に入っているので絶対に崩さないでほしい**

### 動画フォーマットの決まりごと(絶対に崩さない)

- **Instagram Reels は必ず 1080x1920 (9:16)**。4:5や1:1だと
  「Media upload has failed (error 2207077)」で弾かれる。
- **音声は 128kbps AAC 程度に抑える**。320kbpsだと同じく2207077で弾かれる。
  Remotion出力後にffmpegで音声だけ再エンコードしている。
- 字幕は画面幅1080pxを超えないよう自動で折り返す。日本語は句読点付近、英語は単語区切り。

### キャラクター

- **聖さんchibi**: `remotion/assets/satoshi_chibi/` (mouth_closed/open/half + ポーズ差分)
- **あかり(対談の質問役)**: `remotion/assets/akari_chibi/`
- 口パクは音声の波形を解析して口画像を切り替える(`ChibiOverlay.tsx`)
- 背景透過に失敗した画像は、彩度と明度でクロマキーする自作スクリプトで直した経緯あり

## お願いしたいこと

以下の順で新PC環境を整えるのを手伝ってください。

### 1. 必要なツールのインストール確認
- Node.js (LTS)
- Git
- GitHub CLI (`gh`) → `gh auth login` でログイン
- ffmpeg (ローカルで動画確認する場合)

まず何が入っていて何が足りないか調べてください。

### 2. リポジトリの取得
```
git clone https://github.com/iseise0226/sns-automation.git
```
※Cドライブ直下など、OneDrive外に置いてください。

### 3. 動作確認
GitHub Actionsが正常に回っているか確認してください:
```
gh run list --limit 20
```
失敗しているワークフローがあれば原因を調べてください。

### 4. 前のPCから引き継ぐもの(私が手動でコピーします)
- `C:\Users\<ユーザー名>\.claude\projects\...\memory\` フォルダ
  → これがないとClaudeが私のことを覚えていない状態になります。
  コピー先の正しいパスを教えてください。
  ※同じClaudeアカウントでログインしていれば自動で引き継がれるはずですが、
    念のためコピーも用意しています。中には収益化ロードマップなど、
    時間をかけて考えてきた内容が入っています。

### 5. 流れを理解できたか確認させてください
上の「処理の流れ」を読んだうえで、次の3つに答えてください。
ここが合っていれば、私と同じ前提で作業を進められます。

1. WF1で、私がGoogleドキュメントに何も書かなかった日は、記事のネタはどこから来ますか？
2. `satoshi_mind_coaching` は今どのワークフローで投稿されていますか？
   なぜ `run-wf4.js` のアカウント配列から外してあるのですか？
3. Instagramに動画を投稿するとき、なぜ一度 litterbox などにアップロードするのですか？

## 注意点・ハマりどころ

- **APIキーはローカルには置いていません**。すべてGitHub Secretsにあります。
  なのでローカルではAI生成・投稿のテストはできません。
  テストしたいときは `gh workflow run <ワークフロー名> -f no_upload=true` で
  クラウド上で動画だけ作り、artifactでダウンロードして確認する運用にしています。
- **OpenAIは自動チャージを設定していません**。残高がマイナスになると
  画像生成が全部止まります。定期的に
  https://platform.openai.com/settings/organization/billing/overview を確認。
- **Groqは無料枠**で1日のトークン上限があります。テストを繰り返すと
  上限に当たって台本生成が失敗します(翌日リセット)。
- **Instagramのアクセストークンは60日で期限切れ**します。期限14日前には
  更新が必要だと教えてください。
- **Threadsのトークンにも期限**があります。

まずは1番の「何が入っていて何が足りないか」の確認からお願いします。

==== ここまでコピー ====

---

## 補足:このファイル自体について

このファイルはリポジトリ内にあるので、新PCで `git clone` した時点で
一緒についてきます。新PCでClaude Codeを開いて
「SETUP_PROMPT_FOR_NEW_PC.md を読んで」と言うだけでもOKです。
