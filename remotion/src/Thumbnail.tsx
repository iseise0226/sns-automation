import React from "react";
import { AbsoluteFill } from "remotion";
import { loadFont as loadMarker } from "@remotion/google-fonts/YuseiMagic";
import { loadFont as loadGothic } from "@remotion/google-fonts/ZenKakuGothicNew";

const { fontFamily: MARKER } = loadMarker();
const { fontFamily: GOTHIC } = loadGothic();

const INK = "#2b2b2b";
const PAPER = "#fbf8f1";
const ACCENTS = ["#d9482b", "#e08a1e", "#3a8f4a", "#2e6fb0"];

export type ThumbnailProps = {
  kicker?: string; // 左上の小さいタグ(例: "算命学" "コーギー")
  text: string; // メインコピー。改行\n・**強調**(色帯下線)対応
  footer?: string; // 右下のブランド名
  accentIndex?: number; // 強調色の選択(0-3)
};

const renderMarked = (text: string, accent: string, keyPrefix: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span
        key={`${keyPrefix}-${i}`}
        style={{
          color: accent,
          background: `${accent}20`,
          borderBottom: `16px solid ${accent}`,
          padding: "0 6px",
        }}
      >
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

export const Thumbnail: React.FC<ThumbnailProps> = ({
  kicker,
  text,
  footer = "伊勢 聖",
  accentIndex = 0,
}) => {
  const accent = ACCENTS[accentIndex % ACCENTS.length];
  const lines = text.split("\n");
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: INK }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 26, background: INK }} />

      {kicker ? (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 60,
            fontFamily: GOTHIC,
            fontWeight: 700,
            fontSize: 44,
            color: "#fff",
            background: accent,
            borderRadius: 12,
            padding: "12px 34px",
            letterSpacing: "0.08em",
          }}
        >
          {kicker}
        </div>
      ) : null}

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "0 90px",
        }}
      >
        <div
          style={{
            fontFamily: MARKER,
            fontWeight: 800,
            fontSize: lines.length >= 3 ? 118 : 148,
            lineHeight: 1.28,
            color: INK,
            textAlign: "center",
            textShadow: "3px 3px 0 #fff, -3px 3px 0 #fff, 3px -3px 0 #fff, -3px -3px 0 #fff",
          }}
        >
          {lines.map((line, i) => (
            <div key={i}>{renderMarked(line, accent, `l${i}`)}</div>
          ))}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 40,
          right: 60,
          fontFamily: GOTHIC,
          fontSize: 30,
          fontWeight: 700,
          color: "rgba(43,43,43,0.6)",
          letterSpacing: "0.08em",
        }}
      >
        {footer}
      </div>
    </AbsoluteFill>
  );
};
