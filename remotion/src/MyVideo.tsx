import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";
import { ChibiOverlay, ChibiPose } from "./ChibiOverlay";
import { LineIcon } from "./LineIcons";

// YouTube(RichSlideVideo.tsx)と同じデザイン言語に統一(2026-07-25)。
// 白背景=線画アイコンの図解3種(flow3/iconsteps/reject)、実写=4秒のcut、で交互に見せる。
const { fontFamily: MARU } = loadMaru();

const INK = "#1a1a1a";
const PAPER = "#ffffff";
const DARK = "#2b2b2b";
const RED = "#d92b2b";
const RED_TEXT = "#c62222";
const NAVY = "#16202e";
const YELLOW_MARK = "#ffe94d";
const YELLOW_SOLID = "#ffe500";

const FPS = 30;

export type Point = { text: string; icon?: string; note?: string };

export type Scene = {
  type: "diagram" | "cut";
  layout?: "flow3" | "iconsteps" | "reject"; // diagram型のみ
  title?: string; // diagram型の大見出し(**強調**可)
  points?: Point[]; // diagram型の中身
  headline?: string; // cut型の大きな一文(**強調**可)
  narration: string; // 字幕バーの文言(=音声原稿)
  video?: string; // cut型の実写(public相対)
  audio: string;
  durationInSeconds: number;
  pose?: string;
  se?: string;
};

type Props = {
  scenes: Scene[];
  chibi?: boolean;
};

// ---- テキスト装飾ヘルパー ----

const renderMarked = (text: string, keyPrefix: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={`${keyPrefix}-${i}`} style={{ color: RED_TEXT, fontWeight: 900 }}>
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

const MultiLine: React.FC<{ text: string; keyPrefix: string }> = ({ text, keyPrefix }) => (
  <>
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderMarked(line, `${keyPrefix}-l${i}`)}</div>
    ))}
  </>
);

// 白背景の大見出し。**強調**の裏に黄色ベタ塗りが左から伸びる
const renderHeadline = (text: string, keyPrefix: string, grow: number) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={`${keyPrefix}-${i}`} style={{ position: "relative", display: "inline-block" }}>
        <span
          style={{
            position: "absolute",
            left: "-0.09em",
            right: "-0.09em",
            top: "0.06em",
            bottom: "0.04em",
            background: YELLOW_SOLID,
            transformOrigin: "left center",
            transform: `scaleX(${grow})`,
          }}
        />
        <span style={{ position: "relative" }}>{p.slice(2, -2)}</span>
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

const Headline: React.FC<{ text: string; opacity: number; grow: number }> = ({ text, opacity, grow }) => (
  <div
    style={{
      fontFamily: MARU,
      fontWeight: 900,
      fontSize: 82,
      lineHeight: 1.35,
      color: INK,
      textAlign: "center",
      opacity,
      transform: `translateY(${(1 - opacity) * -16}px)`,
      marginBottom: 56,
    }}
  >
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderHeadline(line, `hd-l${i}`, grow)}</div>
    ))}
  </div>
);

// 実写など暗い背景での**強調**は黄色のベタ塗り＋黒文字
const renderMarkedSolid = (text: string, keyPrefix: string, pop: number) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span
        key={`${keyPrefix}-${i}`}
        style={{
          display: "inline-block",
          background: YELLOW_SOLID,
          color: "#1a1a1a",
          padding: "0 0.12em",
          borderRadius: 10,
          transform: `scale(${pop})`,
        }}
      >
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

