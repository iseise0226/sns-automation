import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// 「上に固定タイトル+1場面2〜3行の話+英訳」のトーク型リール(ise_sato_kosodate, 2026-10-22〜サンプル)
// 素材は3秒なので、長い場面はゆっくり再生して長さを合わせる
// 参考: issei_english「この3つで、人生うまくいく」。約束→3つ→結果→締め。場面の長さはナレーションに合わせて可変
const { fontFamily: MARU } = loadMaru();
const { fontFamily: EN } = loadMontserrat("normal", { weights: ["600", "700"], subsets: ["latin"] });

export type TalkScene = { clip: string; lines: string[]; en?: string; tag?: string; audio?: string; seconds: number };
export type ClipTalkProps = { title: string; titleEn?: string; scenes: TalkScene[]; bgm?: string; bgmVolume?: number };

const FPS = 30;
const framesOf = (s: TalkScene) => Math.round(s.seconds * FPS);
export const clipTalkDuration = (p: ClipTalkProps) => p.scenes.reduce((a, s) => a + framesOf(s), 0);

const fit = (text: string, base: number, maxWidth: number) => Math.min(base, Math.floor(maxWidth / Math.max(1, [...text].length)));

const Scene: React.FC<{ scene: TalkScene; frames: number }> = ({ scene, frames }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const fadeOut = interpolate(frame, [frames - 6, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, frames], [1.0, 1.07]);
  const tagPop = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 12 });
  const enIn = interpolate(frame, [8 + scene.lines.length * 7, 18 + scene.lines.length * 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo src={staticFile(scene.clip)} muted playbackRate={Math.min(1, 2.9 / scene.seconds)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.46)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fadeOut, paddingTop: 120 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          {scene.tag ? (
            <div
              style={{
                fontFamily: MARU,
                fontWeight: 900,
                fontSize: 54,
                color: "#1a1a1a",
                background: "#FFD54A",
                padding: "6px 30px",
                borderRadius: 999,
                marginBottom: 18,
                transform: `scale(${interpolate(tagPop, [0, 1], [0.6, 1])})`,
                opacity: tagPop,
              }}
            >
              {scene.tag}
            </div>
          ) : null}
          {scene.lines.map((l, i) => {
            const t = interpolate(frame, [i * 7, i * 7 + 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div
                key={i}
                style={{
                  fontFamily: MARU,
                  fontWeight: 900,
                  fontSize: fit(l, 92, width - 140),
                  lineHeight: 1.25,
                  color: "#fff",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.02em",
                  textShadow: "0 0 18px rgba(0,0,0,0.8), 0 4px 10px rgba(0,0,0,0.6)",
                  opacity: t,
                  transform: `translateY(${interpolate(t, [0, 1], [26, 0])}px)`,
                }}
              >
                {l}
              </div>
            );
          })}
          {scene.en ? (
            <div
              style={{
                marginTop: 26,
                maxWidth: width - 160,
                fontFamily: EN,
                fontWeight: 600,
                fontSize: 44,
                lineHeight: 1.3,
                textAlign: "center",
                color: "rgba(255,255,255,0.9)",
                textShadow: "0 0 14px rgba(0,0,0,0.85), 0 3px 8px rgba(0,0,0,0.6)",
                opacity: enIn,
              }}
            >
              {scene.en}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
    </AbsoluteFill>
  );
};

const TitleBar: React.FC<{ title: string; titleEn?: string }> = ({ title, titleEn }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const inT = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 520, background: "linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.55) 60%, rgba(0,0,0,0))" }} />
      <div style={{ position: "relative", marginTop: 230, display: "flex", flexDirection: "column", alignItems: "center", opacity: inT }}>
        <div
          style={{
            fontFamily: MARU,
            fontWeight: 900,
            fontSize: fit(title, 82, width - 120),
            color: "#fff",
            whiteSpace: "nowrap",
            borderBottom: "6px solid #FFD54A",
            paddingBottom: 8,
          }}
        >
          {title}
        </div>
        {titleEn ? <div style={{ marginTop: 14, fontFamily: EN, fontWeight: 700, fontSize: 38, color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em" }}>{titleEn}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const ClipTalk: React.FC<ClipTalkProps> = ({ title, titleEn, scenes, bgm, bgmVolume = 0.12 }) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {scenes.map((s, i) => {
        const f = framesOf(s);
        const el = (
          <Sequence key={i} from={from} durationInFrames={f}>
            <Scene scene={s} frames={f} />
          </Sequence>
        );
        from += f;
        return el;
      })}
      <TitleBar title={title} titleEn={titleEn} />
      {bgm ? <Audio src={staticFile(bgm)} volume={bgmVolume} loop /> : null}
    </AbsoluteFill>
  );
};
