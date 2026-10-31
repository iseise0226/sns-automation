import React from "react";
import { AbsoluteFill } from "remotion";
import { C, ROUND, splitCaption } from "./ChatReel";

// AIラク活リールの表紙(2026-10-30〜)。投稿時に cover_url として付ける。
// プロフィールの一覧では真ん中の3:4(上下240pxずつ切れる)しか見えないので、文字は y=240〜1680 に収める。
// A=時間の比較を大きく / B=悩みの問いかけを吹き出しで / C=紺地で「本当の原因」を予告(続きが気になる)
export type ChatCoverProps = {
  variant: "A" | "B" | "C";
  chip: string;
  topic: string; // 何の話か(「断りのメール」)
  pain: string; // 悩みの一言(「断りのメール、書けない…」)
  hook: string; // 続きが気になる一言(「原因は文章力じゃない」)
  question: string; // 冒頭の問いかけ(\nで改行)
  before: string;
  after: string;
  handle: string;
};

const count = (t: string) => [...t].length;
// 1行の長さに合わせて文字の大きさを決める(1文字だけ次の行に落ちないように)
const fit = (rows: string[], width: number, max: number) => Math.min(max, Math.floor(width / Math.max(...rows.map(count))));

const Chip: React.FC<{ text: string; dark?: boolean }> = ({ text, dark }) => (
  <span
    style={{
      display: "inline-block",
      fontSize: 40,
      fontWeight: 800,
      padding: "12px 38px",
      borderRadius: 999,
      background: dark ? "rgba(255,255,255,0.14)" : C.coral,
      color: "#fff",
      letterSpacing: 2,
    }}
  >
    {text}
  </span>
);

const CoverA: React.FC<ChatCoverProps> = (p) => (
  <AbsoluteFill style={{ background: "linear-gradient(170deg, #EEF0FF 0%, #F8EEFF 60%, #FFF1EC 100%)", alignItems: "center" }}>
    <div style={{ marginTop: 300 }}>
      <Chip text={p.chip} />
    </div>
    <div style={{ marginTop: 60, fontSize: fit([p.topic], 940, 120), fontWeight: 900, color: C.ink }}>
      <span style={{ background: `linear-gradient(transparent 58%, ${C.coralSoft} 58%)`, padding: "0 12px" }}>{p.topic}</span>
    </div>
    <div style={{ marginTop: 70, display: "flex", alignItems: "center", gap: 30 }}>
      <span style={{ fontSize: 120, fontWeight: 900, color: C.muted, textDecoration: "line-through", textDecorationThickness: 10 }}>
        {p.before}
      </span>
      <span style={{ fontSize: 110, fontWeight: 900, color: C.coral }}>→</span>
    </div>
    <div style={{ fontSize: 290, fontWeight: 900, lineHeight: 1, color: C.coral, letterSpacing: -6 }}>{p.after}</div>
    <div
      style={{
        marginTop: 80,
        fontSize: fit([p.hook], 840, 70),
        fontWeight: 900,
        padding: "26px 56px",
        borderRadius: 32,
        background: C.ink,
        color: "#fff",
      }}
    >
      {p.hook}
    </div>
  </AbsoluteFill>
);

const CoverB: React.FC<ChatCoverProps> = (p) => (
  <AbsoluteFill
    style={{ background: "linear-gradient(170deg, #EEF0FF 0%, #F8EEFF 60%, #FFF1EC 100%)", alignItems: "center", padding: "0 70px" }}
  >
    <div style={{ marginTop: 300 }}>
      <Chip text={p.chip} />
    </div>
    <div
      style={{
        marginTop: 80,
        alignSelf: "stretch",
        padding: "64px 60px",
        borderRadius: 64,
        borderBottomRightRadius: 16,
        background: C.indigo,
        color: "#fff",
        fontSize: fit(p.question.split("\n"), 820, 112),
        fontWeight: 900,
        lineHeight: 1.3,
        whiteSpace: "pre-line",
      }}
    >
      {p.question}
    </div>
    <div
      style={{
        marginTop: 44,
        alignSelf: "flex-start",
        padding: "40px 56px",
        borderRadius: 56,
        borderBottomLeftRadius: 16,
        background: "#fff",
        boxShadow: `0 16px 44px ${C.shadow}`,
        fontSize: 76,
        fontWeight: 900,
        color: C.ink,
      }}
    >
      AIなら<span style={{ color: C.coral }}>{p.after}</span>で終わる
    </div>
  </AbsoluteFill>
);

const CoverC: React.FC<ChatCoverProps> = (p) => (
  <AbsoluteFill style={{ background: `linear-gradient(170deg, #2B2A5C 0%, ${C.ink} 70%)`, alignItems: "center", textAlign: "center" }}>
    <div style={{ marginTop: 300 }}>
      <Chip text={p.chip} dark />
    </div>
    <div style={{ marginTop: 90, fontSize: fit([p.pain], 940, 76), fontWeight: 800, color: "#C9C8E8" }}>{p.pain}</div>
    <div style={{ marginTop: 70, fontSize: 54, fontWeight: 900, padding: "12px 40px", borderRadius: 999, background: C.coral, color: "#fff" }}>
      本当の原因は…
    </div>
    {(() => {
      // 9字までは1行に収める(「直接言えな|い不安」のような言葉の途中の改行を避ける)
      const rows = splitCaption(p.hook.replace(/^(本当の)?原因は、?/, ""), 9);
      return (
        <div style={{ marginTop: 44, fontSize: fit(rows, 940, 150), fontWeight: 900, lineHeight: 1.22, color: "#fff" }}>
          {rows.map((r, i) => (
            <div key={i}>{r}</div>
          ))}
        </div>
      );
    })()}
    <div style={{ marginTop: 80, fontSize: 64, fontWeight: 900, color: "#fff" }}>
      AIで <span style={{ color: "#C9C8E8", textDecoration: "line-through" }}>{p.before}</span> →{" "}
      <span style={{ color: C.coral }}>{p.after}</span>
    </div>
  </AbsoluteFill>
);

export const ChatCover: React.FC<ChatCoverProps> = (p) => (
  <div style={{ fontFamily: `${ROUND}, sans-serif`, width: "100%", height: "100%" }}>
    {p.variant === "A" ? <CoverA {...p} /> : p.variant === "B" ? <CoverB {...p} /> : <CoverC {...p} />}
    <div style={{ position: "absolute", bottom: 270, left: 0, right: 0, textAlign: "center", fontSize: 36, fontWeight: 700, color: p.variant === "C" ? "#8D8CB8" : C.muted }}>
      {p.handle}
    </div>
  </div>
);
