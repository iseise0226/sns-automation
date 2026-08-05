import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";
import { ChibiOverlay } from "./ChibiOverlay";

// Instagramリール用の対談フォーマット(1080x1920・縦)。
// 参考にした他アカウント(kawamoto.money等)の「色付きカードのスライドが主役」の構成に寄せた:
//   ・上部に細い見出しリボン(hook)
//   ・中央に色テーマ付きのスライドパネル(見出しバー+白カード)。process/stairs/databadgeの3レイアウト
//   ・色テーマ(青緑/青/緑/橙/紫/赤)をスライドごとに巡回させて飽きさせない
//   ・下部に2キャラ(あかり左・聖さん右)が常駐して、話者が口パク+明るくなる
//   ・スライドにも音声(comment)を付け、図解の間も2人が喋って解説しているように見せる

const { fontFamily: MARU } = loadMaru();

const INK = "#1a2230";
const PAPER = "#f4f6f8";
const NAVY = "#16202e";
const RED = "#d92b2b";
const MARK = "#ffe14d"; // マーカー(黄)

const FPS = 30;

// 色テーマ。スライドごとに順番に巡回させる
type Theme = { main: string; light: string };
const THEMES: Theme[] = [
  { main: "#0f97b0", light: "#e7f6fa" }, // teal(参考のメイン色)
  { main: "#1a5fd9", light: "#e9f0ff" }, // blue
  { main: "#1f9e5a", light: "#e8f7ef" }, // green
  { main: "#e8820c", light: "#fdf2e2" }, // orange
  { main: "#8b46c9", light: "#f4ecfb" }, // purple
  { main: "#d92b2b", light: "#fdeaea" }, // red
];

// レイアウト位置
const HOOK_H = 108;
const PANEL_TOP = 128;
const PANEL_H = 1180;
const CAPTION_BOTTOM = 500;
const CHAR_H = 470;

export type ReelBeat = {
  speaker: "q" | "s";
  text: string;
  audio: string;
  durationInSeconds: number;
};

export type ReelGraphic = {
  type: "stairs" | "process" | "databadge";
  title: string;
  insertAfter: number;
  speaker?: "q" | "s";
  comment?: string;
  audio?: string;
  durationInSeconds?: number;
  items?: { t: string; s?: string }[];
  goal?: string;
  from?: { v: string; label?: string };
  to?: { v: string; label?: string };
  badge?: string;
};

type Props = {
  beats: ReelBeat[];
  footer?: string;
  graphics?: ReelGraphic[];
  hook?: string;
};

// **キーワード** を強調して描画。mode="mark"=黄マーカー / mode="color"=色付き文字
const Highlight: React.FC<{ text: string; mode?: "mark" | "color"; color?: string }> = ({ text, mode = "mark", color = MARK }) => {
  const parts = (text || "").split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          const inner = p.slice(2, -2);
          if (mode === "color") return <span key={i} style={{ color }}>{inner}</span>;
          return (
            <span key={i} style={{ background: color, borderRadius: 6, padding: "0 8px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
              {inner}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
};

const HookRibbon: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: HOOK_H, background: NAVY, display: "flex", alignItems: "center", padding: "0 48px" }}>
    <span style={{ fontFamily: MARU, fontWeight: 900, fontSize: 44, color: "#fff", lineHeight: 1.2 }}>{text}</span>
  </div>
);

const CharacterStage: React.FC<{ audio: string; active: "q" | "s" }> = ({ audio, active }) => (
  <>
    <ChibiOverlay audioSrc={audio} assetDir="akari_chibi" side="left" size={CHAR_H} bottom={0} hasHalf={false} dim={active !== "q"} />
    <ChibiOverlay audioSrc={audio} assetDir="satoshi_chibi" side="right" size={CHAR_H} bottom={0} hasHalf dim={active !== "s"} />
  </>
);

const CaptionBar: React.FC<{ text: string; theme: Theme; opacity: number }> = ({ text, theme, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 60,
      right: 60,
      bottom: CAPTION_BOTTOM,
      minHeight: 92,
      background: NAVY,
      borderRadius: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px 34px",
      opacity,
      border: `4px solid ${theme.main}`,
    }}
  >
    <span style={{ fontFamily: MARU, fontWeight: 700, fontSize: 40, color: "#fff", lineHeight: 1.35, textAlign: "center" }}>{text}</span>
  </div>
);

