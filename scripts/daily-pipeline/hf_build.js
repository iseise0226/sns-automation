// 台本シーン(ビート単位の音声尺つき) → HyperFramesのコンポジション1本(index.html)を組み立てる。
// 動画全体を1つのタイムラインに並べるので、レンダリングはブラウザ1回起動で済む。
const fs = require('fs');
const path = require('path');
const { LAYOUTS, pickLayout, BASE_CSS, captionFontSize, esc } = require('./hf_layouts');

const FPS = 30;
const BEAT_GAP = 0.25; // ビート間の間(息継ぎ)
const SCENE_TAIL = 0.4; // シーン末尾の余韻

// 聖さんchibiキャラを右下に出す。余白のあるレイアウトだけ(密度の高い図解3種はデータに重なるので出さない)
const CHIBI_LAYOUTS = ['cut', 'title', 'cta', 'iconsteps'];
const CHIBI_POSES = ['default', 'arms_crossed', 'bowing', 'explaining', 'guts', 'pointing_left', 'thinking', 'thumbs_up'];

// 秒をフレーム境界に丸める。字幕とアニメのズレを防ぐ
function q(sec) {
  return Math.round(sec * FPS) / FPS;
}

// scenes: [{type, layout, title, ctaUrl, beats:[{text,note,icon,sub}], audio:[{file,dur}], videoFile}]
// を、開始時刻つきのシーン配列に変換する
function layoutTimeline(scenes) {
  const timed = [];
  let t = 0;
  scenes.forEach((sc, i) => {
    const beats = [];
    let local = 0;
    (sc.beats || []).forEach((b, j) => {
      const d = q((sc.audio?.[j]?.dur || 2) + BEAT_GAP);
      beats.push({ ...b, start: q(local), dur: d, absStart: q(t + local), audioFile: sc.audio?.[j]?.file });
      local = q(local + d);
    });
    const dur = q(local + SCENE_TAIL);
    timed.push({ ...sc, sid: `s${i + 1}`, start: q(t), dur, beats });
    t = q(t + dur);
  });
  return { scenes: timed, total: q(t) };
}

// 1シーン分のchibiオーバーレイ(HTML＋アニメ)。口パクや瞬きは音声解析ができないので、
// defaultポーズのときだけ口を機械的にパクパクさせる(有限repeatでseek可能)。他はポーズ静止画。
function chibiFor(sc) {
  const pose = CHIBI_POSES.includes(sc.pose) ? sc.pose : 'default';
  const talkEnd = sc.beats && sc.beats.length ? sc.beats[sc.beats.length - 1].start + (sc.beats[sc.beats.length - 1].dur || 0) : sc.dur;
  let inner;
  const anims = [];
  if (pose === 'default') {
    inner =
      `<img class="ch-m ch-closed" src="assets/chibi/mouth_closed.png" />` +
      `<img class="ch-m ch-open" src="assets/chibi/mouth_open.png" style="opacity:0" />`;
    // 口をパクパク(ナレーション中だけ・0.16秒刻み)
    const reps = Math.max(2, Math.floor(Math.max(0.5, talkEnd) / 0.16));
    anims.push({ sel: `#${sc.sid}-ch .ch-open`, from: { opacity: 0 }, to: { opacity: 1, repeat: reps, yoyo: true, ease: 'steps(1)' }, dur: 0.16, ease: 'steps(1)', at: 0.2 });
  } else {
    inner = `<img class="ch-m" src="assets/chibi/poses/${pose}.png" />`;
  }
  const html = `<div class="chibi" id="${sc.sid}-ch"><div class="ch-body" id="${sc.sid}-chb">${inner}</div></div>`;
  // 登場(下からふわっ)は外側、ゆっくり上下(生きている感)は内側。translateYの取り合いを避ける
  anims.push({ sel: `#${sc.sid}-ch`, from: { y: 40, opacity: 0 }, to: { y: 0, opacity: 1 }, dur: 0.5, ease: 'power3.out', at: 0.1 });
  const bobReps = Math.max(2, Math.floor(sc.dur / 1.0));
  anims.push({ sel: `#${sc.sid}-chb`, from: { yPercent: 0 }, to: { yPercent: -1.6, repeat: bobReps, yoyo: true, ease: 'sine.inOut' }, dur: 1.0, ease: 'sine.inOut', at: 0.6 });
  return { html, anims };
}

