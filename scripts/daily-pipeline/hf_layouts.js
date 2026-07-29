// WF6の台本シーン → HyperFramesのHTML断片＋GSAPアニメ定義に変換するレイアウト型。
// 元は hyperframes_test/yt_style1〜5・yt_cut1〜4（2026-07-25確定）。
// 2026-07-28に聖さんから「動きが単調・1画面の情報量をもっと増やして・カラフルに」と指摘があり、
// 参考YouTubeの密度に寄せた型(stairs/process/databadge)と青・緑を追加した。
//   背景#ffffff / 文字#1a1a1a / 赤#d92b2b / 青#1c64c4 / 緑#12946a
//   マーカー#ffe94d / 黄ベタ#ffe500 / 字幕バー#16202e / 線画#2b2b2b
const { icon } = require('./hf_icons');

const RED = '#d92b2b';
const BLUE = '#1c64c4';
const GREEN = '#12946a';
const INK = '#1a1a1a';

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
    } else if (mode === 'fill') {
      // 白背景でも黄色ベタ塗り(参考動画の見出しはこれ)
      out += `<span class="hlfill">${esc(parts[i])}</span>`;
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
  const size = fitFont(title, 78, 21, 52);
  // 見出しの強調は参考動画に合わせて黄色ベタ塗り(下線マーカーではない)
  return {
    html: `<div class="hd" id="${sid}-hd" style="font-size:${size}px">${lines(title, 'fill', 'hdl')}</div>`,
    anims: [
      A(`#${sid}-hd`, { y: 28, opacity: 0 }, { y: 0, opacity: 1 }, 0.55, 'power3.out', 0.1),
      ...(hasMk(title)
        ? [A(`#${sid}-hd .hlfill`, { scaleX: 0.7, opacity: 0 }, { scaleX: 1, opacity: 1, transformOrigin: '0% 50%' }, 0.4, 'back.out(1.8)', 0.5)]
        : []),
    ],
  };
}

