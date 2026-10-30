import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// AIラク活(旧sessi_life)の「チャット型」リール(2026-10-30〜)
// 上=固定のタイトル帯、真ん中=①悩み②原因③結論④コピペ⑤完成の章ごとに切り替わる画面、下=ナレーションの字幕。
// 悩みを言い当てて心の声を見せ、本当の原因まで掘ってから、時間の比較で結論→理由→「自分→AI」の吹き出しで
// コピペ用の文と、その文を実際にAIへ送って返ってきた答え→もう一歩のコツを見せる(約1分の悩み→PREP)。
// 書体はListReelと同じ理由で同梱のTTF(remotion/assets/fonts_rounded → public-dir/fonts)を読む。
const ROUND = "ChatReelRounded";
const fontHandle = delayRender("ChatReel fonts");
Promise.all(
  [
    ["fonts/MPLUSRounded1c-Bold.ttf", "700"],
    ["fonts/MPLUSRounded1c-ExtraBold.ttf", "800"],
    ["fonts/MPLUSRounded1c-Black.ttf", "900"],
  ].map(([file, weight]) =>
    new FontFace(ROUND, `url(${staticFile(file)})`, { weight }).load().then((f) => document.fonts.add(f))
  )
)
  .then(() => continueRender(fontHandle))
  .catch((e) => {
    console.error("ChatReel font load failed", e);
    continueRender(fontHandle);
  });

export type ChatScene = "pain" | "root" | "point" | "reason" | "prompt" | "result" | "tip" | "save";

export type ChatLine = {
  text: string; // 字幕。【】で囲んだ部分を色付きで強調する
  scene: ChatScene;
  audio?: string; // public-dir内の音声ファイル
  seconds: number;
};

export type ChatReelProps = {
  chip: string;
  topLine: string;
  topMain: string; // 【】で囲んだ部分にマーカー
  hook: { beforeLabel: string; before: string; afterLabel: string; after: string; question: string };
  worries: string[]; // 悩んでいる時の心の声
  root: string; // 「本当の原因は…」のカード
  reason: string; // 「〜だから」の理由カード
  tip: string; // 「＋1のコツ」のカード
  prompt: string; // [[ ]]で囲んだ部分は「自分で書き換える所」として色を付ける
  result: string;
  saveLabel: string;
  comment: string;
  handle: string;
  lines: ChatLine[];
  bgm?: string;
  se?: { pop?: string; save?: string };
};

const FPS = 30;
const C = {
  ink: "#23224A",
  muted: "#8584A6",
  coral: "#FF6B5B",
  coralSoft: "#FFE1DC",
  indigo: "#4B4FE0",
  indigoDeep: "#3B3FD8",
  shadow: "rgba(59,63,216,0.16)",
};

export const chatReelDuration = (p: ChatReelProps) =>
  p.lines.reduce((s, l) => s + Math.round(l.seconds * FPS), 0);

const STEP_OF: Record<ChatScene, number> = { pain: 0, root: 1, point: 2, reason: 2, prompt: 3, result: 4, tip: 4, save: 5 };
const STEPS = ["悩み", "原因", "結論", "コピペ", "完成"];

// 【強調】を色付きspanに
const Emph: React.FC<{ text: string; color: string; bg?: string }> = ({ text, color, bg }) => (
  <>
    {text.split(/(【[^】]*】)/).map((part, i) =>
      part.startsWith("【") ? (
        <span key={i} style={{ color, background: bg, borderRadius: 10, padding: bg ? "0 10px" : 0 }}>
          {part.slice(1, -1)}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    )}
  </>
);

// 打ち込まれていくように文字を出す。[[ ]]の差し替え箇所は色付き
const Typed: React.FC<{ text: string; shown: number; slotStyle: React.CSSProperties }> = ({ text, shown, slotStyle }) => {
  const parts = text.split(/(\[\[[^\]]*\]\])/);
  let left = shown;
  return (
    <>
      {parts.map((part, i) => {
        const isSlot = part.startsWith("[[");
        const body = isSlot ? part.slice(2, -2) : part;
        const chars = [...body];
        const take = Math.max(0, Math.min(chars.length, left));
        left -= chars.length;
        if (take <= 0) return null;
        const s = chars.slice(0, take).join("");
        return isSlot ? (
          <span key={i} style={slotStyle}>
            {s}
          </span>
        ) : (
          <React.Fragment key={i}>{s}</React.Fragment>
        );
      })}
    </>
  );
};

