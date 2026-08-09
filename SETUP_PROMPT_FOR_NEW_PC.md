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
| `wf1-note.yml` | note記事の下書き生成(自動投稿はしない・手動コピペ) | 6:00 |
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
├── .github/workflows/       # 自動投稿のスケジュール定義
├── scripts/
│   ├── daily-pipeline/      # YouTube用(HyperFrames)
│   │   ├── generate_script.js          # 台本AI生成の共通ロジック
│   │   ├── hf_layouts.js               # 図解レイアウト定義(階段/工程図/データ等)
│   │   ├── hf_build.js                 # 台本JSON → HTML組み立て
│   │   └── hf_build_and_upload.js      # レンダー→YouTube投稿
│   ├── generate-reel.js     # Instagramリール生成
│   ├── generate-hitmehard.js # 「ハッとしたんだよね」形式
│   ├── post_taidan_reel.js  # 2キャラ対談リール
│   └── run-wf4.js           # リール投稿の司令塔
├── remotion/
│   ├── src/*.tsx            # 動画コンポーネント
│   └── assets/              # キャラ画像・BGM・SE
└── data/
    ├── daily_config.json    # アカウントごとのペルソナ設定
    ├── daily_topics.json    # お題プール(順番に消化)
    ├── daily_state.json     # 今どのお題まで進んだか
    └── wf4_accounts.json    # Instagram側のアカウント設定
```

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