// 色テーマ付きのスライドカード。上に見出しバー、下に白い本文。
const SlidePanel: React.FC<{ theme: Theme; title?: string; pop: number; children: React.ReactNode }> = ({ theme, title, pop, children }) => {
  const s = Math.min(1, Math.max(0, pop));
  return (
    <div
      style={{
        position: "absolute",
        top: PANEL_TOP,
        left: 36,
        width: 1008,
        height: PANEL_H,
        borderRadius: 36,
        overflow: "hidden",
        background: theme.light,
        border: `5px solid ${theme.main}`,
        boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
        opacity: s,
        transform: `translateY(${(1 - s) * 20}px)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {title ? (
        <div style={{ background: theme.main, padding: "30px 44px", display: "flex", alignItems: "center", gap: 20, minHeight: 140 }}>
          <div style={{ minWidth: 76, width: 76, height: 76, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, color: "#fff", fontFamily: MARU, fontWeight: 900 }}>
            ?
          </div>
          <span style={{ fontFamily: MARU, fontWeight: 900, fontSize: 52, color: "#fff", lineHeight: 1.28 }}>
            <Highlight text={title || ""} mode="color" color={MARK} />
          </span>
        </div>
      ) : null}
      <div style={{ padding: "40px 46px", flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
};

// 縦フロー図(参考の縦つなぎピル)。process。
const ProcessGraphic: React.FC<{ g: ReelGraphic; theme: Theme; pop: number }> = ({ g, theme, pop }) => {
  const items = (g.items || []).slice(0, 5);
  return (
    <SlidePanel theme={theme} title={g.title} pop={pop}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", paddingBottom: 60 }}>
        {items.map((it, i) => {
          const step = spring({ frame: pop * 90 - i * 9, fps: FPS, config: { damping: 15, stiffness: 150 } });
          const o = Math.min(1, Math.max(0, step));
          return (
            <React.Fragment key={i}>
              {i > 0 ? (
                <svg width="42" height="30" viewBox="0 0 42 30" style={{ opacity: o, margin: "6px 0" }}>
                  <polygon points="21,28 4,4 38,4" fill={theme.main} />
                </svg>
              ) : null}
              <div
                style={{
                  opacity: o,
                  transform: `translateY(${(1 - o) * 16}px)`,
                  width: 850,
                  background: "#fff",
                  border: `5px solid ${theme.main}`,
                  borderRadius: 999,
                  padding: "24px 34px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 44, color: INK, lineHeight: 1.3 }}>
                  <Highlight text={it.t} />
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </SlidePanel>
  );
};

// 番号ステップ(01/02/03 + 絵文字)。stairs。
const STEP_EMOJI = ["🏦", "💰", "📈", "✅"];
const StairsGraphic: React.FC<{ g: ReelGraphic; theme: Theme; pop: number }> = ({ g, theme, pop }) => {
  const items = (g.items || []).slice(0, 4);
  const nums = ["01", "02", "03", "04"];
  return (
    <SlidePanel theme={theme} title={g.title} pop={pop}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", paddingBottom: 40 }}>
        {items.map((it, i) => {
          const step = spring({ frame: pop * 90 - i * 10, fps: FPS, config: { damping: 15, stiffness: 150 } });
          const o = Math.min(1, Math.max(0, step));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 22, opacity: o, transform: `translateX(${(1 - o) * -24}px)` }}>
              <div style={{ minWidth: 100, height: 100, borderRadius: 18, background: theme.main, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MARU, fontWeight: 900, fontSize: 46, color: "#fff" }}>
                {nums[i]}
              </div>
              <div style={{ flex: 1, background: "#fff", border: `4px solid ${theme.main}`, borderRadius: 18, padding: "18px 26px" }}>
                <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 40, color: INK, lineHeight: 1.3 }}>
                  <Highlight text={it.t} />
                </div>
                {it.s ? <div style={{ fontFamily: MARU, fontSize: 28, color: "#667", marginTop: 4 }}>{it.s}</div> : null}
              </div>
              <div style={{ fontSize: 64, width: 86, textAlign: "center" }}>{STEP_EMOJI[i % STEP_EMOJI.length]}</div>
            </div>
          );
        })}
        {g.goal ? (
          <div style={{ textAlign: "center", marginTop: 6 }}>
            <span style={{ display: "inline-block", background: theme.main, color: "#fff", fontFamily: MARU, fontWeight: 900, fontSize: 38, borderRadius: 999, padding: "14px 40px" }}>
              {g.goal}
            </span>
          </div>
        ) : null}
      </div>
    </SlidePanel>
  );
};

// 数字のビフォーアフター棒グラフ。databadge。
const DataBadgeGraphic: React.FC<{ g: ReelGraphic; theme: Theme; pop: number }> = ({ g, theme, pop }) => {
  const from = g.from || { v: "" };
  const to = g.to || { v: "" };
  const grow = Math.min(1, Math.max(0, pop));
  return (
    <SlidePanel theme={theme} title={g.title} pop={pop}>
      <div style={{ position: "relative", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 120, height: "100%", paddingBottom: 90 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 46, color: "#667", marginBottom: 12 }}>{from.v}</div>
            <div style={{ width: 180, height: 190 * grow, background: "#b7c0cc", borderRadius: "12px 12px 0 0" }} />
            {from.label ? <div style={{ fontFamily: MARU, fontSize: 30, color: "#667", marginTop: 12 }}>{from.label}</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 58, color: theme.main, marginBottom: 12 }}>{to.v}</div>
            <div style={{ width: 180, height: 380 * grow, background: theme.main, borderRadius: "12px 12px 0 0" }} />
            {to.label ? <div style={{ fontFamily: MARU, fontSize: 30, color: "#667", marginTop: 12 }}>{to.label}</div> : null}
          </div>
        </div>
        {g.badge ? (
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 20,
              opacity: Math.min(1, Math.max(0, spring({ frame: pop * 90 - 20, fps: FPS, config: { damping: 12, stiffness: 200 } }))),
              transform: "rotate(-10deg)",
              background: MARK,
              fontFamily: MARU,
              fontWeight: 900,
              fontSize: 38,
              color: RED,
              borderRadius: "50%",
              width: 180,
              height: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 12,
            }}
          >
            {g.badge}
          </div>
        ) : null}
      </div>
    </SlidePanel>
  );
};

// 図解でないただの掛け合い。テーマ色のパネルに大きな一言。
const TalkGraphic: React.FC<{ text: string; speaker: "q" | "s"; theme: Theme; pop: number }> = ({ text, speaker, theme, pop }) => {
  const s = Math.min(1, Math.max(0, pop));
  return (
    <SlidePanel theme={theme} pop={pop}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", opacity: s }}>
        <div style={{ fontSize: 120, marginBottom: 30 }}>{speaker === "q" ? "❓" : "💡"}</div>
        <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 68, lineHeight: 1.5, color: INK, padding: "0 20px" }}>
          <Highlight text={text} />
        </div>
      </div>
    </SlidePanel>
  );
};

const FADE_FRAMES = 8;

const SegmentFrame: React.FC<{
  durationInFrames: number;
  audio: string;
  speaker: "q" | "s";
  caption: string;
  theme: Theme;
  children: React.ReactNode;
}> = ({ durationInFrames, audio, speaker, caption, theme, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: PAPER }}>
      {audio ? <Audio src={staticFile(audio)} /> : null}
      {children}
      <CaptionBar text={caption} theme={theme} opacity={Math.min(1, opacity * 1.2)} />
      <CharacterStage audio={audio} active={speaker} />
    </AbsoluteFill>
  );
};

const BeatView: React.FC<{ beat: ReelBeat; durationInFrames: number; theme: Theme }> = ({ beat, durationInFrames, theme }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 3, fps, config: { damping: 15, stiffness: 120, mass: 0.7 } });
  return (
    <SegmentFrame durationInFrames={durationInFrames} audio={beat.audio} speaker={beat.speaker} caption={beat.text} theme={theme}>
      <TalkGraphic text={beat.text} speaker={beat.speaker} theme={theme} pop={pop} />
    </SegmentFrame>
  );
};

const GraphicView: React.FC<{ graphic: ReelGraphic; durationInFrames: number; theme: Theme }> = ({ graphic, durationInFrames, theme }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 90, mass: 0.8 } });
  const speaker = graphic.speaker || "s";
  return (
    <SegmentFrame durationInFrames={durationInFrames} audio={graphic.audio || ""} speaker={speaker} caption={graphic.comment || graphic.title} theme={theme}>
      {graphic.type === "process" ? <ProcessGraphic g={graphic} theme={theme} pop={pop} /> : null}
      {graphic.type === "stairs" ? <StairsGraphic g={graphic} theme={theme} pop={pop} /> : null}
      {graphic.type === "databadge" ? <DataBadgeGraphic g={graphic} theme={theme} pop={pop} /> : null}
    </SegmentFrame>
  );
};

export const TaidanReel: React.FC<Props> = ({ beats, footer, graphics, hook }) => {
  let startFrame = 0;
  let slideIdx = 0; // 色テーマを段ごとに巡回させるための通し番号
  const items: React.ReactNode[] = [];
  beats.forEach((beat, i) => {
    const durationInFrames = Math.round(beat.durationInSeconds * FPS);
    const from = startFrame;
    startFrame += durationInFrames;
    const theme = THEMES[slideIdx++ % THEMES.length];
    items.push(
      <Sequence key={`b${i}`} from={from} durationInFrames={durationInFrames}>
        <BeatView beat={beat} durationInFrames={durationInFrames} theme={theme} />
      </Sequence>
    );
    (graphics || []).filter((g) => g.insertAfter === i).forEach((g, gi) => {
      const gDur = Math.round((g.durationInSeconds || 3.2) * FPS);
      const gTheme = THEMES[slideIdx++ % THEMES.length];
      items.push(
        <Sequence key={`g${i}-${gi}`} from={startFrame} durationInFrames={gDur}>
          <GraphicView graphic={g} durationInFrames={gDur} theme={gTheme} />
        </Sequence>
      );
      startFrame += gDur;
    });
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Audio src={staticFile("bgm.mp3")} loop volume={0.1} />
      {items}
      {hook ? <HookRibbon text={hook} /> : null}
      {footer ? (
        <div style={{ position: "absolute", bottom: 10, left: 0, width: 1080, textAlign: "center", fontFamily: MARU, fontWeight: 700, fontSize: 22, color: "#aab" }}>
          {footer}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
