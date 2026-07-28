// 台本シーン(ビート単位の音声尺つき) → HyperFramesのコンポジション1本(index.html)を組み立てる。
// 動画全体を1つのタイムラインに並べるので、レンダリングはブラウザ1回起動で済む。
const fs = require('fs');
const path = require('path');
const { LAYOUTS, pickLayout, BASE_CSS, captionFontSize, esc } = require('./hf_layouts');

const FPS = 30;
const BEAT_GAP = 0.25; // ビート間の間(息継ぎ)
const SCENE_TAIL = 0.4; // シーン末尾の余韻

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

function buildHtml(timedScenes, total, opts = {}) {
  const bodyParts = [];
  const videoParts = [];
  const captionParts = [];
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
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
      <div id="paper"></div>
${videoParts.map((s) => '      ' + s).join('\n')}
${bodyParts.map((s) => '      ' + s).join('\n')}
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
