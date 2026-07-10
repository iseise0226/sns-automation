import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadMarker } from "@remotion/google-fonts/YuseiMagic";
import { loadFont as loadGothic } from "@remotion/google-fonts/ZenKakuGothicNew";

const { fontFamily: MARKER } = loadMarker();
const { fontFamily: GOTHIC } = loadGothic();

const INK = "#2b2b2b";
const PAPER = "#fbf8f1";
const ACCENTS = ["#d9482b", "#e08a1e", "#3a8f4a", "#2e6fb0"]; // 赤・橙・緑・青を順番に使う
const GREEN = "#3a8f4a";

// 1ビート = 画面に追加される要素1つ + その間のナレーション字幕
export type Beat = {
  kind: "bubble" | "box" | "big" | "check" | "cross"; // 吹き出し/番号ボックス/中央大文字/✓/×
  text: string; // 画面テキスト（**強調**・\n可）
  sub: string; // 字幕（ナレーションの該当部分）
};

export type Scene = {
  type: "points" | "stock" | "title" | "cta";
  layout?: "stack" | "row" | "compare" | "panels"; // pointsの並べ方: 縦積み / 横並び(→) / 対比(≠) / パネルが左から順に増える
  separator?: string; // row/compareの区切り記号（既定: row=→ compare=≠）
  title?: string;
  kicker?: string;
  beats: Beat[];
  audio?: string;
  video?: string; // stockシーン用の実写動画(public相対)
  se?: string;
  ctaUrl?: string; // ctaシーン用のURL表示
  durationInSeconds: number;
};

export type RichSlideVideoProps = {
  scenes: Scene[];
  bgm?: string;
  footer?: string;
};

const renderMarked = (text: string, accent: string, keyPrefix: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={`${keyPrefix}-${i}`} style={{ color: accent, fontWeight: 700 }}>
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

const MultiLine: React.FC<{ text: string; accent: string; keyPrefix: string }> = ({
  text,
  accent,
  keyPrefix,
}) => (
  <>
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderMarked(line, accent, `${keyPrefix}-l${i}`)}</div>
    ))}
  </>
);

// ビートの開始フレームを字幕の文字数比で割り出す
const beatStartFrames = (beats: Beat[], durationInFrames: number) => {
  const total = beats.reduce((a, b) => a + Math.max(b.sub.length, 1), 0);
  const starts: number[] = [];
  let acc = 0;
  for (const b of beats) {
    starts.push(Math.round((acc / total) * durationInFrames));
    acc += Math.max(b.sub.length, 1);
  }
  return starts;
};

const SubtitleBand: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (frame >= starts[i]) idx = i;
  const opacity = interpolate(frame - starts[idx], [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 110,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 60px",
      }}
    >
      <span
        style={{
          fontFamily: GOTHIC,
          fontSize: 42,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.04em",
          opacity,
          textAlign: "center",
        }}
      >
        {beats[idx]?.sub}
      </span>
    </div>
  );
};

// マーカー（番号・✓・×）
const Marker: React.FC<{ beat: Beat; index: number; accent: string }> = ({ beat, index, accent }) => {
  const symbol = beat.kind === "check" ? "✓" : beat.kind === "cross" ? "×" : `${index + 1}`;
  const color = beat.kind === "check" ? GREEN : beat.kind === "cross" ? ACCENTS[0] : accent;
  return (
    <div
      style={{
        minWidth: 64,
        height: 64,
        borderRadius: "50%",
        border: `4px solid ${color}`,
        color,
        fontFamily: MARKER,
        fontSize: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
      }}
    >
      {symbol}
    </div>
  );
};

// 縦積み用の1要素
const StackItem: React.FC<{ beat: Beat; index: number; startAt: number }> = ({
  beat,
  index,
  startAt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  if (frame < startAt) return null;

  if (beat.kind === "big") {
    return (
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 76,
          color: INK,
          textAlign: "center",
          lineHeight: 1.6,
          margin: "30px 0",
          opacity: Math.min(1, s * 1.3),
          transform: `scale(${0.9 + s * 0.1})`,
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`big${index}`} />
      </div>
    );
  }

  const isBubble = beat.kind === "bubble";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26,
        margin: "20px 0",
        opacity: Math.min(1, s * 1.3),
        transform: `translateY(${(1 - s) * 30}px) scale(${0.94 + s * 0.06})`,
      }}
    >
      <Marker beat={beat} index={index} accent={accent} />
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 50,
          lineHeight: 1.5,
          color: INK,
          background: "#fff",
          border: `4px solid ${INK}`,
          borderRadius: isBubble ? 42 : 18,
          padding: "24px 42px",
          boxShadow: "6px 8px 0 rgba(0,0,0,0.08)",
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`b${index}`} />
      </div>
    </div>
  );
};

