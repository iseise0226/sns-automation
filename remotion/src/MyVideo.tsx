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

const STAGGER_FRAMES = 14;

const CHUNK_ICONS = ["💡", "✅", "📈", "❤️"];

// テキスト中の数字部分（連続する数字）だけを黄色マーカー風にハイライトする
function renderHighlighted(text: string) {
  const parts = text.split(/(\d+)/);
  return parts.map((part, idx) =>
    /^\d+$/.test(part) ? (
      <span
        key={idx}
        style={{
          background: "#FFEB3B",
          color: "#111",
          padding: "0 8px",
          borderRadius: 8,
          margin: "0 2px",
        }}
      >
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

// 中央に文字の塊を上から順に積み上げ、塊ごとに時間差でポップ表示する
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
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      <AbsoluteFill
        style={{
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 26,
          padding: "0 60px",
        }}
      >
        {chunks.map((chunk, i) => {
          const startAt = 6 + i * STAGGER_FRAMES;
          const localOpacity = interpolate(frame, [startAt, startAt + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const translateY = interpolate(frame, [startAt, startAt + 14], [46, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // ふわっと拡大して少し戻る（ポップ感）
          const scale = interpolate(
            frame,
            [startAt, startAt + 11, startAt + 18],
            [0.7, 1.06, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={i}
              style={{
                opacity: localOpacity,
                transform: `translateY(${translateY}px) scale(${scale})`,
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: "rgba(15,15,18,0.78)",
                borderRadius: 22,
                padding: "20px 30px",
                maxWidth: "100%",
                boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
                borderLeft: "6px solid #FFEB3B",
              }}
            >
              <div style={{ fontSize: 44, flexShrink: 0 }}>{CHUNK_ICONS[i]}</div>
              <div
                style={{
                  color: "white",
                  fontSize: 42,
                  fontWeight: "bold",
                  lineHeight: 1.5,
                  fontFamily: "'Noto Sans CJK JP', 'Noto Sans JP', sans-serif",
                  textAlign: "left",
                }}
              >
                {renderHighlighted(chunk)}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
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
