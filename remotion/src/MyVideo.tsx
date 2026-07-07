import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { loadFont as loadYusei } from "@remotion/google-fonts/YuseiMagic";
import { loadFont as loadMaru } from "@remotion/google-fonts/MPLUSRounded1c";

// 手描きマーカー風フォント（見出し用）と丸ゴシック（字幕用）
const { fontFamily: yuseiMagic } = loadYusei("normal", { weights: ["400"] });
const { fontFamily: maruGothic } = loadMaru("normal", { weights: ["500", "800"] });

type Scene = {
  headline: string;
  narration: string;
  points?: string[];
  audio: string;
  durationInSeconds: number;
};

type Props = {
  scenes: Scene[];
};

const FPS = 30;
const FADE_FRAMES = 8;

const INK = "#232A3B";
const PAPER = "#FAF7F0";
const MARKER_YELLOW = "#F7DE5A";
// シーンごとに巡回するアクセント色（丸数字バッジなど）
const ACCENTS = ["#E8722C", "#3E7CB1", "#4C9A5F", "#D0544B"];

function headlineFontSize(len: number, hasPoints: boolean) {
  // 要点リストがあるカードは見出しを少し控えめにしてスペースを空ける
  const scale = hasPoints ? 0.82 : 1;
  if (len <= 6) return Math.round(96 * scale);
  if (len <= 10) return Math.round(80 * scale);
  if (len <= 14) return Math.round(66 * scale);
  return Math.round(56 * scale);
}

// 数字だけ黄色マーカーで塗る（手描き解説の強調表現）
function renderMarked(text: string) {
  const parts = text.split(/(\d+)/);
  return parts.map((part, idx) =>
    /^\d+$/.test(part) ? (
      <span
        key={idx}
        style={{
          background: `linear-gradient(transparent 35%, ${MARKER_YELLOW} 35%)`,
          padding: "0 4px",
        }}
      >
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

// 手描き風のヨレた枠線（CSSのborder-radiusトリック）
const sketchBorder: React.CSSProperties = {
  border: `5px solid ${INK}`,
  borderRadius: "255px 25px 225px 25px / 25px 225px 25px 255px",
};

const SceneView: React.FC<{
  scene: Scene;
  durationInFrames: number;
  index: number;
  total: number;
}> = ({ scene, durationInFrames, index, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const accent = ACCENTS[index % ACCENTS.length];
  const points = (scene.points || []).slice(0, 3);

  // カードがバネでポンッと現れる
  const cardS = spring({ frame: frame - 3, fps, config: { damping: 11, stiffness: 150, mass: 0.8 } });
  const cardScale = 0.55 + cardS * 0.45;
  const cardRotate = (1 - cardS) * -4;
  // バッジ（丸数字）はカードの後に遅れてポンッ
  const badgeS = spring({ frame: frame - 12, fps, config: { damping: 9, stiffness: 200, mass: 0.6 } });
  // 黄色マーカーの下線が左から右へスッと引かれる
  const underlineW = interpolate(frame, [16, 30], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // 着地後はゆっくり浮遊
  const floatY = frame > 20 ? Math.sin(frame / 14) * 5 : 0;
  // 字幕はカードの後にフェードイン
  const subOpacity = interpolate(frame, [10, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // 背景の水彩ブロブはゆっくり息をする
  const blobScale = 1 + Math.sin(frame / 40) * 0.04;

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: PAPER }}>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}

      {/* 黄色い水彩ブロブ（カードの後ろにふんわり） */}
      <div
        style={{
          position: "absolute",
          top: "26%",
          left: "8%",
          width: "84%",
          height: "38%",
          borderRadius: "48% 52% 55% 45% / 55% 48% 52% 45%",
          background: `radial-gradient(ellipse at center, ${MARKER_YELLOW}55 0%, ${MARKER_YELLOW}22 60%, transparent 75%)`,
          transform: `scale(${blobScale}) rotate(-3deg)`,
        }}
      />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 70px" }}>
        <div
          style={{
            ...sketchBorder,
            position: "relative",
            background: "#FFFFFF",
            width: "100%",
            padding: "90px 56px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 34,
            transform: `scale(${cardScale}) rotate(${cardRotate}deg) translateY(${floatY}px)`,
            boxShadow: "6px 8px 0 rgba(35,42,59,0.12)",
          }}
        >
          {/* シーン種別の飾り: 1枚目=テーマ札 / 中間=丸数字 / ラスト=まとめ札 */}
          {isFirst || isLast ? (
            <div
              style={{
                transform: `scale(${badgeS})`,
                fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
                fontSize: 40,
                color: "#FFFFFF",
                background: isLast ? accent : INK,
                padding: "10px 38px",
                borderRadius: "120px 16px 120px 16px / 16px 120px 16px 120px",
              }}
            >
              {isFirst ? "きょうのテーマ" : "まとめ"}
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${badgeS})`,
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: accent,
                color: "#FFFFFF",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontFamily: `'${yuseiMagic}', sans-serif`,
                fontSize: 52,
                boxShadow: "3px 4px 0 rgba(35,42,59,0.18)",
              }}
            >
              {index}
            </div>
          )}

          <div
            style={{
              fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
              fontSize: headlineFontSize(scene.headline.length, points.length > 0),
              color: INK,
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            {renderMarked(scene.headline)}
          </div>

          {/* 黄色マーカーの下線 */}
          <div
            style={{
              width: `${underlineW}%`,
              maxWidth: 460,
              height: 20,
              background: MARKER_YELLOW,
              borderRadius: "40px 12px 40px 12px / 12px 40px 12px 40px",
              transform: "rotate(-1deg)",
            }}
          />

          {/* 要点リスト: チェック付きの行が1つずつ左からスッと入ってくる */}
          {points.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%", marginTop: 6 }}>
              {points.map((point, i) => {
                const rowS = spring({
                  frame: frame - (22 + i * 10),
                  fps,
                  config: { damping: 12, stiffness: 160, mass: 0.7 },
                });
                return (
                  <div
                    key={i}
                    style={{
                      opacity: rowS,
                      transform: `translateX(${(1 - rowS) * -80}px)`,
                      display: "flex",
                      alignItems: "center",
                      gap: 20,
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        border: `4px solid ${accent}`,
                        color: accent,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: 30,
                        fontFamily: `'${yuseiMagic}', sans-serif`,
                        background: "#FFFFFF",
                      }}
                    >
                      ✓
                    </div>
                    <div
                      style={{
                        fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
                        fontSize: 42,
                        color: INK,
                        lineHeight: 1.4,
                        textAlign: "left",
                        borderBottom: `3px dashed ${INK}33`,
                        paddingBottom: 6,
                        flexGrow: 1,
                      }}
                    >
                      {renderMarked(point)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* 下部字幕（黒帯・ナレーション全文） */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 130 }}>
        <div
          style={{
            opacity: subOpacity,
            maxWidth: "90%",
            background: "rgba(22,24,30,0.82)",
            color: "#FFFFFF",
            fontFamily: `'${maruGothic}', 'Noto Sans CJK JP', sans-serif`,
            fontWeight: 500,
            fontSize: 40,
            lineHeight: 1.5,
            textAlign: "center",
            padding: "18px 34px",
            borderRadius: 16,
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
        <SceneView scene={scene} durationInFrames={durationInFrames} index={i} total={scenes.length} />
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