// 横並び(row)・対比(compare)用のカード
const RowItem: React.FC<{ beat: Beat; index: number; startAt: number; compact: boolean }> = ({
  beat,
  index,
  startAt,
  compact,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  return (
    <div
      style={{
        opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
        transform: `translateY(${(1 - s) * 30}px) scale(${0.94 + s * 0.06})`,
        fontFamily: MARKER,
        fontSize: compact ? 42 : 54,
        lineHeight: 1.55,
        color: INK,
        background: "#fff",
        border: `5px solid ${accent}`,
        borderRadius: 24,
        padding: compact ? "30px 36px" : "44px 52px",
        boxShadow: "6px 8px 0 rgba(0,0,0,0.08)",
        textAlign: "center",
        maxWidth: compact ? 460 : 620,
      }}
    >
      <MultiLine text={beat.text} accent={accent} keyPrefix={`r${index}`} />
    </div>
  );
};

// パネル(panels)用: UIウィンドウ風カードが左から順にポンと現れる
const PanelItem: React.FC<{ beat: Beat; index: number; startAt: number; total: number }> = ({
  beat,
  index,
  startAt,
  total,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });
  const width = total >= 4 ? 340 : total === 3 ? 420 : 520;
  return (
    <div
      style={{
        opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
        transform: `translateX(${(1 - s) * -60}px) scale(${0.85 + s * 0.15})`,
        width,
        background: "#fff",
        border: `4px solid ${INK}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "6px 8px 0 rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          background: `${accent}22`,
          borderBottom: `3px solid ${INK}`,
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: accent }} />
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${accent}88` }} />
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${accent}44` }} />
      </div>
      <div
        style={{
          padding: "36px 26px",
          minHeight: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MARKER,
          fontSize: total >= 4 ? 32 : 38,
          lineHeight: 1.5,
          color: INK,
          textAlign: "center",
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`p${index}`} />
      </div>
    </div>
  );
};

const PointsScene: React.FC<{ scene: Scene; starts: number[] }> = ({ scene, starts }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [1, 1.012]);
  const titleOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const layout = scene.layout || "stack";
  const separator = scene.separator || (layout === "compare" ? "≠" : "→");

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill
        style={{ transform: `scale(${drift})`, padding: "70px 130px 130px", alignItems: "center" }}
      >
        {scene.title ? (
          <div
            style={{
              fontFamily: MARKER,
              fontSize: 60,
              color: INK,
              opacity: titleOp,
              borderBottom: `6px solid ${ACCENTS[0]}55`,
              paddingBottom: 8,
              marginBottom: 24,
            }}
          >
            {renderMarked(scene.title, ACCENTS[0], "t")}
          </div>
        ) : null}
        {layout === "stack" ? (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
            {scene.beats.map((b, i) => (
              <StackItem key={i} beat={b} index={i} startAt={starts[i]} />
            ))}
          </div>
        ) : layout === "panels" ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 28,
              flex: 1,
            }}
          >
            {scene.beats.map((b, i) => (
              <PanelItem key={i} beat={b} index={i} startAt={starts[i]} total={scene.beats.length} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 36,
              flex: 1,
            }}
          >
            {scene.beats.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 ? (
                  <div
                    style={{
                      fontFamily: MARKER,
                      fontSize: layout === "compare" ? 110 : 72,
                      color: ACCENTS[1],
                      opacity: frame >= starts[i] ? 1 : 0,
                    }}
                  >
                    {separator}
                  </div>
                ) : null}
                <RowItem beat={b} index={i} startAt={starts[i]} compact={scene.beats.length >= 3} />
              </React.Fragment>
            ))}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const StockScene: React.FC<{ scene: Scene; starts: number[] }> = ({ scene, starts }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scene.video ? (
        <OffthreadVideo
          src={staticFile(scene.video)}
          muted
          loop
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.45)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 160px 110px" }}>
        {scene.beats.map((b, i) => {
          if (frame < starts[i]) return null;
          const op = interpolate(frame - starts[i], [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: MARKER,
                fontSize: 72,
                color: "#fff",
                textAlign: "center",
                lineHeight: 1.7,
                textShadow: "0 4px 24px rgba(0,0,0,0.8)",
                opacity: op,
                margin: "14px 0",
              }}
            >
              <MultiLine text={b.text} accent="#ffd75e" keyPrefix={`s${i}`} />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TitleScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 200, stiffness: 100 } });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, justifyContent: "center", alignItems: "center" }}>
      {scene.kicker ? (
        <div
          style={{
            fontFamily: GOTHIC,
            fontSize: 32,
            letterSpacing: "0.35em",
            color: ACCENTS[1],
            fontWeight: 700,
            marginBottom: 36,
            opacity: s,
          }}
        >
          {scene.kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 104,
          color: INK,
          textAlign: "center",
          lineHeight: 1.6,
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px)`,
        }}
      >
        <MultiLine text={scene.beats[0]?.text || scene.title || ""} accent={ACCENTS[0]} keyPrefix="ti" />
      </div>
    </AbsoluteFill>
  );
};

