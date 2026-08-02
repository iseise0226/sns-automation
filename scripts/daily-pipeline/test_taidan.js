// 対談モードの見た目確認用(手書き台本)。音声なし=既定尺でHTML組み立て→snapshot/renderで確認。
const path = require('path');
const { build } = require('./hf_build');
const HF_DIR = path.join(__dirname, '..', '..', 'hyperframes');

const scenes = [
  {
    type: 'title',
    title: '知らないと損するお金の話',
    beats: [{ sub: '年金を受け取る方に、8月から大事な封筒が届きます。', speaker: 's', text: '年金の**封筒**、放置は危険' }],
  },
  {
    type: 'body',
    layout: 'process',
    title: '封筒が届いてからの流れ',
    items: [
      { t: '封筒が届く', icon: 'envelope' },
      { t: '中身を確認', icon: 'document_check' },
      { t: '期限内に返送', icon: 'calendar' },
    ],
    pinNote: '簡易書留で届く',
    conclusion: ['差出人は日本年金機構', '中身は意向確認書', '順次発送'],
    beats: [
      { sub: '先生、この封筒って何なんですか？', speaker: 'q' },
      { sub: '日本年金機構からの「意向確認書」だね。順番に見ていこう。', speaker: 's' },
      { sub: 'なるほど、返送も必要なんですね。', speaker: 'q' },
    ],
  },
  {
    type: 'body',
    layout: 'databadge',
    chart: {
      label: '受け取り開始年齢',
      caption: '受け取りを遅らせると**増える**',
      from: { v: '65', unit: '歳', year: '通常' },
      to: { v: '75', unit: '歳', year: '繰下げ' },
      badge: '最大**84%**増える',
    },
    steps: {
      label: '判断のポイント',
      items: [
        { t: '健康状態', icon: 'person_calm' },
        { t: '貯蓄額', icon: 'wallet' },
        { t: '働く予定', icon: 'gear' },
        { t: '家族構成', icon: 'flag' },
      ],
    },
    beats: [
      { sub: 'えっ、遅らせるとそんなに増えるんですか？', speaker: 'q' },
      { sub: 'そう。ただし人によって正解は違うんだ。', speaker: 's' },
    ],
  },
  {
    type: 'cta',
    ctaUrl: '',
    beats: [
      { sub: '今日は年金の封筒についてお話ししました。', speaker: 's' },
      { sub: '続きは概要欄のLINEから受け取れます。', speaker: 's' },
      { sub: '今日も、いい一日にしていきましょう。', speaker: 's' },
    ],
  },
];

const { total, scenes: timed } = build(scenes, HF_DIR, {
  title: 'taidan_test',
  footer: 'お金の話｜対談',
  taidan: true,
  qLabel: 'あかり',
  sLabel: 'いせ先生',
});
console.log(`total=${total.toFixed(1)}s scenes=${timed.length}`);
