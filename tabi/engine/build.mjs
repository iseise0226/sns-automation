// tabi_life（@iimono_hakkencho）新サービス図解リール：縦1080x1920
// 使い方: その日のフォルダ（days/YYYY-MM-DD）で  node ../../engine/build.mjs
// script.json（台本＋場面の指示）と lines.json（各文の開始秒）から index.html を書き出す
// 画面は3段：上段（ラベル・題名・結論の一言＝最後まで固定）／章タブ／真ん中（fx）／下段（字幕）
// fx: intro / shot / strike / number / list / choices / follow / keep（前の絵のまま）
import fs from "node:fs";
const W = 1080, H = 1920;
const S = JSON.parse(fs.readFileSync("script.json", "utf8"));
const LJ = JSON.parse(fs.readFileSync("lines.json", "utf8"));
const SRC = fs.existsSync("sources.json") ? JSON.parse(fs.readFileSync("sources.json", "utf8")) : {};
const DUR = Math.ceil(LJ.total);
const HANDLE = "iimono_hakkencho";
const TABS = ["何これ", "料金", "できること", "注意"];
const L = S.lines.map((l, i) => ({ fx: "keep", ...l, ...LJ.lines[i] }));
const n2 = (v) => +v.toFixed(2);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const has = (p) => fs.existsSync(p);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
// 字幕の強調：em に挙げた語と数字（円・%・ドル・日付）を黄色に
const EMPH = (s, em) => {
  let h = esc(s);
  (em || []).forEach((w) => { h = h.split(esc(w)).join(`<b>${esc(w)}</b>`); });
  return h.replace(/(?<![\w>])((?:月|年)?[\d,，.]+(?:円|%|％|ドル|万|倍|秒|分|個|件|日|月)?)/g, (m) => (/\d/.test(m) ? `<b>${m}</b>` : m));
};

const parts = [], cmds = [], caps = [];
let uid = 0, cur = null, paperOn = false;
const show = (id, t) => {
  if (cur) cmds.push(`tl.to("#${cur}", { opacity: 0, duration: 0.25 }, ${n2(t - 0.05)});`);
  cmds.push(`tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.25 }, ${n2(t)});`);
  cur = id;
};
const srcLabel = (ids) => {
  const s = (ids || []).map((k) => SRC[k]).find(Boolean);
  return s ? `<div class="src">出典 ${esc(s.label || host(s.url))}・${esc(s.taken)}</div>` : "";
};

