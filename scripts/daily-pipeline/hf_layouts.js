// WF6の台本シーン → HyperFramesのHTML断片＋GSAPアニメ定義に変換するレイアウト型。
// デザインは hyperframes_test/yt_style1〜5・yt_cut1〜4（2026-07-25に確定）をそのまま踏襲する。
//   背景#ffffff / 文字#1a1a1a / 赤#d92b2b / マーカー#ffe94d / 黄ベタ#ffe500 / 字幕バー#16202e / 線画#2b2b2b
const { icon } = require('./hf_icons');

const RED = '#d92b2b';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// **強調** を黄色マーカー(白背景用)か黄色ベタ塗り(実写・暗い背景用)に変換する
function rich(text, mode = 'mark') {
  const parts = String(text == null ? '' : text).split(/\*\*(.+?)\*\*/g);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      out += esc(parts[i]);
    } else if (mode === 'box') {
      out += `<span class="hlbox">${esc(parts[i])}</span>`;
    } else if (mode === 'red') {
      // 黄色ベタの上ではマーカーが見えないので赤文字で強調する
      out += `<span class="red">${esc(parts[i])}</span>`;
    } else {
      out += `<span class="mk"><span class="mk-bar"></span><span class="mk-tx">${esc(parts[i])}</span></span>`;
    }
  }
  return out;
}

// 改行は<br>を使わずブロック要素に分ける(HyperFramesのレイアウト規約)
function lines(text, mode = 'mark', cls = 'ln') {
  return String(text == null ? '' : text)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => `<div class="${cls}">${rich(l, mode)}</div>`)
    .join('');
}

// 強調記号を除いた実文字数。フォントの自動縮小に使う
function plainLen(text) {
  return String(text == null ? '' : text).replace(/\*\*/g, '').replace(/\n/g, '').length;
}
function longestLine(text) {
  return String(text == null ? '' : text)
    .replace(/\*\*/g, '')
    .split('\n')
    .reduce((m, l) => Math.max(m, l.length), 0);
}
// 1行に収まる想定文字数を超えたぶんだけ字を小さくする(下限あり)
function fitFont(text, base, perLine, min) {
  const n = longestLine(text);
  if (n <= perLine) return base;
  return Math.max(min, Math.round((base * perLine) / n));
}

function A(sel, from, to, dur, ease, at) {
  return { sel, from, to, dur, ease, at };
}

// 強調やn行目が無いのにアニメを積むとGSAPが「target not found」を出すので、
// 実際に要素があるときだけアニメを足す
function hasMk(...texts) {
  return texts.some((t) => /\*\*.+?\*\*/.test(String(t == null ? '' : t)));
}
function lineCount(text) {
  return String(text == null ? '' : text).split('\n').filter((l) => l.trim() !== '').length;
}