// グレーの細い矢印(縦置き。図解の段と段をつなぐ)
const FlowArrowDown: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg width="40" height="64" viewBox="0 0 40 64" fill="none" style={{ opacity, flexShrink: 0 }}>
    <path
      d="M20 8v40M9 38l11 14 11-14"
      stroke="#8a8a8a"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FlowArrowRight: React.FC<{ opacity: number; size?: number }> = ({ opacity, size = 56 }) => (
  <svg width={size} height="28" viewBox="0 0 56 28" fill="none" style={{ opacity, flexShrink: 0 }}>
    <path
      d="M4 14h40M36 5l10 9-10 9"
      stroke="#8a8a8a"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ---- 図解レイアウト(縦長のリール向けに縦積みへ調整) ----

// flow3: 縦に3段。見出し/線画アイコン/補足を積み、下矢印でつなぐ
const FlowColumn: React.FC<{ points: Point[]; frame: number; fps: number }> = ({ points, frame, fps }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
    {points.map((p, i) => {
      const startAt = 10 + i * 20;
      const s = spring({ frame: frame - startAt, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
      const op = frame < startAt ? 0 : Math.min(1, s * 1.3);
      return (
        <React.Fragment key={i}>
          {i > 0 ? <FlowArrowDown opacity={frame >= startAt ? 1 : 0} /> : null}
          <div
            style={{
              opacity: op,
              transform: `translateY(${(1 - s) * 22}px)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "6px 0",
            }}
          >
            <div
              style={{
                fontFamily: MARU,
                fontWeight: 700,
                fontSize: 53,
                lineHeight: 1.4,
                color: INK,
                textAlign: "center",
                maxWidth: 860,
              }}
            >
              <MultiLine text={p.text} keyPrefix={`fl${i}`} />
            </div>
            <div style={{ margin: "12px 0" }}>
              <LineIcon name={p.icon} size={104} />
            </div>
            {p.note ? (
              <div
                style={{
                  fontFamily: MARU,
                  fontWeight: 700,
                  fontSize: 44,
                  lineHeight: 1.4,
                  color: INK,
                  textAlign: "center",
                  maxWidth: 820,
                }}
              >
                <MultiLine text={p.note} keyPrefix={`fn${i}`} />
              </div>
            ) : null}
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

// iconsteps: 丸で囲んだアイコンを横並びで矢印でつなぐ(3〜4個なら1080幅でも収まる)
const IconStepsRow: React.FC<{ points: Point[]; frame: number; fps: number }> = ({ points, frame, fps }) => {
  const r = points.length >= 4 ? 62 : 74;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "center", rowGap: 40 }}>
      {points.map((p, i) => {
        const startAt = 10 + i * 16;
        const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 165, mass: 0.6 } });
        const op = frame < startAt ? 0 : Math.min(1, s * 1.3);
        return (
          <React.Fragment key={i}>
            {i > 0 ? (
              <div style={{ paddingTop: r - 14 }}>
                <FlowArrowRight opacity={frame >= startAt ? 1 : 0} size={40} />
              </div>
            ) : null}
            <div
              style={{
                width: r * 2 + 28,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                opacity: op,
                transform: `scale(${0.75 + s * 0.25})`,
              }}
            >
              <div
                style={{
                  width: r * 2,
                  height: r * 2,
                  borderRadius: "50%",
                  border: `3px solid ${DARK}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LineIcon name={p.icon} size={r} />
              </div>
              <div
                style={{
                  marginTop: 18,
                  fontFamily: MARU,
                  fontWeight: 700,
                  fontSize: 42,
                  lineHeight: 1.4,
                  color: INK,
                  textAlign: "center",
                }}
              >
                <MultiLine text={p.text} keyPrefix={`is${i}`} />
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// reject: 縦長に合わせ、上=これではないもの(赤い×)、下=本当に伝えたいこと
const RejectColumn: React.FC<{ points: Point[]; frame: number; fps: number }> = ({ points, frame, fps }) => {
  const top = points[0];
  const bottom = points[1];
  const sT = spring({ frame, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  const xDraw = interpolate(frame, [12, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const startB = 34;
  const sB = spring({ frame: frame - startB, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  const grow = interpolate(frame - startB, [6, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      {top ? (
        <div
          style={{
            opacity: Math.min(1, sT * 1.3),
            transform: `translateY(${(1 - sT) * -24}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              border: `3px solid ${DARK}`,
              borderRadius: 16,
              padding: "22px 30px",
              fontFamily: MARU,
              fontWeight: 700,
              fontSize: 51,
              lineHeight: 1.45,
              color: INK,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            <MultiLine text={top.text} keyPrefix="rjt" />
          </div>
          <div style={{ position: "relative", margin: "36px 0 16px" }}>
            <LineIcon name={top.icon} size={150} />
            <svg width="182" height="182" viewBox="0 0 182 182" fill="none" style={{ position: "absolute", left: -16, top: -16 }}>
              <path
                d="M22 22L160 160M160 22L22 160"
                stroke={RED}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="196"
                strokeDashoffset={196 * (1 - xDraw)}
              />
            </svg>
          </div>
          {top.note ? (
            <div style={{ fontFamily: MARU, fontWeight: 700, fontSize: 42, color: INK, textAlign: "center" }}>
              <MultiLine text={top.note} keyPrefix="rjn" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ width: "70%", height: 3, background: "#c9c9c9", margin: "40px 0" }} />

      {bottom ? (
        <div
          style={{
            opacity: frame < startB ? 0 : Math.min(1, sB * 1.3),
            transform: `translateY(${(1 - sB) * 30}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          {bottom.icon ? <LineIcon name={bottom.icon} size={110} /> : null}
          <div
            style={{
              fontFamily: MARU,
              fontWeight: 900,
              fontSize: 62,
              lineHeight: 1.45,
              color: INK,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            {bottom.text.split("\n").map((line, j) => (
              <div key={j}>{renderHeadline(line, `rr-${j}`, grow)}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ---- 字幕バー(ネイビー・画面下) ----

const CaptionBar: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 48,
      bottom: 90,
      width: 984,
      minHeight: 130,
      background: NAVY,
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px 44px",
      opacity,
    }}
  >
    <span
      style={{
        fontFamily: MARU,
        fontSize: 48,
        fontWeight: 700,
        color: "#ffffff",
        lineHeight: 1.4,
        textAlign: "center",
      }}
    >
      {text}
    </span>
  </div>
);

// ---- 実写ハイライトカット(cut) ----

const CutSceneView: React.FC<{ scene: Scene; frame: number; fps: number; subOpacity: number }> = ({
  scene,
  frame,
  fps,
  subOpacity,
}) => {
  const zoom = interpolate(frame, [0, 999], [1, 1.08], { extrapolateRight: "clamp" });
  const textS = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  const popScale = spring({ frame: frame - 14, fps, config: { damping: 10, stiffness: 200, mass: 0.5 } });
  const lines = (scene.headline || "").split("\n");
  return (
    <>
      {scene.video ? (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", transform: `scale(${zoom})` }}>
          <OffthreadVideo
            src={staticFile(scene.video)}
            muted
            loop
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      ) : null}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,14,20,0.86) 0%, rgba(10,14,20,0.5) 32%, rgba(10,14,20,0.5) 62%, rgba(10,14,20,0.92) 100%)",
        }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px 200px" }}>
        <div
          style={{
            opacity: Math.min(1, textS * 1.3),
            transform: `translateY(${(1 - textS) * 24}px)`,
            textAlign: "center",
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: MARU,
                fontWeight: 900,
                fontSize: 66,
                lineHeight: 1.5,
                color: "#fff",
                textShadow: "0 6px 26px rgba(0,0,0,0.8)",
              }}
            >
              {renderMarkedSolid(line, `cut${i}`, popScale)}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <CaptionBar text={scene.narration} opacity={subOpacity} />
    </>
  );
};

// ---- 図解シーン(diagram) ----

const DiagramSceneView: React.FC<{ scene: Scene; frame: number; fps: number; subOpacity: number }> = ({
  scene,
  frame,
  fps,
  subOpacity,
}) => {
  const points = (scene.points || []).slice(0, 4);
  const titleOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const grow = interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // 実写をゆっくり寄せながら流す(白ベールの下で動きだけが伝わる)
  // ぼかしの端が透けて白フチにならないよう、最初から画面より少し大きく敷いてゆっくり寄せる
  const zoom = interpolate(frame, [0, 999], [1.08, 1.18], { extrapolateRight: "clamp" });
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: PAPER }} />
      {scene.video ? (
        <>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", transform: `scale(${zoom})` }}>
            <OffthreadVideo
              src={staticFile(scene.video)}
              muted
              loop
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(3px)" }}
            />
          </div>
          {/* 線画アイコンと黒文字を読ませるための白ベール。実写は「動く紙」くらいの存在感にする */}
          <AbsoluteFill style={{ backgroundColor: "rgba(255,255,255,0.7)" }} />
        </>
      ) : null}
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", padding: "120px 70px 280px", justifyContent: "center" }}>
        {scene.title ? <Headline text={scene.title} opacity={titleOp} grow={grow} /> : null}
        {scene.layout === "iconsteps" ? (
          <IconStepsRow points={points} frame={frame} fps={fps} />
        ) : scene.layout === "reject" ? (
          <RejectColumn points={points} frame={frame} fps={fps} />
        ) : (
          <FlowColumn points={points} frame={frame} fps={fps} />
        )}
      </AbsoluteFill>
      <CaptionBar text={scene.narration} opacity={subOpacity} />
    </>
  );
};

// ---- シーン共通ラッパー(フェード・音声・ちびキャラ) ----

const FADE_FRAMES = 8;

const SceneView: React.FC<{ scene: Scene; durationInFrames: number; chibi?: boolean }> = ({
  scene,
  durationInFrames,
  chibi,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const subOpacity = interpolate(frame, [10, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: scene.type === "cut" ? "#000" : PAPER }}>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      {scene.se ? <Audio src={staticFile(`se/${scene.se}.mp3`)} volume={0.55} /> : null}

      {scene.type === "cut" ? (
        <CutSceneView scene={scene} frame={frame} fps={fps} subOpacity={subOpacity} />
      ) : (
        <DiagramSceneView scene={scene} frame={frame} fps={fps} subOpacity={subOpacity} />
      )}

      {chibi && scene.audio ? <ChibiOverlay audioSrc={scene.audio} pose={scene.pose as ChibiPose | undefined} /> : null}
    </AbsoluteFill>
  );
};

export const MyVideo: React.FC<Props> = ({ scenes, chibi }) => {
  let startFrame = 0;
  const items = scenes.map((scene, i) => {
    const durationInFrames = Math.round(scene.durationInSeconds * FPS);
    const from = startFrame;
    startFrame += durationInFrames;
    return (
      <Sequence key={i} from={from} durationInFrames={durationInFrames}>
        <SceneView scene={scene} durationInFrames={durationInFrames} chibi={chibi} />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Audio src={staticFile("bgm.mp3")} loop volume={0.12} />
      {items}
    </AbsoluteFill>
  );
};