const plainLength = (t: string) => [...t.replace(/\[\[|\]\]/g, "")].length;

// 字幕を1〜2行に分ける。1〜2文字だけ次の行に落ちないよう、真ん中に近い切れ目(、や助詞の後)で自分で改行する
const CAP_ONE_LINE = 14;
const splitCaption = (text: string): string[] => {
  const plain = text.replace(/[【】]/g, "");
  if ([...plain].length <= CAP_ONE_LINE) return [text];
  const chars = [...text];
  let best = -1;
  let bestScore = Infinity;
  let visible = 0;
  let inEmph = false;
  const half = [...plain].length / 2;
  for (let i = 0; i < chars.length - 1; i++) {
    const ch = chars[i];
    if (ch === "【") inEmph = true;
    if (ch === "】") inEmph = false;
    if (ch !== "【" && ch !== "】") visible++;
    if (inEmph) continue;
    const next = chars[i + 1];
    // 助詞の後でも、次がひらがなだと「なが|ら」のように言葉の途中なので切らない
    const good = /[、。！？」]/.test(ch)
      ? 0
      : ch === "】" || next === "【"
        ? 1
        : /[をにがはでとも]/.test(ch) && next !== "】" && !/[ぁ-ん]/.test(next)
          ? 2
          : 99;
    if (good === 99) continue;
    const score = Math.abs(visible - half) + good * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) best = Math.floor(chars.length / 2);
  return [chars.slice(0, best + 1).join(""), chars.slice(best + 1).join("")];
};

const SaveIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round">
    <path d="M6 3h12v18l-6-4.5L6 21z" />
  </svg>
);

const pop = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 160, mass: 0.7 } });

// ---- 真ん中の画面 ----

