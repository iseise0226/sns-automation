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
import { loadFont as loadYusei } from "@remotion/google-fonts/YuseiMagic";
import { loadFont as loadMaru } from "@remotion/google-fonts/MPLUSRounded1c";
import { ChibiOverlay, ChibiPose } from "./ChibiOverlay";

// 手描きマーカー風フォント（見出し用）と丸ゴシック（字幕用）
const { fontFamily: yuseiMagic } = loadYusei("normal", { weights: ["400"] });
const { fontFamily: maruGothic } = loadMaru("normal", { weights: ["500", "800"] });

type Scene = {
  headline: string;
  narration: string;
  points?: string[];
  video?: string;
  audio: string;
  durationInSeconds: number;
  // ちびキャラのポーズ名(ChibiOverlayのCHIBI_POSES)。"default"は口パク、それ以外は静止ポーズ
  pose?: string;
};

type Props = {
  scenes: Scene[];
  // trueのとき聖さんちびキャラのワイプ(口パク)を全シーンに重ねる。
  // アカウント設定(wf4_accounts.jsonのchibi)から渡ってくる。女性設定のsessi_lifeでは使わない。
  chibi?: boolean;
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
  chibi?: boolean;
}> = ({ scene, durationInFrames, index, total, chibi }) => {
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
  const hasVideo = Boolean(scene.video);
  // 実写背景はゆっくり寄っていく
  const videoZoom = interpolate(frame, [0, durationInFrames], [1, 1.08], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: hasVideo ? "black" : PAPER }}>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}

      {hasVideo ? (
        <>
          {/* 実写B-roll背景 + うっすら暗幕（カードを読みやすくする） */}
          <div style={{ width: "100%", height: "100%", transform: `scale(${videoZoom})` }}>
            <OffthreadVideo
              src={staticFile(scene.video!)}
              muted
              loop
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.3)" }} />
        </>
      ) : (
        /* 黄色い水彩ブロブ（カードの後ろにふんわり） */
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
      )}

      <AbsoluteFill
        style={{ flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 30, padding: "0 64px" }}
      >
        {/* 見出し札: バッジ+見出し+マーカー下線をまとめた白カード */}
        <div
          style={{
            ...sketchBorder,
            background: "#FFFFFF",
            width: "100%",
            padding: "40px 44px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            transform: `scale(${cardScale}) rotate(${cardRotate}deg) translateY(${floatY}px)`,
            boxShadow: "6px 8px 0 rgba(35,42,59,0.14)",
          }}
        >
          {/* シーン種別の飾り: 1枚目=テーマ札 / 中間=丸数字 / ラスト=まとめ札 */}
          {isFirst || isLast ? (
            <div
              style={{
                transform: `scale(${badgeS})`,
                fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
                fontSize: 36,
                color: "#FFFFFF",
                background: isLast ? accent : INK,
                padding: "8px 34px",
                borderRadius: "120px 16px 120px 16px / 16px 120px 16px 120px",
              }}
            >
              {isFirst ? "きょうのテーマ" : "まとめ"}
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${badgeS})`,
                width: 78,
                height: 78,
                borderRadius: "50%",
                background: accent,
                color: "#FFFFFF",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontFamily: `'${yuseiMagic}', sans-serif`,
                fontSize: 44,
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
              height: 18,
              background: MARKER_YELLOW,
              borderRadius: "40px 12px 40px 12px / 12px 40px 12px 40px",
              transform: "rotate(-1deg)",
            }}
          />
        </div>

        {/* ミニカード3枚: 1枚ずつ左右交互にポンッと積み上がる */}
        {points.map((point, i) => {
          const cardT = frame - (18 + i * 12);
          const s = spring({ frame: cardT, fps, config: { damping: 10, stiffness: 170, mass: 0.7 } });
          const dir = i % 2 === 0 ? -1 : 1;
          const tilts = [-1.5, 1.2, -1];
          const cardFloat = cardT > 16 ? Math.sin((frame + i * 21) / 14) * 4 : 0;
          return (
            <div
              key={i}
              style={{
                ...sketchBorder,
                opacity: interpolate(cardT, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                transform: `translateX(${(1 - s) * dir * 220}px) translateY(${cardFloat}px) rotate(${tilts[i] + (1 - s) * dir * 6}deg) scale(${0.4 + s * 0.6})`,
                background: "#FFFFFF",
                width: "94%",
                padding: "26px 36px",
                display: "flex",
                alignItems: "center",
                gap: 22,
                boxShadow: "5px 6px 0 rgba(35,42,59,0.12)",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  border: `4px solid ${accent}`,
                  color: accent,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 32,
                  fontFamily: `'${yuseiMagic}', sans-serif`,
                  background: "#FFFFFF",
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
                  fontSize: 44,
                  color: INK,
                  lineHeight: 1.4,
                  textAlign: "left",
                  flexGrow: 1,
                }}
              >
                {renderMarked(point)}
              </div>
            </div>
          );
        })}
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

      {/* 聖さんちびキャラのワイプ(音声に合わせて口パク・シーンによってポーズ切り替え) */}
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
        <SceneView scene={scene} durationInFrames={durationInFrames} index={i} total={scenes.length} chibi={chibi} />
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