// 対談モード: 2キャラを画面下の左右に常駐させる。
//   左=質問役(assets/chibi2) / 右=先生役=聖さん(assets/chibi)
//   話しているビートの人だけ口をパクパク＋明るく、聞いてる側は少し暗くする。
//   音声解析はできないので口パクは有限repeatのyoyo(seek可能)。
function taidanChars(allBeats, total) {
  const html = [];
  const anims = [];
  const S0 = { start: 0 };
  const sides = [
    { key: 'q', dir: 'chibi2', cls: 'tk-l', track: 6, open: 'tk-lo', body: 'tk-lb', enter: 'tk-le', at: 0.1 },
    { key: 's', dir: 'chibi', cls: 'tk-r', track: 7, open: 'tk-ro', body: 'tk-rb', enter: 'tk-re', at: 0.25 },
  ];
  for (const s of sides) {
    html.push(
      `<div class="tk-ch ${s.cls} clip" data-start="0" data-duration="${total}" data-track-index="${s.track}">` +
        `<div class="tk-enter" id="${s.enter}">` +
        `<div class="tk-cbody" id="${s.body}">` +
        `<img class="ch-m" src="assets/${s.dir}/mouth_closed.png" />` +
        `<img class="ch-m" id="${s.open}" src="assets/${s.dir}/mouth_open.png" style="opacity:0" />` +
        `</div></div></div>`
    );
    // 登場(下からふわっ)は外側、呼吸の上下は内側。translateYの取り合いを避ける
    anims.push({ sel: `#${s.enter}`, from: { y: 54, opacity: 0 }, to: { y: 0, opacity: 1 }, dur: 0.6, ease: 'power3.out', at: s.at, scene: S0 });
    const bobReps = Math.max(2, Math.floor(total / 1.1));
    anims.push({ sel: `#${s.body}`, from: { yPercent: 0 }, to: { yPercent: -1.4, repeat: bobReps, yoyo: true, ease: 'sine.inOut' }, dur: 1.1, ease: 'sine.inOut', at: 0.8, scene: S0 });
  }
  for (const b of allBeats) {
    const isS = b.speaker === 's';
    const openSel = isS ? '#tk-ro' : '#tk-lo';
    const actBody = isS ? '#tk-rb' : '#tk-lb';
    const inaBody = isS ? '#tk-lb' : '#tk-rb';
    // 口パク(0.16秒刻み・偶数回で閉じて終わる)
    let reps = Math.max(2, Math.round((b.dur || 1) / 0.16));
    if (reps % 2) reps += 1;
    anims.push({ sel: openSel, from: { opacity: 0 }, to: { opacity: 1, repeat: reps, yoyo: true, ease: 'steps(1)' }, dur: 0.16, ease: 'steps(1)', at: b.absStart + 0.05, scene: S0 });
    // 話者を明るく・聞き手を少し暗く(ターンの切り替わりがはっきりする)
    anims.push({ sel: actBody, from: { opacity: 0.55 }, to: { opacity: 1 }, dur: 0.28, ease: 'power2.out', at: b.absStart, scene: S0 });
    anims.push({ sel: inaBody, from: { opacity: 1 }, to: { opacity: 0.55 }, dur: 0.28, ease: 'power2.out', at: b.absStart, scene: S0 });
  }
  return { html: html.join(''), anims };
}