// ①悩み: 問いかけで言い当てて、心の声を1つずつ浮かべる
const PainView: React.FC<{ p: ChatReelProps; f: number; dur: number }> = ({ p, f, dur }) => {
  const { fps } = useVideoConfig();
  const q = pop(f, fps, 0);
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          fontSize: 76,
          fontWeight: 900,
          lineHeight: 1.32,
          textAlign: "center",
          color: C.ink,
          whiteSpace: "pre-line",
          transform: `scale(${0.9 + 0.1 * q})`,
          opacity: q,
        }}
      >
        {p.hook.question}
      </div>
      <div style={{ marginTop: 56, width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        {p.worries.map((w, i) => {
          const e = pop(f, fps, Math.round(dur * (0.22 + 0.2 * i)));
          const left = i % 2 === 0;
          return (
            <div
              key={i}
              style={{
                alignSelf: left ? "flex-start" : "flex-end",
                marginLeft: left ? 30 + i * 20 : 0,
                marginRight: left ? 0 : 30,
                padding: "22px 40px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.9)",
                border: `4px dashed ${C.muted}`,
                color: "#5D5C80",
                fontSize: 44,
                fontWeight: 800,
                opacity: e,
                transform: `translateY(${(1 - e) * 40}px) rotate(${left ? -2 : 2}deg)`,
              }}
            >
              💭 {w}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ②結論: 時間の比較で言い切る。続きを見たくなるよう「このあと」を添える
const PointView: React.FC<{ p: ChatReelProps; f: number }> = ({ p, f }) => {
  const { fps } = useVideoConfig();
  const a = pop(f, fps, 0);
  const b = pop(f, fps, 8);
  const n = interpolate(f, [22, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const box: React.CSSProperties = { width: 380, padding: "44px 0 36px", borderRadius: 44, textAlign: "center" };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <div style={{ ...box, background: "rgba(255,255,255,0.85)", color: C.muted, transform: `scale(${a})` }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{p.hook.beforeLabel}</div>
          <div style={{ fontSize: 116, fontWeight: 900, lineHeight: 1.1 }}>{p.hook.before}</div>
        </div>
        <div style={{ fontSize: 80, fontWeight: 900, color: C.coral, opacity: b }}>→</div>
        <div
          style={{
            ...box,
            background: C.coral,
            color: "#fff",
            transform: `scale(${1.08 * b})`,
            boxShadow: `0 20px 52px rgba(255,107,91,0.35)`,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 800 }}>{p.hook.afterLabel}</div>
          <div style={{ fontSize: 116, fontWeight: 900, lineHeight: 1.1 }}>{p.hook.after}</div>
        </div>
      </div>
      <div
        style={{
          marginTop: 70,
          fontSize: 40,
          fontWeight: 800,
          padding: "14px 36px",
          borderRadius: 999,
          background: "#fff",
          color: C.indigoDeep,
          boxShadow: `0 8px 24px ${C.shadow}`,
          opacity: n,
          transform: `translateY(${(1 - n) * 24}px)`,
        }}
      >
        ▼ このあとコピペ用の文を見せます
      </div>
    </div>
  );
};

// 原因・理由・コツを、札と一緒に大きく出すカード
const CardView: React.FC<{ label: string; text: string; f: number; dark?: boolean }> = ({ label, text, f, dark }) => {
  const { fps } = useVideoConfig();
  const e = pop(f, fps, 0);
  const t = pop(f, fps, 6);
  return (
    <div
      style={{
        width: "100%",
        padding: "70px 50px 76px",
        borderRadius: 48,
        background: dark ? C.ink : "#fff",
        boxShadow: `0 16px 44px ${C.shadow}`,
        textAlign: "center",
        opacity: e,
        transform: `scale(${0.92 + 0.08 * e})`,
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontSize: 40,
          fontWeight: 900,
          padding: "10px 40px",
          borderRadius: 999,
          background: C.coral,
          color: "#fff",
          transform: `scale(${t})`,
        }}
      >
        {label}
      </span>
      <div style={{ marginTop: 40, fontSize: 68, fontWeight: 900, lineHeight: 1.42, color: dark ? "#fff" : C.ink, whiteSpace: "pre-line" }}>{text}</div>
    </div>
  );
};

const Bubble: React.FC<{ who: string; me?: boolean; children: React.ReactNode; enter: number; style?: React.CSSProperties }> = ({
  who,
  me,
  children,
  enter,
  style,
}) => (
  <div
    style={{
      alignSelf: me ? "flex-end" : "flex-start",
      maxWidth: "92%",
      padding: "30px 36px",
      borderRadius: 44,
      borderBottomRightRadius: me ? 12 : 44,
      borderBottomLeftRadius: me ? 44 : 12,
      background: me ? C.indigo : "#fff",
      color: me ? "#fff" : C.ink,
      boxShadow: me ? "none" : `0 12px 36px ${C.shadow}`,
      fontSize: 39,
      fontWeight: 700,
      lineHeight: 1.55,
      whiteSpace: "pre-wrap",
      opacity: enter,
      transform: `translateY(${(1 - enter) * 60}px) scale(${0.94 + 0.06 * enter})`,
      transformOrigin: me ? "bottom right" : "bottom left",
      ...style,
    }}
  >
    <div style={{ fontSize: 26, fontWeight: 800, opacity: 0.75, marginBottom: 8 }}>{who}</div>
    {children}
  </div>
);

const Dots: React.FC<{ f: number }> = ({ f }) => (
  <span style={{ letterSpacing: 6 }}>
    {[0, 1, 2].map((i) => (
      <span key={i} style={{ opacity: 0.3 + 0.7 * Math.max(0, Math.sin((f / 6 - i) * 1.2)) }}>
        ●
      </span>
    ))}
  </span>
);

const PromptView: React.FC<{ p: ChatReelProps; f: number; dur: number }> = ({ p, f, dur }) => {
  const { fps } = useVideoConfig();
  const enter = pop(f, fps, 0);
  const total = plainLength(p.prompt);
  const typeEnd = Math.max(20, Math.min(dur * 0.55, 60));
  const shown = Math.ceil(interpolate(f, [4, typeEnd], [0, total], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const copyPulse = f > typeEnd ? 1 + 0.06 * Math.sin((f - typeEnd) / 4) : 1;
  const aiEnter = pop(f, fps, Math.round(dur * 0.72));
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 28 }}>
      <Bubble who="あなた" me enter={enter}>
        <Typed
          text={p.prompt}
          shown={shown}
          slotStyle={{ background: "rgba(255,255,255,0.28)", borderRadius: 10, padding: "0 8px", fontWeight: 900 }}
        />
        <div style={{ marginTop: 18 }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 28,
              fontWeight: 900,
              padding: "8px 22px",
              borderRadius: 16,
              background: "#fff",
              color: C.indigo,
              transform: `scale(${copyPulse})`,
              opacity: f > typeEnd ? 1 : 0.35,
            }}
          >
            ⧉ この文をコピー
          </span>
        </div>
      </Bubble>
      {f > dur * 0.72 && (
        <Bubble who="AI" enter={aiEnter}>
          <Dots f={f} />
        </Bubble>
      )}
    </div>
  );
};

const ResultView: React.FC<{ p: ChatReelProps; f: number; dur: number; save: boolean }> = ({ p, f, dur, save }) => {
  const { fps } = useVideoConfig();
  const enter = save ? 1 : pop(f, fps, 0);
  const total = [...p.result].length;
  const shown = save ? total : Math.ceil(interpolate(f, [4, Math.max(24, dur * 0.7)], [0, total], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const s = save ? pop(f, fps, 2) : 0;
  const c = save ? pop(f, fps, 14) : 0;
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
      <Bubble
        who="AI　できあがり"
        enter={enter}
        style={{ alignSelf: "stretch", maxWidth: "100%", fontSize: save ? 33 : 37, transition: "none" }}
      >
        {[...p.result].slice(0, shown).join("")}
      </Bubble>
      {save && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "28px 52px",
              borderRadius: 999,
              background: C.coral,
              color: "#fff",
              fontSize: 54,
              fontWeight: 900,
              boxShadow: "0 16px 40px rgba(255,107,91,0.35)",
              transform: `scale(${s})`,
            }}
          >
            <SaveIcon size={58} />
            {p.saveLabel}
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              padding: "12px 30px",
              borderRadius: 999,
              background: "#fff",
              color: C.indigoDeep,
              boxShadow: `0 8px 24px ${C.shadow}`,
              opacity: c,
              transform: `translateY(${(1 - c) * 24}px)`,
            }}
          >
            💬 {p.comment}
          </div>
        </>
      )}
    </div>
  );
};

// ---- 全体 ----

export const ChatReel: React.FC<ChatReelProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 各行の開始フレーム
  const starts: number[] = [];
  let acc = 0;
  for (const l of p.lines) {
    starts.push(acc);
    acc += Math.round(l.seconds * FPS);
  }
  let idx = starts.findIndex((s, i) => frame >= s && frame < s + Math.round(p.lines[i].seconds * FPS));
  if (idx < 0) idx = p.lines.length - 1;
  const line = p.lines[idx];

  // 同じsceneが続く間は1つの画面として扱う(吹き出しを出し直さない)
  let sceneStart = idx;
  while (sceneStart > 0 && p.lines[sceneStart - 1].scene === line.scene) sceneStart--;
  let sceneEnd = idx;
  while (sceneEnd < p.lines.length - 1 && p.lines[sceneEnd + 1].scene === line.scene) sceneEnd++;
  const sf = frame - starts[sceneStart];
  const sdur = starts[sceneEnd] + Math.round(p.lines[sceneEnd].seconds * FPS) - starts[sceneStart];

  const step = STEP_OF[line.scene];
  const lf = frame - starts[idx];
  const capIn = spring({ frame: lf, fps, config: { damping: 14, stiffness: 200, mass: 0.6 } });

  // 場面の切り替わりで音を鳴らすフレーム
  const sceneStarts = starts.filter((_, i) => i === 0 || p.lines[i - 1].scene !== p.lines[i].scene);
  const saveStart = starts[p.lines.findIndex((l) => l.scene === "save")];

  return (
    <AbsoluteFill
      style={{
        fontFamily: `${ROUND}, sans-serif`,
        background: "linear-gradient(170deg, #EEF0FF 0%, #F8EEFF 60%, #FFF1EC 100%)",
        color: C.ink,
      }}
    >
      {/* 上の固定帯 */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 436, paddingTop: 96, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 34,
            fontWeight: 800,
            padding: "10px 32px",
            borderRadius: 999,
            background: C.coral,
            color: "#fff",
            letterSpacing: 2,
          }}
        >
          {p.chip}
        </span>
        <div style={{ marginTop: 22, fontSize: 50, fontWeight: 800, color: C.indigoDeep }}>{p.topLine}</div>
        <div style={{ marginTop: 10, fontSize: 86, fontWeight: 900, lineHeight: 1.15 }}>
          <Emph text={p.topMain} color={C.ink} bg={C.coralSoft} />
        </div>
      </div>

      {/* 章 */}
      <div style={{ position: "absolute", top: 470, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14 }}>
        {STEPS.map((s, i) => {
          const done = i < step;
          const on = i === step;
          return (
            <span
              key={s}
              style={{
                fontSize: 29,
                fontWeight: 800,
                padding: "10px 22px",
                borderRadius: 999,
                background: on ? C.coral : done ? C.coralSoft : "rgba(255,255,255,0.75)",
                color: on ? "#fff" : done ? C.coral : "#A3A2C2",
              }}
            >
              {done ? "✓ " : ["① ", "② ", "③ ", "④ ", "⑤ "][i]}
              {s}
            </span>
          );
        })}
      </div>

      {/* 真ん中 */}
      <div
        style={{
          position: "absolute",
          top: 560,
          left: 70,
          right: 70,
          height: 790,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {line.scene === "pain" && <PainView p={p} f={sf} dur={sdur} />}
        {line.scene === "point" && <PointView p={p} f={sf} />}
        {line.scene === "root" && <CardView label="本当の原因は…" text={p.root} f={sf} dark />}
        {line.scene === "reason" && <CardView label="なぜAIだと楽？" text={p.reason} f={sf} />}
        {line.scene === "tip" && <CardView label="＋1のコツ" text={p.tip} f={sf} />}
        {line.scene === "prompt" && <PromptView p={p} f={sf} dur={sdur} />}
        {(line.scene === "result" || line.scene === "save") && (
          <ResultView p={p} f={sf} dur={sdur} save={line.scene === "save"} />
        )}
      </div>

      {/* 字幕(リールの下のボタンや説明文に隠れない高さ) */}
      <div
        style={{
          position: "absolute",
          top: 1388,
          left: 50,
          right: 50,
          textAlign: "center",
          fontSize: 66,
          fontWeight: 900,
          lineHeight: 1.3,
          color: C.ink,
          WebkitTextStroke: "14px #FFFFFF",
          paintOrder: "stroke fill",
          transform: `scale(${0.85 + 0.15 * capIn})`,
          opacity: capIn,
        }}
      >
        {(() => {
          const rows = splitCaption(line.text);
          const longest = Math.max(...rows.map((r) => [...r.replace(/[【】]/g, "")].length));
          const size = Math.min(66, Math.floor(960 / longest));
          return rows.map((r, i) => (
            <div key={i} style={{ fontSize: size, whiteSpace: "nowrap" }}>
              <Emph text={r} color={C.coral} />
            </div>
          ));
        })()}
      </div>

      <div style={{ position: "absolute", bottom: 52, left: 0, right: 0, textAlign: "center", fontSize: 30, fontWeight: 700, color: C.muted, opacity: 0.8 }}>
        {p.handle}
      </div>

      {/* 音 */}
      {p.lines.map((l, i) =>
        l.audio ? (
          <Sequence key={`a${i}`} from={starts[i]} durationInFrames={Math.round(l.seconds * FPS)}>
            <Audio src={staticFile(l.audio)} />
          </Sequence>
        ) : null
      )}
      {p.bgm && <Audio src={staticFile(p.bgm)} volume={0.1} />}
      {p.se?.pop &&
        sceneStarts.map((s, i) => (
          <Sequence key={`se${i}`} from={s} durationInFrames={20}>
            <Audio src={staticFile(p.se!.pop!)} volume={0.35} />
          </Sequence>
        ))}
      {p.se?.save && saveStart !== undefined && (
        <Sequence from={saveStart + 2} durationInFrames={40}>
          <Audio src={staticFile(p.se.save)} volume={0.4} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
