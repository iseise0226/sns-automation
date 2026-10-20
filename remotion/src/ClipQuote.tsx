import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";

// 3秒クリップ+中央の白い大きな字幕+ナレーションの「ひとこと」リール(ise_sato_kosodate, 2026-10-20〜)
// 1シーン=3秒の実写クリップ1本。字幕と同じ文をVOICEVOXが読み上げる。BGMは全体で1曲。
const { fontFamily: MARU } = loadMaru();

export type ClipScene = { clip: string; lines: string[]; audio?: string };
export type ClipQuoteProps = { scenes: ClipScene[]; bgm?: string; sceneSeconds?: number; bgmVolume?: number };

const W = 1080;
const fit = (text: string, base: number, maxWidth: number) => Math.min(base, Math.floor(maxWidth / Math.max(1, [...text].length)));

export const clipQuoteDuration = (p: ClipQuoteProps, fps: number) => Math.round((p.sceneSeconds ?? 3) * fps) * p.scenes.length;

const Scene: React.FC<{ scene: ClipScene; frames: number }> = ({ scene, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 180 }, durationInFrames: 14 });
  const scale = interpolate(pop, [0, 1], [0.86, 1]);
  const opacity = interpolate(frame, [0, 5, frames - 4, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, frames], [1.0, 1.06]);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo src={staticFile(scene.clip)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.38)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity, transform: `scale(${scale})` }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          {scene.lines.map((l, i) => (
            <div
              key={i}
              style={{
                fontFamily: MARU,
                fontWeight: 900,
                fontSize: fit(l, 150, W - 120),
                color: "#fff",
                whiteSpace: "nowrap",
                letterSpacing: "0.03em",
                textShadow: "0 0 18px rgba(0,0,0,0.75), 0 4px 10px rgba(0,0,0,0.6)",
                WebkitTextStroke: "2px rgba(0,0,0,0.25)",
              }}
            >
              {l}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
    </AbsoluteFill>
  );
};

export const ClipQuote: React.FC<ClipQuoteProps> = ({ scenes, bgm, sceneSeconds = 3, bgmVolume = 0.14 }) => {
  const { fps } = useVideoConfig();
  const frames = Math.round(sceneSeconds * fps);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {scenes.map((s, i) => (
        <Sequence key={i} from={i * frames} durationInFrames={frames}>
          <Scene scene={s} frames={frames} />
        </Sequence>
      ))}
      {bgm ? <Audio src={staticFile(bgm)} volume={bgmVolume} /> : null}
    </AbsoluteFill>
  );
};