// ---- ①3カラムの流れ(yt_style) ----------------------------------------
function flow3(scene, ctx) {
  const { sid, beats } = ctx;
  const hd = headline(sid, scene.title);
  const n = beats.length;
  const colW = n >= 3 ? 460 : 580;
  const accents = [BLUE, GREEN, RED];
  const parts = [];
  const anims = [...hd.anims];

  beats.forEach((b, i) => {
    const ac = accents[i % accents.length];
    if (i > 0) {
      parts.push(
        `<svg class="arw" id="${sid}-a${i}" viewBox="0 0 110 60" fill="none" stroke="${ac}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 30h84" /><path d="M72 12l22 18-22 18" /></svg>`
      );
      anims.push(A(`#${sid}-a${i}`, { x: -20, opacity: 0 }, { x: 0, opacity: 1 }, 0.4, 'power2.out', b.start + 0.05));
    }
    const topSize = fitFont(b.text, 44, 9, 30);
    const noteSize = fitFont(b.note, 38, 11, 27);
    parts.push(
      `<div class="col" id="${sid}-b${i}" style="width:${colW}px">` +
        `<div class="col-top" style="font-size:${topSize}px">${lines(b.text)}</div>` +
        `<div class="art art-box" style="border-color:${ac}">${icon(b.icon, 200, ac, 3.4)}</div>` +
        `<div class="col-bot" style="font-size:${noteSize}px">${lines(b.note)}</div>` +
        `</div>`
    );
    // 列を1カタマリでドンと出す(「左から右へ1個ずつ」の単調さを消す)。noteだけ少し遅らせる
    anims.push(
      A(`#${sid}-b${i}`, { y: 36, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, transformOrigin: '50% 40%' }, 0.52, 'back.out(1.5)', b.start + 0.1),
      A(`#${sid}-b${i} .col-bot`, { y: 14, opacity: 0 }, { y: 0, opacity: 1 }, 0.4, 'power3.out', b.start + 0.42)
    );
    if (hasMk(b.text, b.note)) {
      anims.push(A(`#${sid}-b${i} .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.45, 'power2.inOut', b.start + 0.72));
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
  const accents = [BLUE, GREEN, RED, INK];
  const parts = [];
  const anims = [...hd.anims];

  beats.forEach((b, i) => {
    const ac = accents[i % accents.length];
    if (i > 0) {
      parts.push(
        `<svg class="sarw" id="${sid}-a${i}" viewBox="0 0 54 34" fill="none" stroke="#9a9a9a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="margin-top:${circle / 2 - 17}px"><path d="M6 17h34" /><path d="M32 7l12 10-12 10" /></svg>`
      );
      anims.push(A(`#${sid}-a${i}`, { x: -14, opacity: 0 }, { x: 0, opacity: 1 }, 0.35, 'power2.out', b.start + 0.05));
    }
    const labSize = fitFont(b.text, n >= 4 ? 36 : 42, 6, 26);
    parts.push(
      `<div class="step" id="${sid}-b${i}">` +
        `<div class="scircle" style="width:${circle}px;height:${circle}px;border-color:${ac}">` +
        `<span class="snum" style="background:${ac}">${i + 1}</span>` +
        icon(b.icon, circle * 0.5, ac, 4) +
        `</div>` +
        `<div class="slabel" style="font-size:${labSize}px">${lines(b.text)}</div>` +
        `</div>`
    );
    // 丸ごとポップで出す(番号バッジ→丸→ラベル)
    anims.push(
      A(`#${sid}-b${i} .scircle`, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }, 0.5, 'back.out(2)', b.start + 0.1),
      A(`#${sid}-b${i} .snum`, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%' }, 0.4, 'back.out(2.6)', b.start + 0.32),
      A(`#${sid}-b${i} .slabel`, { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, 0.4, 'power3.out', b.start + 0.42)
    );
    if (hasMk(b.text)) {
      anims.push(A(`#${sid}-b${i} .mk-bar`, { scaleX: 0 }, { scaleX: 1 }, 0.4, 'power2.inOut', b.start + 0.7));
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

// ===== ここから、参考YouTubeの密度に寄せたリッチ型 =========================
// 共通の考え方: 絵の中身はシーン直下のフィールド(stack/wall/items/chart…)に置き、
// beatsは「読み上げ文＋どのカタマリを出すか」だけを持つ。
// こうすると「左から右へ1個ずつ」ではなく、ブロック単位でドンと出せる。

function pill(text, cls = '') {
  return `<span class="kpill ${cls}">${esc(text)}</span>`;
}

// トゲトゲのバッジ(「約2.7倍に増加!」のあれ)
function starburst(size, points, fill) {
  const c = size / 2;
  const r1 = c * 0.98;
  const r2 = c * 0.78;
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${pts.join(' ')}" fill="${fill}" /></svg>`;
}

// レンガ壁
function brickWall(w, h, rows, cols) {
  const rh = h / rows;
  const cw = w / cols;
  let p = `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="#f4f4f4" stroke="${INK}" stroke-width="3" />`;
  for (let r = 1; r < rows; r++) p += `<path d="M0 ${r * rh}H${w}" stroke="${INK}" stroke-width="3" />`;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : cw / 2;
    for (let c = 0; c <= cols; c++) {
      const x = off + c * cw;
      if (x <= 2 || x >= w - 2) continue;
      p += `<path d="M${x} ${r * rh}v${rh}" stroke="${INK}" stroke-width="3" />`;
    }
  }
  return `<svg class="wallsvg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${p}</svg>`;
}

// 下部の結論バー（[枠] ▶ [黄] ▶ [黄下線] の3連）
function conclusionBar(sid, items) {
  if (!items || !items.length) return '';
  const chips = items
    .map((t, i) => {
      const sep = i > 0 ? `<span class="cc-sep">▶</span>` : '';
      const cls = i === 0 ? 'cc-box' : 'cc-plain';
      return `${sep}<span class="cc ${cls}" id="${sid}-cc${i}">${rich(t, 'fill')}</span>`;
    })
    .join('');
  return `<div class="concl" id="${sid}-concl">${chips}</div>`;
}

// ---- ⑦階段と壁（積み上げが通用しない、を見せる） ------------------------
function stairs(scene, ctx) {
  const { sid, beats } = ctx;
  const hd = headline(sid, scene.title);
  const st = scene.stack || {};
  const wall = scene.wall || {};
  const circle = scene.circle || {};
  const items = (st.items || []).slice(0, 3);
  const b = (i) => beats[Math.min(i, beats.length - 1)] || { start: 0 };

  const steps = items
    .map(
      (it, i) =>
        `<div class="stbox" id="${sid}-st${i}" style="margin-left:${i * 34}px">` +
        `<div class="stt">${esc(it.t || '')}</div>` +
        `<div class="sts">${esc(it.s || '')}</div></div>`
    )
    .reverse()
    .join('');

  const html =
    `${hd.html}` +
    `<div class="st-wrap" id="${sid}-g0">` +
    `<div class="st-head">${pill(st.label || '積み上げ型')}</div>` +
    `<div class="st-body">` +
    `<div class="st-axis"><svg width="34" height="300" viewBox="0 0 34 300" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 292V16" /><path d="M6 30L17 12l11 18" /></svg>` +
    `<div class="st-axis-l">${esc(st.axis || '時間の積み上げ')}</div></div>` +
    `<div class="st-steps">` +
    `<div class="st-goal">${icon('flag', 74, INK, 4)}<span>${esc(st.goal || '成果・収益')}</span></div>` +
    steps +
    `</div></div></div>` +
    `<div class="wl-wrap" id="${sid}-g1">` +
    brickWall(470, 390, 5, 4) +
    `<div class="wl-tag">${pill(wall.pill || '最初の一歩で')}<span class="hlfill wl-hl">${esc(wall.hl || '詰む')}</span></div>` +
    // 左(階段側)から伸びてきた矢印が壁にぶつかって止まる。突き抜けさせない
    `<svg class="wl-bounce" width="470" height="390" viewBox="0 0 470 390" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">` +
    `<path class="wlb" d="M-150 366L26 278" stroke-dasharray="197" stroke-dashoffset="197" />` +
    `<path class="wlb3" d="M-14 268l44 10-8 42" />` +
    `<g class="wlb4" stroke-width="6"><path d="M44 254l30-16M44 278h34M46 302l30 16" /></g></svg>` +
    `<div class="wl-person">${icon(wall.icon || 'person_worried', 170, INK, 3.4)}</div>` +
    `</div>` +
    `<div class="ci-wrap" id="${sid}-g2"><div class="ci">${lines(circle.text || '', 'fill')}</div></div>`;

  return {
    html,
    anims: [
      ...hd.anims,
      // かたまりごとにドンと出す(左ブロック→壁→円)
      A(`#${sid}-g0`, { y: 40, opacity: 0 }, { y: 0, opacity: 1 }, 0.55, 'power3.out', b(0).start + 0.1),
      A(`#${sid}-g0 .st-goal`, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }, 0.45, 'back.out(2)', b(0).start + 0.7),
      A(`#${sid}-g1`, { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%' }, 0.5, 'back.out(1.5)', b(1).start + 0.1),
      A(`#${sid}-g1 .wlb`, { strokeDashoffset: 197 }, { strokeDashoffset: 0 }, 0.35, 'power2.out', b(1).start + 0.4),
      A(`#${sid}-g1 .wlb3`, { opacity: 0 }, { opacity: 1 }, 0.15, 'power2.out', b(1).start + 0.72),
      A(`#${sid}-g1 .wlb4`, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '30% 50%' }, 0.3, 'back.out(2.4)', b(1).start + 0.85),
      A(`#${sid}-g1 .wl-hl`, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%' }, 0.4, 'back.out(2.6)', b(1).start + 0.8),
      A(`#${sid}-g2`, { scale: 0.75, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%' }, 0.5, 'back.out(1.8)', b(2).start + 0.1),
    ],
  };
}

// ---- ⑧工程図（工程が並び、人が張り付き、結論が出る） ---------------------
function process(scene, ctx) {
  const { sid, beats } = ctx;
  const hd = headline(sid, scene.title);
  const items = (scene.items || []).slice(0, 4);
  const b = (i) => beats[Math.min(i, beats.length - 1)] || { start: 0 };
  const accents = [BLUE, INK, GREEN, RED];

  const boxes = items
    .map((it, i) => {
      const sep = i > 0 ? `<svg class="pr-arw" viewBox="0 0 46 30" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h28" /><path d="M26 6l12 9-12 9" /></svg>` : '';
      return (
        sep +
        `<div class="pr-col">` +
        `<div class="pr-lab">${esc(it.t || '')}</div>` +
        `<div class="pr-box" style="border-color:${accents[i % accents.length]}">${icon(it.icon, 96, accents[i % accents.length], 3.6)}</div>` +
        `<div class="pr-dot"></div>` +
        `<div class="pr-pin">${icon('person_calm', 70, '#4a4a4a', 3.4)}<span>${esc(scene.pinNote || '人が張り付く')}</span></div>` +
        `</div>`
      );
    })
    .join('');

  return {
    html:
      `${hd.html}<div class="pr-row" id="${sid}-g0">${boxes}</div>` + conclusionBar(sid, scene.conclusion),
    anims: [
      ...hd.anims,
      // 工程の列を1カタマリで出す
      A(`#${sid}-g0`, { y: 36, opacity: 0 }, { y: 0, opacity: 1 }, 0.55, 'power3.out', b(0).start + 0.1),
      // 「人が張り付く」は下段まとめて
      A(`#${sid}-g0 .pr-dot`, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 0%' }, 0.4, 'power2.out', b(1).start + 0.1),
      A(`#${sid}-g0 .pr-pin`, { y: 18, opacity: 0 }, { y: 0, opacity: 1 }, 0.45, 'power3.out', b(1).start + 0.3),
      A(`#${sid}-concl`, { y: 26, opacity: 0 }, { y: 0, opacity: 1 }, 0.5, 'power3.out', b(2).start + 0.1),
    ],
  };
}

// ---- ⑨データ＋番号ステップ（棒グラフ／トゲバッジ／①②③④） ---------------
function databadge(scene, ctx) {
  const { sid, beats } = ctx;
  const ch = scene.chart || {};
  const steps = scene.steps || {};
  const items = (steps.items || []).slice(0, 4);
  const b = (i) => beats[Math.min(i, beats.length - 1)] || { start: 0 };

  const nums = ['①', '②', '③', '④'];
  const stepHtml = items
    .map((it, i) => {
      const sep = i > 0 ? `<svg class="db-sep" viewBox="0 0 26 26" fill="${INK}"><polygon points="6,3 22,13 6,23" /></svg>` : '';
      return (
        sep +
        `<div class="db-step">` +
        `<div class="db-num">${nums[i]}</div>` +
        `<div class="db-txt">${lines(it.t || '', 'fill')}</div>` +
        `<div class="db-ic">${icon(it.icon, 108, INK, 3.4)}</div>` +
        `</div>`
      );
    })
    .join('');

  return {
    html:
      `<div class="db-left" id="${sid}-g0">` +
      `<div class="db-head">${pill(ch.label || 'データ', 'kpill-blue')}</div>` +
      `<div class="db-cap">${lines(ch.caption || '', 'fill')}</div>` +
      `<div class="db-chart">` +
      `<svg class="db-grid" width="800" height="480" viewBox="0 0 800 480" fill="none" stroke="#9a9a9a" stroke-width="3" stroke-linecap="round"><path d="M110 400H780" /></svg>` +
      `<div class="db-col db-gray" style="left:250px;height:150px"></div>` +
      `<div class="db-col db-red" style="left:570px;height:300px"></div>` +
      `<div class="db-val" style="left:230px;bottom:248px">${esc(ch.from?.v || '')}<em>${esc(ch.from?.unit || '')}</em></div>` +
      `<div class="db-val db-valred" style="left:550px;bottom:382px">${esc(ch.to?.v || '')}<em>${esc(ch.to?.unit || '')}</em></div>` +
      `<div class="db-yr" style="left:230px">${esc(ch.from?.year || '')}</div>` +
      `<div class="db-yr" style="left:550px">${esc(ch.to?.year || '')}</div>` +
      `<svg class="db-rise" width="800" height="480" viewBox="0 0 800 480" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">` +
      `<path class="dbr" d="M262 268L552 110" stroke-dasharray="330" stroke-dashoffset="330" />` +
      `<path class="dbr2" d="M506 113L552 110L525 147" /></svg>` +
      `<div class="db-badge">${starburst(215, 12, '#ffe500')}<span>${lines(ch.badge || '', 'red', 'bl')}</span></div>` +
      `</div></div>` +
      `<div class="db-right" id="${sid}-g1">` +
      `<div class="db-head">${pill(steps.label || '流れ')}</div>` +
      `<div class="db-steps">${stepHtml}</div>` +
      `</div>`,
    anims: [
      A(`#${sid}-g0`, { x: -30, opacity: 0 }, { x: 0, opacity: 1 }, 0.5, 'power3.out', b(0).start + 0.1),
      A(`#${sid}-g0 .db-col`, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 100%' }, 0.6, 'power2.out', b(0).start + 0.4),
      A(`#${sid}-g0 .dbr`, { strokeDashoffset: 330 }, { strokeDashoffset: 0 }, 0.5, 'power2.out', b(0).start + 0.9),
      A(`#${sid}-g0 .dbr2`, { opacity: 0 }, { opacity: 1 }, 0.18, 'power2.out', b(0).start + 1.38),
      A(`#${sid}-g0 .db-badge`, { scale: 0.3, rotate: -22, opacity: 0 }, { scale: 1, rotate: -12, opacity: 1, transformOrigin: '50% 50%' }, 0.45, 'back.out(2.4)', b(0).start + 1.55),
      A(`#${sid}-g1`, { x: 30, opacity: 0 }, { x: 0, opacity: 1 }, 0.5, 'power3.out', b(1).start + 0.1),
      A(`#${sid}-g1 .db-num`, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%' }, 0.45, 'back.out(2.2)', b(1).start + 0.35),
    ],
  };
}

const LAYOUTS = { flow3, iconsteps, reject, cut, title: titleScene, cta: ctaScene, stairs, process, databadge };

// シーンからレイアウト関数を決める。想定外の組み合わせはビート数から安全側に倒す
function pickLayout(scene) {
  if (scene.type === 'cut' || scene.type === 'stock') return 'cut';
  if (scene.type === 'title') return 'title';
  if (scene.type === 'cta') return 'cta';
  const n = (scene.beats || []).length;
  const want = scene.layout;
  // リッチ型は絵の中身がシーン直下にあるので、それが揃っているときだけ採用する
  if (want === 'stairs' && scene.stack && scene.wall) return 'stairs';
  if (want === 'process' && (scene.items || []).length >= 3) return 'process';
  if (want === 'databadge' && scene.chart && scene.steps) return 'databadge';
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
.hd{position:absolute;top:64px;left:0;width:1920px;text-align:center;font-weight:800;letter-spacing:1px;line-height:1.35}
.hdl{white-space:nowrap}

/* ①3カラム */
.cols{position:absolute;top:250px;left:110px;width:1700px;height:620px;display:flex;align-items:flex-start;justify-content:space-evenly}
.col{display:flex;flex-direction:column;align-items:center;text-align:center}
.col-top{font-weight:700;line-height:1.5;min-height:170px}
.art{width:260px;height:260px;margin:14px 0 24px;display:flex;align-items:center;justify-content:center}
.art-box{width:264px;height:264px;border:6px solid ${INK};border-radius:28px;background:#fff}
.col-bot{font-weight:600;line-height:1.6;color:#2b2b2b}
.arw{width:110px;height:60px;margin-top:320px;flex:none}

/* ②丸アイコンの手順 */
.steps{position:absolute;top:300px;left:80px;width:1760px;height:540px;display:flex;align-items:flex-start;justify-content:center;gap:26px}
.step{display:flex;flex-direction:column;align-items:center;flex:none}
.snum{position:absolute;top:-20px;right:-8px;width:64px;height:64px;border-radius:50%;color:#fff;font-size:36px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.18)}
.scircle{position:relative;border:6px solid ${INK};border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff}
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

/* ===== リッチ型の共通パーツ ===== */
.hlfill{display:inline-block;background:#ffe500;color:${INK};padding:0 .14em;border-radius:6px}
.kpill{display:inline-block;background:${INK};color:#fff;font-size:34px;font-weight:700;padding:10px 30px;border-radius:10px;letter-spacing:1px}
.kpill-blue{background:${BLUE}}
.kpill-green{background:${GREEN}}

/* 結論バー */
.concl{position:absolute;top:680px;left:80px;width:1760px;display:flex;align-items:center;justify-content:center;gap:16px}
.cc{font-size:38px;font-weight:800;padding:14px 26px;line-height:1.3}
.cc-box{border:4px solid ${INK};border-radius:12px}
.cc-sep{font-size:38px;color:${INK}}

/* ⑦階段と壁 */
.st-wrap{position:absolute;top:196px;left:50px;width:660px;text-align:center}
.st-head{margin-bottom:22px}
.st-body{display:flex;align-items:flex-end;justify-content:center;gap:8px}
.st-axis{width:170px;display:flex;flex-direction:column;align-items:center;padding-bottom:46px}
.st-axis-l{margin-top:10px;font-size:24px;font-weight:700;color:#555;line-height:1.3;width:170px;white-space:nowrap}
.st-steps{display:flex;flex-direction:column;align-items:flex-start}
.st-goal{display:flex;align-items:center;gap:12px;font-size:32px;font-weight:700;margin:0 0 14px 76px}
.stbox{border:4px solid ${INK};border-radius:14px;padding:16px 28px;margin-bottom:16px;min-width:340px;text-align:left;background:#fff}
.stt{font-size:35px;font-weight:800;line-height:1.3}
.sts{font-size:29px;font-weight:800;color:${RED};line-height:1.35}
.wl-wrap{position:absolute;top:236px;left:730px;width:470px;height:390px}
.wl-wrap .wallsvg{position:absolute;inset:0}
.wl-tag{position:absolute;top:88px;left:0;width:470px;display:flex;flex-direction:column;align-items:center;gap:16px}
.wl-hl{font-size:72px;font-weight:900}
.wl-bounce{position:absolute;inset:0;overflow:visible}
.wl-bounce .wlb3{stroke-dasharray:none}
.wl-person{position:absolute;left:145px;top:400px}
.ci-wrap{position:absolute;top:242px;left:1220px;width:660px;display:flex;justify-content:center}
.ci{width:520px;height:520px;border:6px solid ${INK};border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:46px;font-weight:800;line-height:1.55;padding:46px}

/* ⑧工程図 */
.pr-row{position:absolute;top:206px;left:60px;width:1800px;display:flex;align-items:flex-start;justify-content:center;gap:8px}
.pr-col{display:flex;flex-direction:column;align-items:center;width:300px}
.pr-lab{font-size:36px;font-weight:800;line-height:1.3;margin-bottom:16px}
.pr-box{width:224px;height:180px;border:4px solid ${INK};border-radius:18px;display:flex;align-items:center;justify-content:center;background:#fff}
.pr-dot{width:0;height:48px;border-left:4px dashed #9a9a9a;margin:12px 0}
.pr-pin{display:flex;flex-direction:column;align-items:center}
.pr-pin span{font-size:27px;font-weight:700;color:#555;margin-top:8px}
.pr-arw{width:50px;height:32px;margin-top:132px;flex:none}

/* ⑨データ＋番号ステップ */
.db-left{position:absolute;top:126px;left:40px;width:860px;text-align:center}
.db-cap{margin-top:16px;font-size:30px;font-weight:700;line-height:1.45;color:#333}
.db-chart{position:relative;width:800px;height:480px;margin:18px auto 0}
.db-grid{position:absolute;inset:0}
.db-col{position:absolute;bottom:80px;width:150px;transform-origin:50% 100%}
.db-gray{background:#b9b9b9}
.db-red{background:${RED}}
.db-val{position:absolute;width:190px;text-align:center;font-size:44px;font-weight:900;white-space:nowrap}
.db-val em{font-size:27px;font-style:normal}
.db-valred{color:${RED}}
.db-yr{position:absolute;bottom:26px;width:190px;text-align:center;font-size:29px;font-weight:700}
.db-rise{position:absolute;inset:0}
.db-badge{position:absolute;left:0;bottom:40px;width:215px;height:215px;display:flex;align-items:center;justify-content:center}
.db-badge span{position:absolute;font-size:32px;font-weight:900;line-height:1.25;text-align:center;transform:rotate(-12deg)}
.db-right{position:absolute;top:126px;left:950px;width:900px;text-align:center}
.db-steps{margin-top:62px;display:flex;align-items:flex-start;justify-content:center;gap:4px}
.db-step{width:200px;display:flex;flex-direction:column;align-items:center}
.db-num{width:80px;height:80px;border:4px solid ${INK};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:900}
.db-txt{margin:20px 0;font-size:29px;font-weight:700;line-height:1.4;min-height:130px}
.db-ic{width:176px;height:156px;border-radius:18px;background:#eef2f7;display:flex;align-items:center;justify-content:center}
.db-sep{width:28px;height:28px;margin-top:28px;flex:none}

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
