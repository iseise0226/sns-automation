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
const FADE_FRAMES = 8;
const STAGGER_FRAMES = 12;

// 塊の文字数に応じてフォントサイズを決める（短い言葉ほどドンと大きく）
function chunkFontSize(len: number) {
  if (len <= 6) return 72;
  if (len <= 10) return 62;
  if (len <= 14) return 54;
  return 46;
}

// 数字はテロップの強調色（黄色）で塗る
function renderColored(text: string) {
  const parts = text.split(/(\d+)/);
  return parts.map((part, idx) =>
    /^\d+$/.test(part) ? (
      <span key={idx} style={{ color: "#FFE94A" }}>
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

// 黒フチ付きテロップ文字。下層に太いストロークだけの文字、上層に本文を重ねて
// （-webkit-text-strokeが本文を食い潰さないように）縁取りを作る
const StrokedText: React.FC<{ text: string; fontSize: number }> = ({ text, fontSize }) => {
  const base: React.CSSProperties = {
    fontSize,
    fontWeight: 800,
    lineHeight: 1.35,
    fontFamily: `'${maruGothic}', 'Noto Sans CJK JP', sans-serif`,
    textAlign: "center",
    whiteSpace: "pre-wrap",
  };
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          ...base,
          position: "absolute",
          inset: 0,
          color: "black",
          WebkitTextStroke: `${Math.max(10, fontSize * 0.22)}px black`,
        }}
        aria-hidden
      >
        {text}
      </div>
      <div style={{ ...base, position: "relative", color: "white" }}>{renderColored(text)}</div>
    </div>
  );
};

// 全シーン共通ビュー: 実写B-roll（ゆっくりズーム）+ 中央に塊テロップが
// バネで左右交互に飛び込んでくる（YouTubeショート風）
const SceneView: React.FC<{ scene: Scene; durationInFrames: number }> = ({
  scene,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 実写にゆっくり寄っていくKen Burns風ズームで映像側にも動きを出す
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateRight: "clamp",
  });

  const chunks = (scene.textChunks && scene.textChunks.length > 0
    ? scene.textChunks
    : [scene.narration]
  )
    .filter(Boolean)
    .slice(0, 4);

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "black" }}>
      <div style={{ width: "100%", height: "100%", transform: `scale(${zoom})` }}>
        {scene.type === "video" ? (
          <OffthreadVideo
            src={staticFile(scene.image)}
            muted
            loop
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Img
            src={staticFile(scene.image)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.22)" }} />
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      <AbsoluteFill
        style={{
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
          padding: "0 48px",
        }}
      >
        {chunks.map((chunk, i) => {
          const startAt = 4 + i * STAGGER_FRAMES;
          const t = frame - startAt;
          // バネで飛び込む（左右交互）。overshootで「ポンッ」と跳ねて着地する
          const s = spring({
            frame: t,
            fps,
            config: { damping: 10, stiffness: 170, mass: 0.7 },
          });
          const dir = i % 2 === 0 ? -1 : 1;
          const translateX = (1 - s) * dir * 260;
          const rotate = (1 - s) * dir * 10;
          const scale = 0.2 + s * 0.8;
          const localOpacity = interpolate(t, [0, 5], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // 着地後はゆっくり上下に浮遊し続ける
          const floatY = t > 16 ? Math.sin((frame + i * 23) / 13) * 5 : 0;
          return (
            <div
              key={i}
              style={{
                opacity: localOpacity,
                transform: `translateX(${translateX}px) translateY(${floatY}px) rotate(${rotate}deg) scale(${scale})`,
              }}
            >
              <StrokedText text={chunk} fontSize={chunkFontSize(chunk.length)} />
            </div>
          );
        })}
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
        <SceneView scene={scene} durationInFrames={durationInFrames} />
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
