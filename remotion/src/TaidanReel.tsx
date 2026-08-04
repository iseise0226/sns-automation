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
// 先生役(聖さん・satoshi_chibi・右)と質問役(あかり・akari_chibi・左)が交互に話す短い掛け合い。
// YouTube版(HyperFrames)と違い、実際の音声波形で口パクするAudioデータ解析を使う(ChibiOverlay)。

const { fontFamily: MARU } = loadMaru();

const INK = "#1a1a1a";
const PAPER = "#ffffff";
const NAVY = "#16202e";
const RED = "#d92b2b";

const FPS = 30;

export type ReelBeat = {
  speaker: "q" | "s"; // q=質問役(あかり) / s=先生(聖さん)
  text: string; // 画面に大きく出す＆読み上げる文
  audio: string; // publicルート相対のwavパス
  durationInSeconds: number;
};

// YouTube版(HyperFrames)の階段/工程図/データ図解をリール(縦)向けに簡略移植したもの。
// 台本生成側がbeatsの合間に差し込む位置(insertAfter=そのbeatの直後)を指定する。
export type ReelGraphic = {
  type: "stairs" | "process" | "databadge";
  title: string;
  insertAfter: number; // このindexのbeatが終わった直後に挿入
  durationInSeconds?: number;
  items?: { t: string; s?: string }[]; // stairs: {t,s} / process: {t}
  goal?: string; // stairsの到達点ラベル
  from?: { v: string; label?: string }; // databadge
  to?: { v: string; label?: string };
  badge?: string;
};

type Props = {
  beats: ReelBeat[];
  footer?: string;
  graphic?: ReelGraphic;
};

const QuoteCard: React.FC<{ text: string; opacity: number; pop: number }> = ({ text, opacity, pop }) => {
  const lines = text.split("\n");
  return (
    <div
      style={{
        position: "absolute",
        top: 210,
        left: 60,
        width: 960,
        opacity,
        transform: `translateY(${(1 - pop) * 18}px)`,
        textAlign: "center",
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: MARU,
            fontWeight: 900,
            fontSize: 60,
            lineHeight: 1.5,
            color: INK,
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

const CaptionBar: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 48,
      bottom: 130,
      width: 984,
      minHeight: 120,
      background: NAVY,
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "18px 40px",
      opacity,
    }}
  >
    <span
      style={{
        fontFamily: MARU,
        fontSize: 40,
        fontWeight: 700,
        color: "#ffffff",
        lineHeight: 1.4,
        textAlign: "center",
      }}
    >
      {text}
    </span>
  </div>
);

const FADE_FRAMES = 8;

const BeatView: React.FC<{ beat: ReelBeat; durationInFrames: number }> = ({ beat, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const pop = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });

  const qActive = beat.speaker === "q";

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: PAPER }}>
      <Audio src={staticFile(beat.audio)} />

      <QuoteCard text={beat.text} opacity={Math.min(1, pop * 1.3)} pop={pop} />

      {/* 質問役(あかり・左)。話していない時は少し暗く小さく */}
      <ChibiOverlay
        audioSrc={beat.audio}
        assetDir="akari_chibi"
        side="left"
        size={520}
        bottom={330}
        hasHalf={false}
        dim={!qActive}
        pose={qActive ? "default" : "default"}
      />
      {/* 先生役(聖さん・右) */}
      <ChibiOverlay
        audioSrc={beat.audio}
        assetDir="satoshi_chibi"
        side="right"
        size={560}
        bottom={330}
        hasHalf
        dim={qActive}
        pose={qActive ? "arms_crossed" : "default"}
      />

      <CaptionBar text={beat.text} opacity={Math.min(1, pop * 1.3)} />
    </AbsoluteFill>
  );
};

const GraphicTitle: React.FC<{ text: string; opacity: number; y: number }> = ({ text, opacity, y }) => (
  <div
    style={{
      position: "absolute",
      top: 130,
      left: 60,
      width: 960,
      textAlign: "center",
      opacity,
      transform: `translateY(${y}px)`,
      fontFamily: MARU,
      fontWeight: 900,
      fontSize: 52,
      color: INK,
    }}
  >
    {text}
  </div>
);

const BLUE = "#1a5fd9";
const GREEN = "#1f9e5a";

const StairsGraphic: React.FC<{ g: ReelGraphic; pop: number }> = ({ g, pop }) => {
  const items = (g.items || []).slice(0, 3);
  return (
    <>
      <GraphicTitle text={g.title} opacity={Math.min(1, pop * 1.3)} y={(1 - pop) * 16} />
      <div style={{ position: "absolute", top: 320, left: 90, width: 900 }}>
        {items.map((it, i) => {
          const step = spring({ frame: pop * 90 - i * 8, fps: FPS, config: { damping: 14, stiffness: 160 } });
          return (
            <div
              key={i}
              style={{
                marginLeft: i * 60,
                marginBottom: 26,
                opacity: Math.min(1, Math.max(0, step)),
                transform: `translateY(${(1 - Math.min(1, Math.max(0, step))) * 20}px)`,
                background: PAPER,
                border: `4px solid ${NAVY}`,
                borderRadius: 14,
                padding: "18px 26px",
                boxShadow: "0 6px 0 rgba(0,0,0,0.12)",
              }}
            >
              <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 38, color: INK }}>{it.t}</div>
              {it.s ? <div style={{ fontFamily: MARU, fontSize: 26, color: "#666", marginTop: 4 }}>{it.s}</div> : null}
            </div>
          );
        })}
        {g.goal ? (
          <div
            style={{
              marginLeft: items.length * 60 + 40,
              marginTop: 10,
              display: "inline-block",
              background: RED,
              color: "#fff",
              fontFamily: MARU,
              fontWeight: 900,
              fontSize: 34,
              borderRadius: 999,
              padding: "12px 32px",
            }}
          >
            {g.goal}
          </div>
        ) : null}
      </div>
    </>
  );
};

