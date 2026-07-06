import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
} from "remotion";

type Scene = {
  type?: "image" | "video" | "textMotion";
  image: string;
  audio: string;
  narration: string;
  textChunks?: string[];
  durationInSeconds: number;
};

type Props = {
  scenes: Scene[];
};

const FPS = 30;
const FADE_FRAMES = 15;

// 各象限ごとに「上下どちらか1辺」「左右どちらか1辺」だけを指定する（対辺を同時指定すると
// レイアウトエンジンによって幅・高さの解決がぶれるため、意図的に2辺だけに絞っている）
const QUADRANT_STYLES: React.CSSProperties[] = [
  { top: "8%", left: "6%", textAlign: "left" },
  { top: "8%", right: "6%", textAlign: "right" },
  { bottom: "8%", left: "6%", textAlign: "left" },
  { bottom: "8%", right: "6%", textAlign: "right" },
];

const STAGGER_FRAMES = 12;
const ENTRANCE_FRAMES = 18;

const QUADRANT_ICONS = ["💡", "✅", "📈", "❤️"];

// テキスト中の数字部分（連続する数字）だけを黄色マーカー風にハイライトする
function renderHighlighted(text: string) {
  const parts = text.split(/(\d+)/);
  return parts.map((part, idx) =>
    /^\d+$/.test(part) ? (
      <span
        key={idx}
        style={{
          background: "linear-gradient(transparent 55%, #FFEB3B 55%)",
          color: "#111",
          padding: "0 2px",
        }}
      >
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

const TextMotionView: React.FC<{ scene: Scene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const sceneOpacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const chunks = (scene.textChunks || []).slice(0, 4);

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity, backgroundColor: "black" }}>
      <Img
        src={staticFile(scene.image)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.35)" }} />
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      {chunks.map((chunk, i) => {
        const startAt = i * STAGGER_FRAMES;
        const localOpacity = interpolate(
          frame,
          [startAt, startAt + ENTRANCE_FRAMES],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const translateY = interpolate(
          frame,
          [startAt, startAt + ENTRANCE_FRAMES],
          [30, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const scale = interpolate(
          frame,
          [startAt, startAt + ENTRANCE_FRAMES],
          [0.85, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              maxWidth: "42%",
              ...QUADRANT_STYLES[i],
            }}
          >
            <div
              style={{
                opacity: localOpacity,
                transform: `translateY(${translateY}px) scale(${scale})`,
                display: "inline-flex",
                flexDirection: "column",
                alignItems: QUADRANT_STYLES[i].textAlign === "right" ? "flex-end" : "flex-start",
                gap: 6,
                background: "rgba(20,20,20,0.72)",
                borderRadius: 20,
                padding: "14px 18px",
                boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              }}
            >
              <div style={{ fontSize: 34 }}>{QUADRANT_ICONS[i]}</div>
              <div
                style={{
                  color: "white",
                  fontSize: 38,
                  fontWeight: "bold",
                  lineHeight: 1.4,
                  fontFamily: "'Noto Sans CJK JP', 'Noto Sans JP', sans-serif",
                  textAlign: QUADRANT_STYLES[i].textAlign,
                }}
              >
                {renderHighlighted(chunk)}
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{ scene: Scene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "black" }}>
      {scene.type === "video" ? (
        <OffthreadVideo
          src={staticFile(scene.image)}
          muted
          loop
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <Img
          src={staticFile(scene.image)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 160,
        }}
      >
        <div
          style={{
            color: "white",
            fontSize: 56,
            fontWeight: "bold",
            textAlign: "center",
            maxWidth: "85%",
            padding: "20px 30px",
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 20,
            fontFamily: "'Noto Sans CJK JP', 'Noto Sans JP', sans-serif",
            lineHeight: 1.4,
          }}
        >
          {scene.narration}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MyVideo: React.FC<Props> = ({ scenes }) => {
  let startFrame = 0;
  const items = scenes.map((scene, i) => {
    const durationInFrames = Math.round(scene.durationInSeconds * FPS);
    const from = startFrame;
    startFrame += durationInFrames;
    return (
      <Sequence key={i} from={from} durationInFrames={durationInFrames}>
        {scene.type === "textMotion" ? (
          <TextMotionView scene={scene} durationInFrames={durationInFrames} />
        ) : (
          <SceneView scene={scene} durationInFrames={durationInFrames} />
        )}
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Audio src={staticFile("bgm.mp3")} loop volume={0.12} />
      {items}
    </AbsoluteFill>
  );
};
