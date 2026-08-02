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

type Props = {
  beats: ReelBeat[];
  footer?: string;
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

const NameTag: React.FC<{ speaker: "q" | "s"; opacity: number }> = ({ speaker, opacity }) => (
  <div
    style={{
      position: "absolute",
      top: 130,
      left: speaker === "q" ? 90 : 630,
      opacity,
      background: speaker === "q" ? "#a86e1a" : NAVY,
      color: "#fff",
      fontFamily: MARU,
      fontWeight: 900,
      fontSize: 30,
      padding: "8px 26px",
      borderRadius: 12,
    }}
  >
    {speaker === "q" ? "あかり" : "いせ先生"}
  </div>
);

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

      <NameTag speaker={beat.speaker} opacity={Math.min(1, pop * 1.3)} />
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

export const TaidanReel: React.FC<Props> = ({ beats, footer }) => {
  let startFrame = 0;
  const items = beats.map((beat, i) => {
    const durationInFrames = Math.round(beat.durationInSeconds * FPS);
    const from = startFrame;
    startFrame += durationInFrames;
    return (
      <Sequence key={i} from={from} durationInFrames={durationInFrames}>
        <BeatView beat={beat} durationInFrames={durationInFrames} />
      </Sequence>
    );
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