const ProcessGraphic: React.FC<{ g: ReelGraphic; pop: number }> = ({ g, pop }) => {
  const items = (g.items || []).slice(0, 4);
  const accents = [BLUE, INK, GREEN, RED];
  return (
    <>
      <GraphicTitle text={g.title} opacity={Math.min(1, pop * 1.3)} y={(1 - pop) * 16} />
      <div style={{ position: "absolute", top: 340, left: 0, width: 1080, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {items.map((it, i) => {
          const step = spring({ frame: pop * 90 - i * 10, fps: FPS, config: { damping: 14, stiffness: 160 } });
          const o = Math.min(1, Math.max(0, step));
          return (
            <React.Fragment key={i}>
              {i > 0 ? (
                <div style={{ fontSize: 48, color: INK, opacity: o, lineHeight: 1 }}>↓</div>
              ) : null}
              <div
                style={{
                  opacity: o,
                  transform: `translateY(${(1 - o) * 20}px)`,
                  width: 780,
                  background: PAPER,
                  border: `5px solid ${accents[i % accents.length]}`,
                  borderRadius: 18,
                  padding: "22px 30px",
                  textAlign: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 40, color: INK }}>{it.t}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
};

const DataBadgeGraphic: React.FC<{ g: ReelGraphic; pop: number }> = ({ g, pop }) => {
  const from = g.from || { v: "" };
  const to = g.to || { v: "" };
  const barGrow = Math.min(1, Math.max(0, pop));
  return (
    <>
      <GraphicTitle text={g.title} opacity={Math.min(1, pop * 1.3)} y={(1 - pop) * 16} />
      <div style={{ position: "absolute", top: 340, left: 0, width: 1080, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 90, height: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 40, color: "#666", marginBottom: 10 }}>{from.v}</div>
          <div style={{ width: 160, height: 150 * barGrow, background: "#b7b7b7", borderRadius: "10px 10px 0 0", transformOrigin: "bottom" }} />
          {from.label ? <div style={{ fontFamily: MARU, fontSize: 26, color: "#666", marginTop: 10 }}>{from.label}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: MARU, fontWeight: 900, fontSize: 48, color: RED, marginBottom: 10 }}>{to.v}</div>
          <div style={{ width: 160, height: 300 * barGrow, background: RED, borderRadius: "10px 10px 0 0", transformOrigin: "bottom" }} />
          {to.label ? <div style={{ fontFamily: MARU, fontSize: 26, color: "#666", marginTop: 10 }}>{to.label}</div> : null}
        </div>
      </div>
      {g.badge ? (
        <div
          style={{
            position: "absolute",
            top: 300,
            right: 90,
            opacity: Math.min(1, Math.max(0, spring({ frame: pop * 90 - 20, fps: FPS, config: { damping: 12, stiffness: 200 } }))),
            transform: "rotate(-10deg)",
            background: "#ffe500",
            fontFamily: MARU,
            fontWeight: 900,
            fontSize: 30,
            color: RED,
            borderRadius: "50%",
            width: 170,
            height: 170,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 10,
          }}
        >
          {g.badge}
        </div>
      ) : null}
    </>
  );
};

const GraphicView: React.FC<{ graphic: ReelGraphic; durationInFrames: number }> = ({ graphic, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 90, mass: 0.8 } });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: PAPER }}>
      {graphic.type === "stairs" ? <StairsGraphic g={graphic} pop={pop} /> : null}
      {graphic.type === "process" ? <ProcessGraphic g={graphic} pop={pop} /> : null}
      {graphic.type === "databadge" ? <DataBadgeGraphic g={graphic} pop={pop} /> : null}
    </AbsoluteFill>
  );
};

export const TaidanReel: React.FC<Props> = ({ beats, footer, graphic }) => {
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
    if (graphic && graphic.insertAfter === i) {
      const gDur = Math.round((graphic.durationInSeconds || 4) * FPS);
      items.push(
        <Sequence key="graphic" from={startFrame} durationInFrames={gDur}>
          <GraphicView graphic={graphic} durationInFrames={gDur} />
        </Sequence>
      );
      startFrame += gDur;
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Audio src={staticFile("bgm.mp3")} loop volume={0.1} />
      {items}
      {footer ? (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 0,
            width: 1080,
            textAlign: "center",
            fontFamily: MARU,
            fontWeight: 700,
            fontSize: 24,
            color: "#888",
          }}
        >
          {footer}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