// LP誘導用のCTAシーン
const CtaScene: React.FC<{ scene: Scene; starts: number[] }> = ({ scene, starts }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const urlAt = starts[starts.length - 1] + 20;
  const s = spring({ frame: frame - urlAt, fps, config: { damping: 12, stiffness: 150, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 140px 150px" }}>
        {scene.beats.map((b, i) => {
          if (frame < starts[i]) return null;
          const op = interpolate(frame - starts[i], [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: MARKER,
                fontSize: 68,
                color: INK,
                textAlign: "center",
                lineHeight: 1.7,
                opacity: op,
                margin: "14px 0",
              }}
            >
              <MultiLine text={b.text} accent={ACCENTS[0]} keyPrefix={`c${i}`} />
            </div>
          );
        })}
        {scene.ctaUrl && frame >= urlAt ? (
          <div
            style={{
              marginTop: 46,
              opacity: Math.min(1, s * 1.3),
              transform: `scale(${0.9 + s * 0.1})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                fontFamily: GOTHIC,
                fontSize: 40,
                fontWeight: 700,
                color: "#fff",
                background: GREEN,
                borderRadius: 60,
                padding: "26px 70px",
                boxShadow: "6px 8px 0 rgba(0,0,0,0.12)",
              }}
            >
              ▼ 概要欄のリンクから
            </div>
            <div style={{ fontFamily: GOTHIC, fontSize: 30, color: INK, opacity: 0.7 }}>
              {scene.ctaUrl}
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{ scene: Scene; footer: string }> = ({ scene, footer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const starts = beatStartFrames(scene.beats, durationInFrames);
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {scene.type === "points" ? <PointsScene scene={scene} starts={starts} /> : null}
      {scene.type === "stock" ? <StockScene scene={scene} starts={starts} /> : null}
      {scene.type === "title" ? <TitleScene scene={scene} /> : null}
      {scene.type === "cta" ? <CtaScene scene={scene} starts={starts} /> : null}
      {scene.type !== "title" ? <SubtitleBand beats={scene.beats} starts={starts} /> : null}
      <div
        style={{
          position: "absolute",
          right: 40,
          top: 28,
          fontFamily: GOTHIC,
          fontSize: 26,
          color: scene.type === "stock" ? "rgba(255,255,255,0.75)" : "rgba(43,43,43,0.55)",
          letterSpacing: "0.1em",
        }}
      >
        {footer}
      </div>
    </AbsoluteFill>
  );
};

export const RichSlideVideo: React.FC<RichSlideVideoProps> = ({
  scenes,
  bgm,
  footer = "伊勢 聖",
}) => {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {bgm ? <Audio src={staticFile(bgm)} loop volume={0.07} /> : null}
      {scenes.map((scene, i) => {
        const dur = Math.round(scene.durationInSeconds * fps);
        const seq = (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
            {scene.se ? <Audio src={staticFile(scene.se)} volume={0.15} /> : null}
            <SceneView scene={scene} footer={footer} />
          </Sequence>
        );
        from += dur;
        return seq;
      })}
    </AbsoluteFill>
  );
};
