import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadMincho } from "@remotion/google-fonts/ShipporiMinchoB1";
import { loadFont as loadGothic } from "@remotion/google-fonts/ZenKakuGothicNew";

const { fontFamily: MINCHO } = loadMincho();
const { fontFamily: GOTHIC } = loadGothic();

const INK = "#101418";
const GOLD = "#c8a45d";
const PAPER = "#f5f1e8";

export type Slide = {
  type: "title" | "bullets" | "quote";
  kicker?: string;
  title: string; // 改行は \n
  bullets?: string[]; // **強調** で金下線
  page?: string; // "03 / 10" など
  durationInSeconds: number;
};

export type SlideVideoProps = {
  slides: Slide[];
  audio?: string; // ナレーション音声(絶対パス or URL)。無ければ無音
  footer?: string;
};

// **強調** を金下線付きに変換
const renderMarked = (text: string, keyPrefix: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <span
          key={`${keyPrefix}-${i}`}
          style={{
            fontWeight: 700,
            borderBottom: `6px solid ${GOLD}73`,
            paddingBottom: 2,
          }}
        >
          {p.slice(2, -2)}
        </span>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{p}</span>;
  });
};

// 上下の墨ライン＋紙背景（ごく薄い光のドリフトで「生きている」感じにする）
const PaperFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const driftX = interpolate(frame, [0, durationInFrames], [46, 54]);
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at ${driftX}% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%)`,
        }}
      />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12, background: INK }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 12, background: INK }} />
      {children}
    </AbsoluteFill>
  );
};

const Footer: React.FC<{ footer: string; page?: string; appearAt: number }> = ({
  footer,
  page,
  appearAt,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [appearAt, appearAt + 12], [0, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        right: 140,
        bottom: 64,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: GOTHIC,
        fontSize: 28,
        letterSpacing: "0.12em",
        color: INK,
        opacity,
      }}
    >
      <span>{footer}</span>
      {page ? (
        <span style={{ fontFamily: MINCHO, fontSize: 34, color: GOLD, opacity: 1 }}>{page}</span>
      ) : null}
    </div>
  );
};

// 見出し行：1行ずつ下からスッと入る
const TitleLines: React.FC<{ title: string; fontSize: number; startAt: number }> = ({
  title,
  fontSize,
  startAt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = title.split("\n");
  return (
    <h1
      style={{
        fontFamily: MINCHO,
        fontSize,
        fontWeight: 800,
        lineHeight: 1.5,
        letterSpacing: "0.04em",
        color: INK,
        margin: 0,
      }}
    >
      {lines.map((line, i) => {
        const s = spring({
          frame: frame - startAt - i * 10,
          fps,
          config: { damping: 200, stiffness: 120 },
        });
        return (
          <div
            key={i}
            style={{
              opacity: s,
              transform: `translateY(${(1 - s) * 46}px)`,
            }}
          >
            {renderMarked(line, `t${i}`)}
          </div>
        );
      })}
    </h1>
  );
};

// 金ライン：左から描かれる
const GoldLine: React.FC<{ startAt: number; width?: number }> = ({ startAt, width = 110 }) => {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [startAt, startAt + 18], [0, width], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ width: w, height: 5, background: GOLD, margin: "44px 0 56px" }} />;
};

// 箇条書き：1つずつ順番に現れる
const Bullets: React.FC<{ bullets: string[]; startAt: number; gapFrames: number }> = ({
  bullets,
  startAt,
  gapFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {bullets.map((b, i) => {
        const appear = startAt + i * gapFrames;
        const s = spring({
          frame: frame - appear,
          fps,
          config: { damping: 16, stiffness: 130, mass: 0.7 },
        });
        const squarePop = spring({
          frame: frame - appear + 4,
          fps,
          config: { damping: 10, stiffness: 200 },
        });
        return (
          <li
            key={i}
            style={{
              fontFamily: GOTHIC,
              fontSize: 46,
              lineHeight: 2.05,
              fontWeight: 500,
              color: INK,
              paddingLeft: 64,
              position: "relative",
              opacity: Math.min(1, s * 1.2),
              transform: `translateX(${(1 - s) * -36}px)`,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 10,
                top: 40,
                width: 18,
                height: 18,
                background: GOLD,
                transform: `scale(${squarePop})`,
              }}
            />
            {renderMarked(b, `b${i}`)}
          </li>
        );
      })}
    </ul>
  );
};

const SlideView: React.FC<{ slide: Slide; footer: string }> = ({ slide, footer }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // スライド全体：入りはふわっと、終わりは静かにフェード
  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  // 止まって見えないように、ごくゆっくり寄る
  const drift = interpolate(frame, [0, durationInFrames], [1, 1.015]);

  const kickerOpacity = interpolate(frame, [4, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (slide.type === "quote") {
    const s = spring({ frame: frame - 8, fps, config: { damping: 200, stiffness: 90 } });
    return (
      <PaperFrame>
        <AbsoluteFill
          style={{
            opacity: fadeIn * fadeOut,
            transform: `scale(${drift})`,
            justifyContent: "center",
            alignItems: "center",
            padding: "0 180px",
          }}
        >
          <GoldLine startAt={6} width={90} />
          <div
            style={{
              fontFamily: MINCHO,
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.7,
              letterSpacing: "0.06em",
              color: INK,
              textAlign: "center",
              opacity: s,
              transform: `scale(${0.96 + s * 0.04})`,
              whiteSpace: "pre-wrap",
            }}
          >
            {renderMarked(slide.title, "q")}
          </div>
          <GoldLine startAt={14} width={90} />
        </AbsoluteFill>
        <Footer footer={footer} page={slide.page} appearAt={16} />
      </PaperFrame>
    );
  }

  return (
    <PaperFrame>
      <AbsoluteFill
        style={{
          opacity: fadeIn * fadeOut,
          transform: `scale(${drift})`,
          padding: "110px 140px",
        }}
      >
        {slide.kicker ? (
          <div
            style={{
              fontFamily: GOTHIC,
              fontSize: 30,
              letterSpacing: "0.35em",
              color: GOLD,
              fontWeight: 700,
              marginBottom: 28,
              opacity: kickerOpacity,
            }}
          >
            {slide.kicker}
          </div>
        ) : null}
        <TitleLines
          title={slide.title}
          fontSize={slide.type === "title" ? 100 : 82}
          startAt={10}
        />
        <GoldLine startAt={26} />
        {slide.type === "bullets" && slide.bullets ? (
          <Bullets bullets={slide.bullets} startAt={40} gapFrames={22} />
        ) : null}
      </AbsoluteFill>
      <Footer footer={footer} page={slide.page} appearAt={20} />
    </PaperFrame>
  );
};

export const SlideVideo: React.FC<SlideVideoProps> = ({
  slides,
  audio,
  footer = "心の土台を、整える。｜伊勢 聖",
}) => {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {audio ? <Audio src={audio} /> : null}
      {slides.map((slide, i) => {
        const dur = Math.round(slide.durationInSeconds * fps);
        const seq = (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <SlideView slide={slide} footer={footer} />
          </Sequence>
        );
        from += dur;
        return seq;
      })}
    </AbsoluteFill>
  );
};