let chapter = -1;
L.forEach((l, i) => {
  const t = l.start, nxt = i + 1 < L.length ? L[i + 1].start : DUR;
  caps.push(`<div id="cap${i}" class="cap clip" data-start="${n2(t)}" data-duration="${n2(Math.max(0.3, nxt - t))}" data-track-index="5"><p>${EMPH(l.t, l.em)}</p></div>`);

  // 章タブ：章が変わったら前の章にチェック、今の章を青く
  if (l.chapter !== undefined && l.chapter !== chapter) {
    if (chapter >= 0) cmds.push(`tl.set("#tab${chapter}", { attr: { class: "tab done" } }, ${n2(t)});`);
    cmds.push(`tl.set("#tab${l.chapter}", { attr: { class: "tab on" } }, ${n2(t)});`,
      `tl.fromTo("#tab${l.chapter}", { scale: 0.85 }, { scale: 1, duration: 0.3, ease: "back.out(2)" }, ${n2(t)});`);
    chapter = l.chapter;
  }
  // 明るい地（解説パート）と紺の地（導入・まとめ）
  const wantPaper = !["intro", "title"].includes(l.fx) && l.fx !== "keep" ? true : l.fx === "keep" ? paperOn : false;
  if (wantPaper !== paperOn) { cmds.push(`tl.to("#paper", { opacity: ${wantPaper ? 1 : 0}, duration: 0.3 }, ${n2(t)});`); paperOn = wantPaper; }

  if (l.fx === "keep") return;
  const id = `v${uid++}`;
  let inner = "";
  if (l.fx === "intro") {
    const logo = has(`shots/${l.shot || "logo"}.png`) ? `<img class="logo" src="shots/${l.shot || "logo"}.png"/>` : "";
    inner = `<div class="intro">${logo}<div class="name">${esc(S.service)}</div><div class="maker">${esc(S.maker || "")}</div>${l.stamp ? `<div class="stamp">${esc(l.stamp)}</div>` : ""}</div>`;
    cmds.push(`tl.fromTo("#${id} .name", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${n2(t + 0.05)});`,
      `tl.fromTo("#${id} .logo", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.8)" }, ${n2(t)});`,
      `tl.fromTo("#${id} .stamp", { scale: 2.4, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: -8, duration: 0.3, ease: "power4.in" }, ${n2(t + 0.8)});`);
  } else if (l.fx === "title") {
    inner = `<div class="bigq"><span class="qm">？</span><div>${EMPH(l.big || l.t, l.em)}</div></div>`;
    cmds.push(`tl.fromTo("#${id} .qm", { scale: 0, rotation: -30 }, { scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2)" }, ${n2(t)});`,
      `tl.fromTo("#${id} .bigq div", { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, ${n2(t + 0.15)});`);
  } else if (l.fx === "shot") {
    // hl:"auto" は capture.py が mark の文字の位置を shots/<shot>.json に書いたもの
    if (l.hl === "auto") l.hl = has(`shots/${l.shot}.json`) ? JSON.parse(fs.readFileSync(`shots/${l.shot}.json`, "utf8")).hl : null;
    const hl = l.hl ? `<div class="hl" style="left:${l.hl[0] * 100}%;top:${l.hl[1] * 100}%;width:${l.hl[2] * 100}%;height:${l.hl[3] * 100}%"></div>` : "";
    inner = `${srcLabel(l.src)}<div class="shot"><div class="frame"><img src="shots/${l.shot}.png"/>${hl}</div></div>${l.tag ? `<div class="tag">${esc(l.tag)}</div>` : ""}`;
    cmds.push(`tl.fromTo("#${id} .shot", { y: 80, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "power3.out" }, ${n2(t)});`,
      `tl.fromTo("#${id} .frame img", { scale: 1 }, { scale: 1.06, duration: ${n2(Math.max(1, nxt - t))}, ease: "none" }, ${n2(t)});`);
    if (l.hl) cmds.push(`tl.fromTo("#${id} .hl", { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, ${n2(t + 0.6)});`);
    if (l.tag) cmds.push(`tl.fromTo("#${id} .tag", { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35 }, ${n2(t + 0.5)});`);
  } else if (l.fx === "strike") {
    inner = `<div class="strike"><div class="from"><span>${esc(l.from)}</span><i class="line"></i></div><div class="arrow">▼</div><div class="to">${esc(l.to)}</div></div>`;
    cmds.push(`tl.fromTo("#${id} .from", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3 }, ${n2(t)});`,
      `tl.fromTo("#${id} .line", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.inOut" }, ${n2(t + 0.3)});`,
      `tl.fromTo("#${id} .arrow", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.2 }, ${n2(t + 0.55)});`,
      `tl.fromTo("#${id} .to", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, ${n2(t + 0.7)});`);
  } else if (l.fx === "number") {
    inner = `${srcLabel(l.src)}<div class="num">${l.label ? `<small>${esc(l.label)}</small>` : ""}<strong style="font-size:${l.big.length > 8 ? 96 : 132}px">${esc(l.big)}</strong>${l.note ? `<em>${esc(l.note)}</em>` : ""}</div>`;
    cmds.push(`tl.fromTo("#${id} .num", { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.2)" }, ${n2(t)});`);
  } else if (l.fx === "list") {
    inner = `${srcLabel(l.src)}<div class="list">${l.title ? `<h3>${esc(l.title)}</h3>` : ""}${l.items.map((it, j) => `<div class="li li${j} ${l.kind || ""}"><i>${esc(it[0])}</i><span>${esc(it[1])}</span></div>`).join("")}</div>`;
    const step = Math.min(0.6, Math.max(0.25, (nxt - t - 0.6) / l.items.length));
    l.items.forEach((_, j) => cmds.push(`tl.fromTo("#${id} .li${j}", { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, ${n2(t + 0.15 + j * step)});`));
  } else if (l.fx === "choices") {
    inner = `<div class="choices"><h3>${esc(l.title || S.service + "で何をしたい？")}</h3><div class="grid">${S.choices.map((c, j) => `<div class="ch ch${j}">${esc(c)}</div>`).join("")}</div><div class="pill">コメントで教えてください</div></div>`;
    S.choices.forEach((_, j) => cmds.push(`tl.fromTo("#${id} .ch${j}", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, ${n2(t + 0.2 + j * 0.18)});`));
    cmds.push(`tl.fromTo("#${id} .pill", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, ${n2(t + 1.2)});`);
  } else if (l.fx === "follow") {
    inner = `<div class="follow"><p>${esc(l.lead || "新しいサービスを使う前に、30秒で判断")}</p><div class="acct"><div class="av">発</div><div class="who"><b>これ、買ってよかった</b><small>@${HANDLE}</small></div><div class="btn"><span class="b1">フォロー</span><span class="b2">フォロー中 ✓</span></div></div><div class="hand">👆</div></div>`;
    cmds.push(`tl.fromTo("#${id} .acct", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, ${n2(t)});`,
      `tl.fromTo("#${id} .hand", { x: 120, y: 120, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }, ${n2(t + 0.6)});`,
      `tl.to("#${id} .b1", { opacity: 0, duration: 0.1 }, ${n2(t + 1.2)});`,
      `tl.to("#${id} .b2", { opacity: 1, duration: 0.1 }, ${n2(t + 1.2)});`,
      `tl.to("#${id} .btn", { backgroundColor: "#d9dde6", color: "#2a3346", duration: 0.1 }, ${n2(t + 1.2)});`);
  }
  parts.push(`<div id="${id}" class="v">${inner}</div>`);
  show(id, t);
});