function buildHtml(timedScenes, total, opts = {}) {
  const taidan = !!opts.taidan;
  const bodyParts = [];
  const videoParts = [];
  const captionParts = [];
  const chibiParts = [];
  const anims = [];

  for (const sc of timedScenes) {
    const kind = pickLayout(sc);
    const hasVideo = !!sc.videoFile;

    // 実写は「無時間のラッパー＋時間つきvideo要素」。ラッパーを寄せることでズームをかける
    if (kind === 'cut' && hasVideo) {
      videoParts.push(
        `<div class="cut-video" id="${sc.sid}-vw">` +
          `<video id="${sc.sid}-vid" class="clip" src="assets/media/${sc.videoFile}" ` +
          `data-start="${sc.start}" data-duration="${sc.dur}" data-track-index="0" muted playsinline></video>` +
          `</div>`
      );
      anims.push({ sel: `#${sc.sid}-vw`, from: { scale: 1 }, to: { scale: 1.07, transformOrigin: '50% 50%' }, dur: sc.dur, ease: 'none', at: 0, scene: sc });
    }

    const fn = LAYOUTS[kind];
    const built = fn(sc, { sid: sc.sid, beats: sc.beats, dur: sc.dur, footer: opts.footer, hasVideo });
    bodyParts.push(
      `<div class="scene clip" id="${sc.sid}" data-start="${sc.start}" data-duration="${sc.dur}" data-track-index="2">${built.html}</div>`
    );
    for (const a of built.anims) anims.push({ ...a, scene: sc });

    // 字幕はビート単位。読み上げ文をそのまま出す
    sc.beats.forEach((b, j) => {
      if (!b.sub) return;
      const fs2 = captionFontSize(b.sub);
      captionParts.push(
        `<div class="caption clip" id="${sc.sid}-c${j}" data-start="${b.absStart}" data-duration="${b.dur}" data-track-index="9">` +
          `<span style="font-size:${fs2}px">${esc(b.sub)}</span></div>`
      );
      anims.push({ sel: `#${sc.sid}-c${j} span`, from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.3, ease: 'power2.out', at: b.start + 0.05, scene: sc });
    });

    // chibiキャラ(余白のあるレイアウトだけ・useChibi=trueのアカウントだけ)。対談モードでは常駐キャラを使うのでスキップ
    if (!taidan && opts.useChibi && CHIBI_LAYOUTS.includes(kind)) {
      const ch = chibiFor(sc);
      chibiParts.push(
        `<div class="ch-clip clip" id="${sc.sid}-chw" data-start="${sc.start}" data-duration="${sc.dur}" data-track-index="7">${ch.html}</div>`
      );
      for (const a of ch.anims) anims.push({ ...a, scene: sc });
    }
  }

  // 対談モードの2キャラ(全編常駐)。全ビートを絶対時刻で渡す
  if (taidan) {
    const allBeats = [];
    for (const sc of timedScenes) for (const b of sc.beats) allBeats.push(b);
    const tk = taidanChars(allBeats, total);
    chibiParts.push(tk.html);
    for (const a of tk.anims) anims.push(a);
  }

  const tlLines = anims
    .map((a) => {
      const at = q(a.scene.start + a.at);
      if (at >= total) return null;
      return `tl.fromTo(${JSON.stringify(a.sel)},${JSON.stringify(a.from)},${JSON.stringify({ ...a.to, duration: a.dur, ease: a.ease })},${at});`;
    })
    .filter(Boolean);

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>${esc(opts.title || 'daily')}</title>
    <script src="assets/vendor/gsap.min.js"></script>
    <style>${BASE_CSS}</style>
  </head>
  <body class="${taidan ? 'taidan' : ''}">
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
      <div id="paper"></div>
${taidan ? '      <div class="tk-stage"></div>\n' : ''}${videoParts.map((s) => '      ' + s).join('\n')}
${bodyParts.map((s) => '      ' + s).join('\n')}
${chibiParts.map((s) => '      ' + s).join('\n')}
${captionParts.map((s) => '      ' + s).join('\n')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
${tlLines.map((l) => '      ' + l).join('\n')}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

// projectDir(hyperframes/)にindex.htmlを書き出す。素材はassets/media/に置いてある前提
function build(scenes, projectDir, opts = {}) {
  const { scenes: timed, total } = layoutTimeline(scenes);
  const html = buildHtml(timed, total, opts);
  fs.writeFileSync(path.join(projectDir, 'index.html'), html);
  return { total, scenes: timed };
}

module.exports = { build, layoutTimeline, buildHtml, FPS };
