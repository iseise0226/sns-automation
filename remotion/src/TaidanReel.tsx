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
// 参考にした他アカウント(kawamoto.money等)の構成に寄せた:
//   ・上部に赤帯の固定見出し(hook)
//   ・中央に「主役のスライド」(フロー図/番号ステップ/棒グラフ)。キーワードはマーカーで強調
//   ・下部に2キャラ(あかり=左・聖さん=右)が常駐して、その瞬間の話者が口パク+明るくなる
// スライドにも音声(comment)を付けるので、図解の間も下の2人が喋って解説しているように見える。

const { fontFamily: MARU } = loadMaru();

const INK = "#1a2230";
const PAPER = "#ffffff";
const NAVY = "#16202e";
const RED = "#d92b2b";
const TEAL = "#0f97b0";
const BLUE = "#1a5fd9";
const GREEN = "#1f9e5a";
const MARK = "#ffe14d"; // マーカー(黄)

const FPS = 30;

// 下の2キャラが占める高さ。スライドはこの上に収める
const CHAR_H = 470;
const CHAR_BOTTOM = 0;
const CAPTION_BOTTOM = CHAR_H - 70; // キャラの頭のあたりに字幕帯

export type ReelBeat = {
  speaker: "q" | "s"; // q=質問役(あかり) / s=先生(聖さん)
  text: string; // 読み上げ＆字幕に出す文
  audio: string; // publicルート相対のwavパス
  durationInSeconds: number;
};

// 中央に出す図解スライド。narration(comment/audio/speaker)を持ち、下の2人が喋りながら解説する。
export type ReelGraphic = {
  type: "stairs" | "process" | "databadge";
  title: string;
  insertAfter: number; // このindexのbeatが終わった直後に挿入
  speaker?: "q" | "s"; // このスライドを解説する側(既定: 先生)
  comment?: string; // 読み上げ＆字幕
  audio?: string; // commentのwav(post側で生成)
  durationInSeconds?: number;
  items?: { t: string; s?: string }[]; // stairs/process
  goal?: string; // stairsの到達点
  from?: { v: string; label?: string }; // databadge
  to?: { v: string; label?: string };
  badge?: string;
};

type Props = {
  beats: ReelBeat[];
  footer?: string;
  graphics?: ReelGraphic[];
  hook?: string;
};

// **キーワード** をマーカー強調して描画する
const Highlight: React.FC<{ text: string; color?: string }> = ({ text, color = MARK }) => {
  const parts = (text || "").split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <span key={i} style={{ background: color, borderRadius: 6, padding: "0 8px", boxDecorationBreak: "clone" }}>
            {p.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
};

const TopBanner: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: 1080,
      minHeight: 180,
      background: RED,
      display: "flex",
      alignItems: "center",
      padding: "48px 56px 30px",
    }}
  >
    <span style={{ fontFamily: MARU, fontWeight: 900, fontSize: 56, lineHeight: 1.32, color: "#fff" }}>{text}</span>
  </div>
);

// 下部に常駐する2キャラ。activeの側が口パク+明るく、もう片方は暗く小さく。
const CharacterStage: React.FC<{ audio: string; active: "q" | "s" }> = ({ audio, active }) => (
  <>
    <ChibiOverlay
      audioSrc={audio}
      assetDir="akari_chibi"
      side="left"
      size={CHAR_H}
      bottom={CHAR_BOTTOM}
      hasHalf={false}
      dim={active !== "q"}
    />
    <ChibiOverlay
      audioSrc={audio}
      assetDir="satoshi_chibi"
      side="right"
      size={CHAR_H}
      bottom={CHAR_BOTTOM}
      hasHalf
      dim={active !== "s"}
    />
  </>
);

// 話者の一言を出す字幕帯(2キャラの頭の上あたり)
const CaptionBar: React.FC<{ text: string; speaker: "q" | "s"; opacity: number }> = ({ text, speaker, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 60,
      right: 60,
      bottom: CAPTION_BOTTOM,
      minHeight: 96,
      background: NAVY,
      borderRadius: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px 34px",
      opacity,
      border: `4px solid ${speaker === "q" ? RED : TEAL}`,
    }}
  >
    <span style={{ fontFamily: MARU, fontWeight: 700, fontSize: 40, color: "#fff", lineHeight: 1.35, textAlign: "center" }}>
      {text}
    </span>
  </div>
);

const FADE_FRAMES = 8;

