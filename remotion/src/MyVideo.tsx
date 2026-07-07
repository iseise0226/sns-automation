import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/MPLUSRounded1c";

// 丸ゴシック（YouTubeテロップ定番のM PLUS Rounded 1c）
const { fontFamily: maruGothic } = loadFont("normal", { weights: ["500", "800"] });

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
  const { fps } = useVideoConfig();
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
          gap: 30,
          padding: "0 56px",
        }}
      >
        {chunks.map((chunk, i) => {
          const startAt = 6 + i * STAGGER_FRAMES;
          const t = frame - startAt;
          // バネで飛び込む（左右交互）。overshootで「ポンッ」と跳ねて着地する
          const s = spring({
            frame: t,
            fps,
            config: { damping: 11, stiffness: 160, mass: 0.8 },
          });
          const dir = i % 2 === 0 ? -1 : 1;
          const translateX = (1 - s) * dir * 240;
          const rotate = (1 - s) * dir * 8;
          const scale = 0.3 + s * 0.7;
          const localOpacity = interpolate(t, [0, 6], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // 着地後はゆっくり上下に浮遊し続ける
          const floatY = t > 18 ? Math.sin((frame + i * 23) / 14) * 6 : 0;
          return (
            <div
              key={i}
              style={{
                opacity: localOpacity,
                transform: `translateX(${translateX}px) translateY(${floatY}px) rotate(${rotate}deg) scale(${scale})`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                background: "rgba(15,15,18,0.8)",
                borderRadius: 24,
                padding: "22px 34px",
                maxWidth: "100%",
                boxShadow: "0 12px 34px rgba(0,0,0,0.5)",
                borderBottom: "6px solid #FFEB3B",
              }}
            >
              <div style={{ fontSize: 46 }}>{CHUNK_ICONS[i]}</div>
              <div
                style={{
                  color: "white",
                  fontSize: 44,
                  fontWeight: 800,
                  lineHeight: 1.5,
                  fontFamily: `'${maruGothic}', 'Noto Sans CJK JP', sans-serif`,
                  textAlign: "center",
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
            fontFamily: `'${maruGothic}', 'Noto Sans CJK JP', sans-serif`,
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
