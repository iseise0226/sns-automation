// 対談モードの実レンダーテスト(音声つき・アップロードなし)。VOICEVOXはキー不要でローカル可。
// 先生役=玄野武宏 / 質問役=四国めたん。ビートのspeakerで声を切り替える。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ensureEngine, resolveSpeakerId, tts, audioDuration, pickBgm } = require('./hf_common');
const { build } = require('./hf_build');

const ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'voicevox_engine');
const REPO_ROOT = path.join(__dirname, '..', '..');
const HF_DIR = path.join(REPO_ROOT, 'hyperframes');
const MEDIA_DIR = path.join(HF_DIR, 'assets', 'media');
const BGM_ROOT = path.join(REPO_ROOT, 'remotion', 'assets', 'bgm');
const OUT = path.join(__dirname, 'out', 'taidan_test');

const scenes = [
  { type: 'title', title: '知らないと損するお金の話',
    beats: [{ sub: '先生、年金の封筒が届いたんですけど、これ何ですか？', speaker: 'q', text: '年金の**封筒**、放置は危険' }] },
  { type: 'points', layout: 'process', title: '封筒が届いてからの流れ',
    items: [{ t: '封筒が届く', icon: 'envelope' }, { t: '中身を確認', icon: 'document_check' }, { t: '期限内に返送', icon: 'calendar' }],
    pinNote: '簡易書留', conclusion: ['差出人は日本年金機構', '中身は意向確認書', '順次発送'],
    beats: [
      { sub: 'なんだか難しそうで、開けるのが不安で…', speaker: 'q' },
      { sub: '大丈夫。日本年金機構からの意向確認書だよ。', speaker: 's' },
      { sub: '中身を確認して、期限内に返送すればいいんですね。', speaker: 'q' },
      { sub: 'そう。簡易書留で順番に届くから、落ち着いて対応しよう。', speaker: 's' },
    ] },
  { type: 'points', layout: 'databadge',
    chart: { label: '受け取り開始年齢', caption: '受け取りを遅らせると\n**増える**', from: { v: '65', unit: '歳', year: '通常' }, to: { v: '75', unit: '歳', year: '繰下げ' }, badge: '最大\n増える' },
    steps: { label: '判断のポイント', items: [{ t: '健康状態', icon: 'person_calm' }, { t: '貯蓄額', icon: 'wallet' }, { t: '働く予定', icon: 'gear' }, { t: '家族構成', icon: 'flag' }] },
    beats: [
      { sub: 'えっ、遅らせるとそんなに増えるんですか？', speaker: 'q' },
      { sub: 'そう。ただ、正解は人によって違うんだ。', speaker: 's' },
    ] },
  { type: 'cta',
    beats: [
      { sub: '今日は年金の封筒についてお話ししました。', speaker: 's' },
      { sub: '続きは概要欄のLINEから受け取れます。', speaker: 's' },
      { sub: '今日も、いい一日にしていきましょう。', speaker: 's' },
    ] },
];

function mux(videoIn, videoOut, narrations, bgmPath, total) {
  const args = ['-y', '-i', videoIn];
  const filters = [];
  const labels = [];
  narrations.forEach((n, i) => {
    args.push('-i', n.file);
    const ms = Math.round(n.at * 1000);
    filters.push(`[${i + 1}:a]adelay=${ms}|${ms}[n${i}]`);
    labels.push(`[n${i}]`);
  });
  let last;
  if (labels.length) { filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[nar]`); last = '[nar]'; }
  if (bgmPath) {
    const bi = narrations.length + 1;
    args.push('-stream_loop', '-1', '-i', bgmPath);
    filters.push(`[${bi}:a]volume=0.07,atrim=0:${total}[bg]`);
    last = last ? (filters.push(`${last}[bg]amix=inputs=2:normalize=0:dropout_transition=0[aout]`), '[aout]') : '[bg]';
  }
  if (!last) { fs.copyFileSync(videoIn, videoOut); return; }
  args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', last, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), videoOut);
  execFileSync('ffmpeg', args, { stdio: 'inherit', timeout: 1800000 });
}

(async () => {
  await ensureEngine(ENGINE_DIR);
  const sensei = await resolveSpeakerId('玄野武宏', 'ノーマル');
  let akari;
  try { akari = await resolveSpeakerId('四国めたん', 'ノーマル'); }
  catch { akari = await resolveSpeakerId('春日部つむぎ', 'ノーマル'); }
  console.log('声: 先生=', sensei, ' あかり=', akari);

  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const audioDir = path.join(OUT, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const audio = [];
    for (let j = 0; j < sc.beats.length; j++) {
      const b = sc.beats[j];
      const file = path.join(audioDir, `s${i + 1}b${j + 1}.wav`);
      await tts(b.sub || '。', b.speaker === 'q' ? akari : sensei, file);
      audio.push({ file, dur: audioDuration(file) });
    }
    sc.audio = audio;
    console.log(`TTS ${i + 1}/${scenes.length}`);
  }

  const { total, scenes: timed } = build(scenes, HF_DIR, {
    title: 'taidan_test', footer: 'お金の話｜対談', taidan: true, qLabel: 'あかり', sLabel: 'いせ先生',
  });
  console.log(`合計 ${total.toFixed(1)}秒 / ${timed.length}シーン`);

  execFileSync('npx', ['--yes', 'hyperframes@0.7.77', 'check'], { cwd: HF_DIR, stdio: 'inherit', shell: true, timeout: 600000 });
  fs.mkdirSync(OUT, { recursive: true });
  const silent = path.join(OUT, 'silent.mp4');
  execFileSync('npx', ['--yes', 'hyperframes@0.7.77', 'render', '--output', silent], { cwd: HF_DIR, stdio: 'inherit', shell: true, timeout: 5400000 });

  const narrations = [];
  for (const sc of timed) for (const b of sc.beats) if (b.audioFile) narrations.push({ file: b.audioFile, at: b.absStart });
  const bgm = pickBgm(BGM_ROOT, '穏やか');
  const outMp4 = path.join(OUT, '対談テスト.mp4');
  mux(silent, outMp4, narrations, bgm, total);
  console.log('完成:', outMp4);
})().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