// 図解でないただの掛け合い。中央に大きな一言(マーカー可)。
const TalkCard: React.FC<{ text: string; speaker: "q" | "s"; pop: number }> = ({ text, speaker, pop }) => {
  const s = Math.min(1, Math.max(0, pop));
  return (
    <div style={{ position: "absolute", top: 380, left: 80, width: 920, textAlign: "center", opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>
      <div style={{ fontSize: 96, marginBottom: 24 }}>{speaker === "q" ? "❓" : "💡"}</div>
      <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 66, lineHeight: 1.5, color: INK }}>
        <Highlight text={text} />
      </div>
    </div>
  );
};

const SLIDE_TOP = 220;

const SlideTitle: React.FC<{ text: string; pop: number }> = ({ text, pop }) => {
  const s = Math.min(1, Math.max(0, pop));
  return (
    <div
      style={{
        position: "absolute",
        top: SLIDE_TOP,
        left: 60,
        width: 960,
        textAlign: "center",
        opacity: s,
        transform: `translateY(${(1 - s) * 14}px)`,
        fontFamily: MARU,
        fontWeight: 900,
        fontSize: 58,
        lineHeight: 1.3,
        color: INK,
      }}
    >
      <Highlight text={text} />
    </div>
  );
};

// フロー図(参考の縦つなぎピル)。process。
const ProcessGraphic: React.FC<{ g: ReelGraphic; pop: number }> = ({ g, pop }) => {
  const items = (g.items || []).slice(0, 5);
  return (
    <>
      <SlideTitle text={g.title} pop={pop} />
      <div style={{ position: "absolute", top: SLIDE_TOP + 150, left: 0, width: 1080, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {items.map((it, i) => {
          const step = spring({ frame: pop * 90 - i * 9, fps: FPS, config: { damping: 15, stiffness: 150 } });
          const o = Math.min(1, Math.max(0, step));
          return (
            <React.Fragment key={i}>
              {i > 0 ? (
                <svg width="44" height="34" viewBox="0 0 44 34" style={{ opacity: o, margin: "2px 0" }}>
                  <polygon points="22,30 4,6 40,6" fill={TEAL} />
                </svg>
              ) : null}
              <div
                style={{
                  opacity: o,
                  transform: `translateY(${(1 - o) * 18}px)`,
                  width: 860,
                  background: "#fff",
                  border: `5px solid ${TEAL}`,
                  borderRadius: 999,
                  padding: "26px 36px",
                  textAlign: "center",
                  boxShadow: "0 5px 0 rgba(15,151,176,0.18)",
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
    </>
  );
};

// 番号ステップ(01/02/03 + 絵文字)。stairs。
const STEP_EMOJI = ["🏦", "💰", "📈", "✅"];
const STEP_COLORS = [BLUE, TEAL, GREEN, RED];
const StairsGraphic: React.FC<{ g: ReelGraphic; pop: number }> = ({ g, pop }) => {
  const items = (g.items || []).slice(0, 4);
  const nums = ["01", "02", "03", "04"];
  return (
    <>
      <SlideTitle text={g.title} pop={pop} />
      <div style={{ position: "absolute", top: SLIDE_TOP + 150, left: 70, width: 940 }}>
        {items.map((it, i) => {
          const step = spring({ frame: pop * 90 - i * 10, fps: FPS, config: { damping: 15, stiffness: 150 } });
          const o = Math.min(1, Math.max(0, step));
          const c = STEP_COLORS[i % STEP_COLORS.length];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                marginBottom: 22,
                opacity: o,
                transform: `translateX(${(1 - o) * -24}px)`,
              }}
            >
              <div style={{ minWidth: 96, height: 96, borderRadius: 16, background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MARU, fontWeight: 900, fontSize: 46, color: "#fff" }}>
                {nums[i]}
              </div>
              <div style={{ flex: 1, background: "#fff", border: `4px solid ${c}`, borderRadius: 16, padding: "18px 26px" }}>
                <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 40, color: INK, lineHeight: 1.3 }}>
                  <Highlight text={it.t} />
                </div>
                {it.s ? <div style={{ fontFamily: MARU, fontSize: 28, color: "#667", marginTop: 4 }}>{it.s}</div> : null}
              </div>
              <div style={{ fontSize: 66, width: 90, textAlign: "center" }}>{STEP_EMOJI[i % STEP_EMOJI.length]}</div>
            </div>
          );
        })}
        {g.goal ? (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span style={{ display: "inline-block", background: RED, color: "#fff", fontFamily: MARU, fontWeight: 900, fontSize: 38, borderRadius: 999, padding: "14px 40px" }}>
              {g.goal}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
};

// 数字のビフォーアフター棒グラフ。databadge。
const DataBadgeGraphic: React.FC<{ g: ReelGraphic; pop: number }> = ({ g, pop }) => {
  const from = g.from || { v: "" };
  const to = g.to || { v: "" };
  const grow = Math.min(1, Math.max(0, pop));
  return (
    <>
      <SlideTitle text={g.title} pop={pop} />
      <div style={{ position: "absolute", top: SLIDE_TOP + 200, left: 0, width: 1080, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 110, height: 460 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 46, color: "#667", marginBottom: 12 }}>{from.v}</div>
          <div style={{ width: 180, height: 170 * grow, background: "#b7c0cc", borderRadius: "12px 12px 0 0" }} />
          {from.label ? <div style={{ fontFamily: MARU, fontSize: 30, color: "#667", marginTop: 12 }}>{from.label}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 56, color: RED, marginBottom: 12 }}>{to.v}</div>
          <div style={{ width: 180, height: 340 * grow, background: RED, borderRadius: "12px 12px 0 0" }} />
          {to.label ? <div style={{ fontFamily: MARU, fontSize: 30, color: "#667", marginTop: 12 }}>{to.label}</div> : null}
        </div>
      </div>
      {g.badge ? (
        <div
          style={{
            position: "absolute",
            top: SLIDE_TOP + 170,
            right: 100,
            opacity: Math.min(1, Math.max(0, spring({ frame: pop * 90 - 20, fps: FPS, config: { damping: 12, stiffness: 200 } }))),
            transform: "rotate(-10deg)",
            background: MARK,
            fontFamily: MARU,
            fontWeight: 900,
            fontSize: 36,
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
    </>
  );
};

const SegmentFrame: React.FC<{
  durationInFrames: number;
  audio: string;
  speaker: "q" | "s";
  caption: string;
  children: React.ReactNode;
}> = ({ durationInFrames, audio, speaker, caption, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: PAPER }}>
      {audio ? <Audio src={staticFile(audio)} /> : null}
      {children}
      <CaptionBar text={caption} speaker={speaker} opacity={Math.min(1, opacity * 1.2)} />
      <CharacterStage audio={audio} active={speaker} />
    </AbsoluteFill>
  );
};

const BeatView: React.FC<{ beat: ReelBeat; durationInFrames: number }> = ({ beat, durationInFrames }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const pop = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  return (
    <SegmentFrame durationInFrames={durationInFrames} audio={beat.audio} speaker={beat.speaker} caption={beat.text}>
      <TalkCard text={beat.text} speaker={beat.speaker} pop={pop} />
    </SegmentFrame>
  );
};

const GraphicView: React.FC<{ graphic: ReelGraphic; durationInFrames: number }> = ({ graphic, durationInFrames }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 90, mass: 0.8 } });
  const speaker = graphic.speaker || "s";
  return (
    <SegmentFrame durationInFrames={durationInFrames} audio={graphic.audio || ""} speaker={speaker} caption={graphic.comment || graphic.title}>
      {graphic.type === "process" ? <ProcessGraphic g={graphic} pop={pop} /> : null}
      {graphic.type === "stairs" ? <StairsGraphic g={graphic} pop={pop} /> : null}
      {graphic.type === "databadge" ? <DataBadgeGraphic g={graphic} pop={pop} /> : null}
    </SegmentFrame>
  );
};

export const TaidanReel: React.FC<Props> = ({ beats, footer, graphics, hook }) => {
  let startFrame = 0;
  const items: React.ReactNode[] = [];
  beats.forEach((beat, i) => {
    const durationInFrames = Math.round(beat.durationInSeconds * FPS);
    const from = startFrame;
    startFrame += durationInFrames;
    items.push(
      <Sequence key={`b${i}`} from={from} durationInFrames={durationInFrames}>
        <BeatView beat={beat} durationInFrames={durationInFrames} />
      </Sequence>
    );
    (graphics || []).filter((g) => g.insertAfter === i).forEach((g, gi) => {
      const gDur = Math.round((g.durationInSeconds || 3.2) * FPS);
      items.push(
        <Sequence key={`g${i}-${gi}`} from={startFrame} durationInFrames={gDur}>
          <GraphicView graphic={g} durationInFrames={gDur} />
        </Sequence>
      );
      startFrame += gDur;
    });
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Audio src={staticFile("bgm.mp3")} loop volume={0.1} />
      {items}
      {hook ? <TopBanner text={hook} /> : null}
      {footer ? (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            width: 1080,
            textAlign: "center",
            fontFamily: MARU,
            fontWeight: 700,
            fontSize: 22,
            color: "#aab",
          }}
        >
          {footer}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
