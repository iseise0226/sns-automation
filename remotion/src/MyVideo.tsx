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
  type?: "image" | "video";
  image: string;
  audio: string;
  narration: string;
  durationInSeconds: number;
};

type Props = {
  scenes: Scene[];
};

const FPS = 30;
const FADE_FRAMES = 15;

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
        <SceneView scene={scene} durationInFrames={durationInFrames} />
      </Sequence>
    );
  });

  return <AbsoluteFill style={{ backgroundColor: "black" }}>{items}</AbsoluteFill>;
};