// 見出し(points型の大見出し)
function headline(sid, title) {
  if (!title) return { html: '', anims: [] };
  const size = fitFont(title, 82, 20, 54);
  return {
    html: `<div class="hd" id="${sid}-hd" style="font-size:${size}px">${rich(title)}</div>`,
    anims: [
      A(`#${sid}-hd`, { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 0.6, 'power3.out', 0.1),
      ...(hasMk(title) ? [A(`#${sid}-hd .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.45, 'power2.inOut', 0.75)] : []),
    ],
  };
}

// ---- ①3カラムの流れ(yt_style) ----------------------------------------
function flow3(scene, ctx) {
  const { sid, beats } = ctx;
  const hd = headline(sid, scene.title);
  const n = beats.length;
  const colW = n >= 3 ? 440 : 560;
  const parts = [];
  const anims = [...hd.anims];

  beats.forEach((b, i) => {
    if (i > 0) {
      parts.push(
        `<svg class="arw" id="${sid}-a${i}" viewBox="0 0 110 60" fill="none" stroke="#9a9a9a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 30h84" /><path d="M72 12l22 18-22 18" /></svg>`
      );
      anims.push(A(`#${sid}-a${i}`, { x: -20, opacity: 0 }, { x: 0, opacity: 1 }, 0.4, 'power2.out', b.start - 0.1));
    }
    const topSize = fitFont(b.text, 44, 9, 30);
    const noteSize = fitFont(b.note, 38, 11, 27);
    parts.push(
      `<div class="col" id="${sid}-b${i}" style="width:${colW}px">` +
        `<div class="col-top" style="font-size:${topSize}px">${lines(b.text)}</div>` +
        `<div class="art">${icon(b.icon, 250, '#2b2b2b', 3.1)}</div>` +
        `<div class="col-bot" style="font-size:${noteSize}px">${lines(b.note)}</div>` +
        `</div>`
    );
    anims.push(
      A(`#${sid}-b${i} .col-top`, { y: 24, opacity: 0 }, { y: 0, opacity: 1 }, 0.5, 'power3.out', b.start + 0.1),
      A(`#${sid}-b${i} .art`, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1 }, 0.5, 'back.out(1.7)', b.start + 0.35),
      A(`#${sid}-b${i} .col-bot`, { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, 0.5, 'power3.out', b.start + 0.7)
    );
    if (hasMk(b.text, b.note)) {
      anims.push(A(`#${sid}-b${i} .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.45, 'power2.inOut', b.start + 1.1));
    }
  });

  return {
    html: `${hd.html}<div class="cols">${parts.join('')}</div>`,
    anims,
  };
}

// ---- ②丸アイコンの手順(yt_style2の右側・yt_style4) ---------------------
function iconsteps(scene, ctx) {
  const { sid, beats } = ctx;
  const hd = headline(sid, scene.title);
  const n = beats.length;
  const circle = n >= 4 ? 280 : 330;
  const parts = [];
  const anims = [...hd.anims];

  beats.forEach((b, i) => {
    if (i > 0) {
      parts.push(
        `<svg class="sarw" id="${sid}-a${i}" viewBox="0 0 54 34" fill="none" stroke="#2b2b2b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="margin-top:${circle / 2 - 17}px"><path d="M6 17h34" /><path d="M32 7l12 10-12 10" /></svg>`
      );
      anims.push(A(`#${sid}-a${i}`, { x: -14, opacity: 0 }, { x: 0, opacity: 1 }, 0.35, 'power2.out', b.start - 0.08));
    }
    const labSize = fitFont(b.text, n >= 4 ? 36 : 42, 6, 26);
    parts.push(
      `<div class="step" id="${sid}-b${i}">` +
        `<div class="scircle" style="width:${circle}px;height:${circle}px">${icon(b.icon, circle * 0.52, '#2b2b2b', 4)}</div>` +
        `<div class="slabel" style="font-size:${labSize}px">${lines(b.text)}</div>` +
        `</div>`
    );
    anims.push(
      A(`#${sid}-b${i} .scircle`, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }, 0.5, 'back.out(2)', b.start + 0.1),
      A(`#${sid}-b${i} .slabel`, { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, 0.4, 'power3.out', b.start + 0.4)
    );
    if (hasMk(b.text)) {
      anims.push(A(`#${sid}-b${i} .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.4, 'power2.inOut', b.start + 0.8));
    }
  });

  return { html: `${hd.html}<div class="steps">${parts.join('')}</div>`, anims };
}

// ---- ③左に否定・右に本題(yt_style2) ------------------------------------
function reject(scene, ctx) {
  const { sid, beats } = ctx;
  const b0 = beats[0];
  const b1 = beats[1] || beats[0];
  const denySize = fitFont(b0.text, 52, 16, 36);
  const bigSize = fitFont(b1.text, 62, 15, 40);

  const html =
    `<div class="split">` +
    `<div class="side-l" id="${sid}-b0">` +
    `<div class="deny" style="font-size:${denySize}px">${lines(b0.text)}</div>` +
    `<div class="deny-art">${icon(b0.icon, 300, '#2b2b2b', 4)}` +
    `<svg class="xmark" viewBox="0 0 300 300" fill="none" stroke="${RED}" stroke-width="16" stroke-linecap="round">` +
    `<path class="x1" d="M40 40l220 220" stroke-dasharray="312" stroke-dashoffset="312" />` +
    `<path class="x2" d="M260 40L40 260" stroke-dasharray="312" stroke-dashoffset="312" /></svg></div>` +
    `<div class="deny-note">${rich(b0.note || '')}</div>` +
    `</div>` +
    `<div class="divider"></div>` +
    `<div class="side-r" id="${sid}-b1">` +
    `<div class="lead">お伝えしたいのは</div>` +
    `<div class="ybar"><div class="yfill"></div><div class="ytx" style="font-size:${bigSize}px">${lines(b1.text, 'red')}</div></div>` +
    `<div class="r-art">${icon(b1.icon, 290, '#2b2b2b', 3.4)}</div>` +
    `</div></div>`;

  return {
    html,
    anims: [
      A(`#${sid}-b0 .deny`, { y: 24, opacity: 0 }, { y: 0, opacity: 1 }, 0.5, 'power3.out', b0.start + 0.1),
      ...(hasMk(b0.text, b0.note)
        ? [A(`#${sid}-b0 .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.45, 'power2.inOut', b0.start + 0.55)]
        : []),
      A(`#${sid}-b0 .deny-art > svg:first-child`, { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1 }, 0.5, 'back.out(1.6)', b0.start + 0.4),
      A(`#${sid}-b0 .x1`, { strokeDashoffset: 312 }, { strokeDashoffset: 0 }, 0.32, 'power2.in', b0.start + 1.0),
      A(`#${sid}-b0 .x2`, { strokeDashoffset: 312 }, { strokeDashoffset: 0 }, 0.32, 'power2.in', b0.start + 1.32),
      A(`#${sid}-b0 .deny-note`, { opacity: 0 }, { opacity: 1 }, 0.4, 'power2.out', b0.start + 1.7),
      A(`#${sid}-b1 .lead`, { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, 0.4, 'power3.out', b1.start + 0.1),
      A(`#${sid}-b1 .yfill`, { scaleX: 0 }, { scaleX: 1 }, 0.5, 'power2.inOut', b1.start + 0.35),
      A(`#${sid}-b1 .ytx`, { opacity: 0 }, { opacity: 1 }, 0.35, 'power2.out', b1.start + 0.6),
      A(`#${sid}-b1 .r-art`, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1 }, 0.5, 'back.out(1.8)', b1.start + 0.9),
    ],
  };
}

// ---- ④実写4秒カット(yt_cut) --------------------------------------------
function cut(scene, ctx) {
  const { sid, beats } = ctx;
  const b = beats[0];
  const size = fitFont(b.text, 104, 12, 62);
  const anims = [];
  for (let k = 1; k <= lineCount(b.text); k++) {
    anims.push(A(`#${sid}-b0 .cline:nth-child(${k})`, { y: 24, opacity: 0 }, { y: 0, opacity: 1 }, 0.45, 'power3.out', 0.15 * k));
  }
  if (hasMk(b.text)) {
    anims.push(A(`#${sid}-b0 .hlbox`, { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1 }, 0.4, 'back.out(2.2)', 0.85));
  }
  return {
    html:
      // 実写が取れなかったときだけ濃紺のベタを敷いて文字を読ませる
      (ctx.hasVideo ? '' : `<div class="cut-solid"></div>`) +
      `<div class="scrim"></div>` +
      `<div class="cut-copy" id="${sid}-b0" style="font-size:${size}px">${lines(b.text, 'box', 'cline')}</div>`,
    anims,
  };
}

// ---- ⑤タイトル(冒頭) ---------------------------------------------------
function titleScene(scene, ctx) {
  const { sid, beats } = ctx;
  const b = beats[0];
  const size = fitFont(b.text, 96, 14, 56);
  const kicker = scene.title || '';
  return {
    html:
      (kicker ? `<div class="pillwrap"><span class="pill" id="${sid}-pill">${esc(kicker)}</span></div>` : '') +
      `<div class="title-copy" id="${sid}-b0" style="font-size:${size}px">${lines(b.text)}</div>` +
      `<div class="title-rule" id="${sid}-rule"></div>`,
    anims: [
      ...(kicker ? [A(`#${sid}-pill`, { y: -24, opacity: 0 }, { y: 0, opacity: 1 }, 0.5, 'power3.out', 0.15)] : []),
      A(`#${sid}-b0`, { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 0.7, 'power3.out', 0.4),
      ...(hasMk(b.text) ? [A(`#${sid}-b0 .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.5, 'power2.inOut', 1.2)] : []),
      A(`#${sid}-rule`, { scaleX: 0 }, { scaleX: 1 }, 0.6, 'power2.inOut', 0.9),
    ],
  };
}

// ---- ⑥締め(CTA) --------------------------------------------------------
function ctaScene(scene, ctx) {
  const { sid, beats, footer } = ctx;
  const parts = [];
  const anims = [];
  beats.forEach((b, i) => {
    const size = fitFont(b.text, 50, 20, 34);
    parts.push(`<div class="cta-line" id="${sid}-b${i}" style="font-size:${size}px">${lines(b.text)}</div>`);
    anims.push(A(`#${sid}-b${i}`, { y: 22, opacity: 0 }, { y: 0, opacity: 1 }, 0.5, 'power3.out', b.start + 0.1));
    if (hasMk(b.text)) {
      anims.push(A(`#${sid}-b${i} .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.4, 'power2.inOut', b.start + 0.6));
    }
  });
  const url = scene.ctaUrl ? `<div class="cta-url" id="${sid}-url">${esc(scene.ctaUrl)}</div>` : '';
  if (scene.ctaUrl) {
    anims.push(A(`#${sid}-url`, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1 }, 0.5, 'back.out(1.8)', (beats[1] || beats[0]).start + 0.5));
  }
  return {
    html: `<div class="cta-wrap">${parts.join('')}${url}</div><div class="cta-foot">${esc(footer || '')}</div>`,
    anims,
  };
}

const LAYOUTS = { flow3, iconsteps, reject, cut, title: titleScene, cta: ctaScene };

// シーンからレイアウト関数を決める。想定外の組み合わせはビート数から安全側に倒す
function pickLayout(scene) {
  if (scene.type === 'cut' || scene.type === 'stock') return 'cut';
  if (scene.type === 'title') return 'title';
  if (scene.type === 'cta') return 'cta';
  const n = (scene.beats || []).length;
  const want = scene.layout;
  if (want === 'reject' && n === 2) return 'reject';
  if (want === 'flow3' && n >= 2 && n <= 3) return 'flow3';
  if (want === 'iconsteps' && n >= 3 && n <= 4) return 'iconsteps';
  if (n === 2) return 'reject';
  if (n >= 3) return 'iconsteps';
  return 'flow3';
}

const BASE_CSS = `
@font-face{font-family:"Zen Maru Gothic";font-weight:400;src:url("assets/fonts/ZenMaruGothic-Regular.ttf") format("truetype")}
@font-face{font-family:"Zen Maru Gothic";font-weight:700;src:url("assets/fonts/ZenMaruGothic-Bold.ttf") format("truetype")}
@font-face{font-family:"Zen Maru Gothic";font-weight:900;src:url("assets/fonts/ZenMaruGothic-Black.ttf") format("truetype")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:#ffffff}
body{font-family:"Zen Maru Gothic",sans-serif;color:#1a1a1a}
#root{position:relative;width:1920px;height:1080px}
#paper{position:absolute;inset:0;background:#ffffff}
.scene{position:absolute;inset:0}

/* 強調(白背景=黄色マーカー / 暗い背景=黄色ベタ) */
.mk{position:relative;display:inline-block}
.mk-bar{position:absolute;left:-.04em;right:-.04em;bottom:.16em;height:.44em;background:#ffe94d;transform:scaleX(0);transform-origin:left center}
.mk-tx{position:relative}
.hlbox{display:inline-block;background:#ffe500;color:#1a1a1a;text-shadow:none;padding:0 .12em;border-radius:10px;transform-origin:50% 50%}
.red{color:${RED}}

/* 見出し */
.hd{position:absolute;top:86px;left:0;width:1920px;text-align:center;font-weight:800;letter-spacing:2px;line-height:1.3}

/* ①3カラム */
.cols{position:absolute;top:250px;left:110px;width:1700px;height:620px;display:flex;align-items:flex-start;justify-content:space-evenly}
.col{display:flex;flex-direction:column;align-items:center;text-align:center}
.col-top{font-weight:700;line-height:1.5;min-height:170px}
.art{width:260px;height:260px;margin:14px 0 24px;display:flex;align-items:center;justify-content:center}
.col-bot{font-weight:600;line-height:1.6;color:#2b2b2b}
.arw{width:110px;height:60px;margin-top:300px;flex:none}

/* ②丸アイコンの手順 */
.steps{position:absolute;top:300px;left:80px;width:1760px;height:540px;display:flex;align-items:flex-start;justify-content:center;gap:26px}
.step{display:flex;flex-direction:column;align-items:center;flex:none}
.scircle{border:5px solid #2b2b2b;border-radius:50%;display:flex;align-items:center;justify-content:center}
.slabel{margin-top:20px;font-weight:700;text-align:center;line-height:1.35}
.sarw{width:54px;height:34px;flex:none}

/* ③左否定・右本題 */
.split{position:absolute;top:110px;left:70px;width:1780px;height:740px;display:flex;align-items:stretch}
.side-l{width:770px;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:10px}
.deny{font-weight:800;line-height:1.5}
.deny-art{position:relative;width:300px;height:300px;margin-top:26px}
.deny-art > svg{position:absolute;inset:0}
.xmark{position:absolute;inset:0;width:300px;height:300px}
.deny-note{margin-top:22px;font-size:38px;font-weight:700;color:${RED}}
.divider{width:4px;background:#d9d9d9;margin:0 60px;border-radius:2px}
.side-r{width:880px;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:10px}
.lead{font-size:40px;font-weight:700;color:#555}
.ybar{position:relative;margin-top:20px;padding:22px 40px;width:100%}
.yfill{position:absolute;inset:0;background:#ffe500;border-radius:12px;transform:scaleX(0);transform-origin:left center}
.ytx{position:relative;font-weight:900;line-height:1.45}
.r-art{margin-top:52px}

/* ④実写カット(動画のラッパーは無時間・透明。時間はvideo要素側に付ける) */
.cut-video{position:absolute;inset:0;overflow:hidden}
.cut-video video{width:1920px;height:1080px;object-fit:cover}
.cut-solid{position:absolute;inset:0;background:#10161f}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,14,20,.86) 0%,rgba(10,14,20,.56) 30%,rgba(10,14,20,.56) 60%,rgba(10,14,20,.92) 100%)}
.cut-copy{position:absolute;left:0;top:300px;width:1920px;text-align:center;color:#fff;font-weight:900;line-height:1.42}
.cline{text-shadow:0 6px 26px rgba(0,0,0,.8)}

/* ⑤タイトル */
.pillwrap{position:absolute;top:150px;left:0;width:1920px;text-align:center}
.pill{display:inline-block;background:#16202e;color:#fff;font-size:38px;font-weight:700;padding:12px 44px;border-radius:12px;letter-spacing:2px}
.title-copy{position:absolute;top:330px;left:120px;width:1680px;text-align:center;font-weight:900;line-height:1.5}
.title-rule{position:absolute;top:790px;left:660px;width:600px;height:8px;background:${RED};border-radius:4px;transform:scaleX(0);transform-origin:center}

/* ⑥締め */
.cta-wrap{position:absolute;top:150px;left:160px;width:1600px;height:640px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.cta-line{font-weight:700;line-height:1.5}
.cta-url{margin-top:12px;background:#ffe500;border-radius:12px;padding:16px 40px;font-size:44px;font-weight:900}
/* 字幕バー(上端892px)にかぶらないよう、フッターは流し込みから外して固定する */
.cta-foot{position:absolute;top:828px;left:0;width:1920px;text-align:center;font-size:32px;font-weight:700;color:#777}

/* 字幕バー(全型共通) */
.caption{position:absolute;left:60px;bottom:56px;width:1800px;height:132px;background:#16202e;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:18px 56px}
.caption span{font-weight:700;color:#fff;line-height:1.35;text-align:center}
`;

// 字幕文の長さに応じて字を縮める(2行132pxに収める)
function captionFontSize(text) {
  const n = plainLen(text);
  if (n <= 28) return 50;
  if (n <= 40) return 45;
  if (n <= 52) return 40;
  if (n <= 66) return 35;
  if (n <= 84) return 30;
  return 26;
}

module.exports = { LAYOUTS, pickLayout, BASE_CSS, captionFontSize, esc, rich, lines };