const label = S.pr ? "PR｜新サービス" : "新サービス｜使う前に30秒";
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(S.service)}</title>
<script src="vendor/gsap.min.js"></script>
<style>
@font-face { font-family: "Noto Sans JP"; src: url("fonts/NotoSansJP-VF.ttf"); font-weight: 100 900; }
:root { --navy:#0b1530; --yellow:#ffd43b; --red:#e8423a; --blue:#2f7bff; --paper:#f6f7fb; --ink:#1a2236; }
body { margin: 0; background: var(--navy); }
#root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; font-family: "Noto Sans JP", sans-serif; color: #fff;
  background: radial-gradient(circle at 50% 45%, #183a7a 0, var(--navy) 55%); }
#paper { position: absolute; inset: 0; opacity: 0; background-color: var(--paper);
  background-image: linear-gradient(#e4e8f0 1px, transparent 1px), linear-gradient(90deg, #e4e8f0 1px, transparent 1px); background-size: 48px 48px; }
#top { position: absolute; left: 0; top: 0; width: ${W}px; height: 360px; background: linear-gradient(#0b1530f2 80%, #0b153000); text-align: center; }
#top .label { display: inline-block; margin-top: 120px; background: var(--red); color: #fff; font-weight: 800; font-size: 32px; padding: 6px 26px; border-radius: 40px; }
#top .title { font-weight: 900; font-size: 46px; margin-top: 14px; padding: 0 40px; text-wrap: balance; }
#top .hook { color: var(--yellow); font-weight: 900; font-size: 62px; margin-top: 2px; text-shadow: 0 4px 0 #0006; }
#tabs { position: absolute; top: 372px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; padding: 10px 16px; background: #fff; border-radius: 40px; box-shadow: 0 6px 20px #0002; }
.tab { font-size: 30px; font-weight: 800; color: #6f788c; padding: 6px 18px; white-space: nowrap; flex: none; border-radius: 30px; }
.tab.on { background: var(--blue); color: #fff; }
.tab.done { color: var(--red); }
.tab.done::before { content: "✓ "; }
.v { position: absolute; left: 0; top: 500px; width: ${W}px; height: 990px; opacity: 0; }
.intro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.intro .logo { width: 220px; height: 220px; object-fit: contain; border-radius: 48px; background: #fff; padding: 18px; box-sizing: border-box; margin-bottom: 30px; }
.intro .name { font-size: 150px; font-weight: 900; line-height: 1.05; text-align: center; padding: 0 40px; }
.intro .maker { font-size: 44px; font-weight: 700; opacity: 0.85; margin-top: 16px; }
.intro .stamp { position: absolute; right: 70px; top: 40px; border: 8px solid var(--red); color: var(--red); background: #fff; font-size: 60px; font-weight: 900; padding: 6px 26px; border-radius: 16px; }
.bigq { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 30px; padding: 0 60px; }
.bigq .qm { font-size: 260px; font-weight: 900; color: var(--yellow); }
.bigq div { font-size: 76px; font-weight: 900; line-height: 1.25; }
.bigq b { color: var(--yellow); }
.src { position: absolute; left: 50%; top: 4px; transform: translateX(-50%); white-space: nowrap; background: #111a2e; color: #fff; font-size: 28px; font-weight: 700; padding: 8px 24px; border-radius: 30px; z-index: 2; }
.shot { position: absolute; left: 60px; right: 60px; top: 80px; bottom: 120px; display: flex; align-items: center; justify-content: center; }
.frame { position: relative; max-width: 100%; max-height: 100%; border-radius: 28px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px #0b153040; border: 4px solid #fff; }
.frame img { display: block; max-width: 952px; max-height: 790px; transform-origin: 50% 30%; }
.hl { position: absolute; border: 9px solid var(--yellow); border-radius: 16px; box-shadow: 0 0 0 9999px #0b153033; }
.tag { position: absolute; left: 60px; bottom: 30px; background: var(--blue); color: #fff; font-size: 40px; font-weight: 900; padding: 12px 30px; border-radius: 40px; }
.strike { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; }
.strike .from { position: relative; font-size: 64px; font-weight: 800; color: #7b8499; background: #fff; padding: 18px 44px; border-radius: 60px; }
.strike .line { position: absolute; left: 30px; right: 30px; top: 50%; height: 10px; background: var(--red); transform-origin: left center; }
.strike .arrow { font-size: 60px; color: var(--blue); }
.strike .to { font-size: 80px; font-weight: 900; color: #fff; background: var(--blue); padding: 22px 54px; border-radius: 70px; box-shadow: 0 16px 40px #2f7bff55; }
.num { position: absolute; left: 70px; right: 70px; top: 200px; text-align: center; background: #fff8d6; border: 8px solid var(--yellow); border-radius: 36px; padding: 40px 20px; color: var(--ink); }
.num small { display: block; font-size: 46px; font-weight: 800; }
.num strong { display: block; font-weight: 900; color: #a87700; line-height: 1.15; white-space: nowrap; }
.num em { display: block; font-style: normal; font-size: 34px; font-weight: 700; color: #59617a; margin-top: 8px; }
.list { position: absolute; left: 70px; right: 70px; top: 90px; color: var(--ink); }
.list h3 { margin: 0 0 24px; font-size: 52px; font-weight: 900; text-align: center; }
.li { display: flex; align-items: center; gap: 22px; background: #fff; border-radius: 24px; padding: 22px 30px; margin-bottom: 18px; box-shadow: 0 10px 30px #0b15301a; border-left: 10px solid var(--blue); }
.li.warn { border-left-color: var(--red); }
.li.good { border-left-color: #22a35a; }
.li i { flex: none; font-style: normal; font-size: 50px; }
.li span { font-size: 44px; font-weight: 800; line-height: 1.3; }
.choices { position: absolute; left: 60px; right: 60px; top: 110px; text-align: center; color: var(--ink); }
.choices h3 { margin: 0 0 36px; font-size: 58px; font-weight: 900; }
.choices .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.ch { background: #fff; border-radius: 24px; padding: 34px 10px; font-size: 44px; font-weight: 800; box-shadow: 0 10px 30px #0b15301a; }
.pill { display: inline-block; margin-top: 40px; background: var(--blue); color: #fff; font-size: 42px; font-weight: 800; padding: 14px 44px; border-radius: 50px; }
.follow { position: absolute; left: 60px; right: 60px; top: 220px; text-align: center; color: var(--ink); }
.follow p { font-size: 50px; font-weight: 900; margin: 0 0 40px; }
.acct { display: flex; align-items: center; gap: 24px; background: #fff; border-radius: 80px; padding: 20px 26px; box-shadow: 0 16px 40px #0b153026; }
.av { width: 110px; height: 110px; border-radius: 50%; background: var(--navy); color: var(--yellow); font-size: 56px; font-weight: 900; display: grid; place-items: center; }
.who { flex: 1; text-align: left; }
.who b { display: block; font-size: 46px; }
.who small { font-size: 32px; color: #6a7389; }
.btn { position: relative; width: 300px; height: 90px; border-radius: 50px; background: #111; color: #fff; font-size: 40px; font-weight: 800; }
.btn span { position: absolute; inset: 0; display: grid; place-items: center; }
.btn .b2 { opacity: 0; }
.hand { position: absolute; right: 70px; top: 230px; font-size: 110px; }
#band { position: absolute; left: 0; right: 0; bottom: 0; height: 450px; background: linear-gradient(#0b153000, #0b1530e6 22%); }
.cap { position: absolute; left: 50px; right: 50px; top: 1530px; display: flex; justify-content: center; }
.cap p { margin: 0; font-size: 62px; font-weight: 900; line-height: 1.3; text-align: center; text-wrap: balance; text-shadow: 0 4px 0 #0009; }
.cap b { color: var(--yellow); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${DUR}">
  <div id="stage" class="clip" data-start="0" data-duration="${DUR}" data-track-index="0" data-layout-allow-overflow style="position:absolute;inset:0">
    <div id="paper"></div>
    ${parts.join("\n    ")}
    <div id="band"></div>
    <div id="top"><div class="label">${label}</div><div class="title">${esc(S.title)}</div><div class="hook">${esc(S.hook)}</div></div>
    <div id="tabs">${TABS.map((n, j) => `<div id="tab${j}" class="tab">${j + 1} ${n}</div>`).join("")}</div>
  </div>
${caps.join("\n")}
  <audio id="vo" src="audio/narration.wav" data-start="0" data-duration="${DUR}" data-track-index="8" data-volume="1"></audio>
  <audio id="bgm" src="audio/bgm.mp3" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="${S.bgmVolume || 0.12}"></audio>
</div>
<script>
const tl = gsap.timeline({ paused: true });
${cmds.join("\n")}
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
fs.writeFileSync("index.html", html);
console.log("index.html", (html.length / 1024).toFixed(0) + "KB", "dur", DUR, "visuals", uid);
