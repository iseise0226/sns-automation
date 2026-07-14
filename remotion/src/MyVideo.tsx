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
  // 要点カードの見せ方(未指定時は従来通りの縦積み)。generate-reel.js側でシーンごとにランダム割り当てされる
  layout?: "stack" | "row" | "compare" | "panels" | "timeline" | "grid" | "pyramid" | "meter";
  separator?: string; // row(→)/compare(≠)の区切り記号
  video?: string;
  audio: string;
  durationInSeconds: number;
  // ちびキャラのポーズ名(ChibiOverlayのCHIBI_POSES)。"default"は口パク、それ以外は静止ポーズ
  pose?: string;
  // ナレーション内容に台本生成側のAIが合うと判断した時だけ入る効果音ファイル名(拡張子なし)。無ければ鳴らさない
  se?: string;
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

// 要点カードの中身(番号バッジ+テキスト)。レイアウトごとにラッパーだけ変える
const PointCard: React.FC<{ point: string; index: number; accent: string; compact?: boolean }> = ({
  point,
  index,
  accent,
  compact,
}) => (
  <>
    <div
      style={{
        flexShrink: 0,
        width: compact ? 46 : 58,
        height: compact ? 46 : 58,
        borderRadius: "50%",
        border: `4px solid ${accent}`,
        color: accent,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: compact ? 26 : 32,
        fontFamily: `'${yuseiMagic}', sans-serif`,
        background: "#FFFFFF",
      }}
    >
      {index + 1}
    </div>
    <div
      style={{
        fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
        fontSize: compact ? 34 : 44,
        color: INK,
        lineHeight: 1.4,
        textAlign: "left",
        flexGrow: 1,
      }}
    >
      {renderMarked(point)}
    </div>
  </>
);

// 縦積み(既定): 1枚ずつ左右交互にポンッと積み上がる
const StackPoints: React.FC<{ points: string[]; frame: number; fps: number; accent: string }> = ({
  points,
  frame,
  fps,
  accent,
}) =>
  points.map((point, i) => {
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
        <PointCard point={point} index={i} accent={accent} />
      </div>
    );
  });

// 横並び(row)/対比(compare): カードが横に並び、区切り記号(→/≠)で繋がる
const RowPoints: React.FC<{
  points: string[];
  frame: number;
  fps: number;
  separator: string;
  big: boolean;
}> = ({ points, frame, fps, separator, big }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, width: "100%" }}>
    {points.map((point, i) => {
      const startAt = 16 + i * 14;
      const s = spring({ frame: frame - startAt, fps, config: { damping: 12, stiffness: 160, mass: 0.6 } });
      return (
        <React.Fragment key={i}>
          {i > 0 ? (
            <div
              style={{
                fontFamily: `'${yuseiMagic}', sans-serif`,
                fontSize: big ? 64 : 44,
                color: INK,
                opacity: frame >= startAt ? 1 : 0,
              }}
            >
              {separator}
            </div>
          ) : null}
          <div
            style={{
              ...sketchBorder,
              opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
              transform: `translateY(${(1 - s) * 24}px) scale(${0.85 + s * 0.15})`,
              background: "#FFFFFF",
              flex: 1,
              minWidth: 0,
              padding: big ? "34px 30px" : "22px 22px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 12,
              boxShadow: "5px 6px 0 rgba(35,42,59,0.12)",
              fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
              fontSize: big ? 46 : 34,
              lineHeight: 1.4,
              color: INK,
            }}
          >
            {renderMarked(point)}
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

// パネル(panels): ウィンドウ風カードが左から順にポンと現れる
const PanelsPoints: React.FC<{ points: string[]; frame: number; fps: number; accent: (i: number) => string }> = ({
  points,
  frame,
  fps,
  accent,
}) => (
  <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: 20, width: "100%" }}>
    {points.map((point, i) => {
      const startAt = 16 + i * 16;
      const s = spring({ frame: frame - startAt, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });
      const a = accent(i);
      return (
        <div
          key={i}
          style={{
            opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
            transform: `translateX(${(1 - s) * -50}px) scale(${0.85 + s * 0.15})`,
            flex: 1,
            minWidth: 0,
            background: "#FFFFFF",
            border: `4px solid ${INK}`,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "5px 6px 0 rgba(35,42,59,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              background: `${a}22`,
              borderBottom: `3px solid ${INK}`,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: a }} />
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: `${a}88` }} />
          </div>
          <div
            style={{
              padding: "20px 16px",
              minHeight: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
              fontSize: 32,
              lineHeight: 1.4,
              color: INK,
              textAlign: "center",
            }}
          >
            {renderMarked(point)}
          </div>
        </div>
      );
    })}
  </div>
);

// タイムライン(timeline): 一本の線の上を、上下交互のカードが左から現れる
const TimelinePoints: React.FC<{ points: string[]; frame: number; fps: number; accent: (i: number) => string }> = ({
  points,
  frame,
  fps,
  accent,
}) => (
  <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }}>
    <div
      style={{
        position: "absolute",
        left: "4%",
        right: "4%",
        top: "50%",
        height: 5,
        background: "#DDD3BE",
        transform: "translateY(-50%)",
      }}
    />
    {points.map((point, i) => {
      const startAt = 14 + i * 16;
      const s = spring({ frame: frame - startAt, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
      const isTop = i % 2 === 0;
      const a = accent(i);
      const card = (
        <div
          style={{
            fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
            fontSize: 28,
            lineHeight: 1.35,
            color: INK,
            textAlign: "center",
            background: "#FFFFFF",
            border: `3px solid ${a}`,
            borderRadius: 12,
            padding: "12px 16px",
            boxShadow: "4px 5px 0 rgba(35,42,59,0.1)",
          }}
        >
          {renderMarked(point)}
        </div>
      );
      return (
        <div
          key={i}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
          }}
        >
          <div style={{ minHeight: 90, display: "flex", alignItems: "flex-end", marginBottom: isTop ? 14 : 0 }}>
            {isTop ? card : null}
          </div>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: a,
              border: "4px solid #fff",
              boxShadow: `0 0 0 3px ${a}`,
              transform: `scale(${0.6 + s * 0.4})`,
            }}
          />
          <div style={{ minHeight: 90, display: "flex", alignItems: "flex-start", marginTop: isTop ? 0 : 14 }}>
            {!isTop ? card : null}
          </div>
        </div>
      );
    })}
  </div>
);

// マス目(grid): マス目状に1個ずつ埋まっていく
const GridPoints: React.FC<{ points: string[]; frame: number; fps: number; accent: (i: number) => string }> = ({
  points,
  frame,
  fps,
  accent,
}) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, width: "100%" }}>
    {points.map((point, i) => {
      const startAt = 16 + i * 14;
      const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 160, mass: 0.6 } });
      const a = accent(i);
      return (
        <div
          key={i}
          style={{
            opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
            transform: `scale(${0.8 + s * 0.2})`,
            width: "44%",
            minHeight: 120,
            background: "#FFFFFF",
            border: `4px solid ${a}`,
            borderRadius: 16,
            boxShadow: "5px 6px 0 rgba(35,42,59,0.1)",
            display: "flex",
            alignItems: "center",
            padding: "18px 20px",
            gap: 14,
          }}
        >
          <PointCard point={point} index={i} accent={a} compact />
        </div>
      );
    })}
  </div>
);

// ピラミッド(pyramid): 下から順に土台が積み上がっていく(幅が狭まっていく)
const PyramidPoints: React.FC<{ points: string[]; frame: number; fps: number; accent: (i: number) => string }> = ({
  points,
  frame,
  fps,
  accent,
}) => {
  const total = points.length;
  const baseWidth = 88;
  const shrink = baseWidth / (total + 1.4);
  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 10, width: "100%" }}>
      {points.map((point, i) => {
        const startAt = 16 + i * 14;
        const s = spring({ frame: frame - startAt, fps, config: { damping: 12, stiffness: 150, mass: 0.7 } });
        const a = accent(i);
        const widthPct = baseWidth - i * shrink;
        return (
          <div
            key={i}
            style={{
              opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
              transform: `translateY(${(1 - s) * 22}px) scale(${0.9 + s * 0.1})`,
              width: `${widthPct}%`,
              background: "#FFFFFF",
              border: `4px solid ${a}`,
              borderRadius: 14,
              padding: "16px 22px",
              textAlign: "center",
              boxShadow: "5px 6px 0 rgba(35,42,59,0.1)",
              fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
              fontSize: 32,
              lineHeight: 1.35,
              color: INK,
            }}
          >
            {renderMarked(point)}
          </div>
        );
      })}
    </div>
  );
};

// ゲージ(meter): 段階が進むほどゲージが満ちていく
const MeterPoints: React.FC<{ points: string[]; frame: number; accent: (i: number) => string }> = ({
  points,
  frame,
  accent,
}) => {
  const total = points.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "94%" }}>
      {points.map((point, i) => {
        const startAt = 16 + i * 16;
        const a = accent(i);
        const targetPct = Math.round(((i + 1) / total) * 100);
        const fillPct = interpolate(frame, [startAt, startAt + 18], [0, targetPct], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const labelOp = interpolate(frame, [startAt, startAt + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div key={i} style={{ opacity: labelOp }}>
            <div
              style={{
                fontFamily: `'${yuseiMagic}', 'Noto Sans CJK JP', sans-serif`,
                fontSize: 30,
                color: INK,
                marginBottom: 8,
              }}
            >
              {renderMarked(point)}
            </div>
            <div style={{ width: "100%", height: 24, borderRadius: 12, background: "#EAE2CE", border: `3px solid ${INK}`, overflow: "hidden" }}>
              <div style={{ width: `${fillPct}%`, height: "100%", background: a }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// 要点カード群を、シーンのlayoutに応じて出し分ける
const PointsArea: React.FC<{
  points: string[];
  layout?: Scene["layout"];
  separator?: string;
  frame: number;
  fps: number;
  accentIndex: number;
}> = ({ points, layout, separator, frame, fps, accentIndex }) => {
  const accentAt = (i: number) => ACCENTS[(accentIndex + i) % ACCENTS.length];
  if (!points.length) return null;
  switch (layout) {
    case "row":
      return <RowPoints points={points} frame={frame} fps={fps} separator={separator || "→"} big={false} />;
    case "compare":
      return <RowPoints points={points} frame={frame} fps={fps} separator={separator || "≠"} big />;
    case "panels":
      return <PanelsPoints points={points} frame={frame} fps={fps} accent={accentAt} />;
    case "timeline":
      return <TimelinePoints points={points} frame={frame} fps={fps} accent={accentAt} />;
    case "grid":
      return <GridPoints points={points} frame={frame} fps={fps} accent={accentAt} />;
    case "pyramid":
      return <PyramidPoints points={points} frame={frame} fps={fps} accent={accentAt} />;
    case "meter":
      return <MeterPoints points={points} frame={frame} accent={accentAt} />;
    case "stack":
    default:
      return <StackPoints points={points} frame={frame} fps={fps} accent={accentAt(0)} />;
  }
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
      {scene.se ? <Audio src={staticFile(`se/${scene.se}.mp3`)} volume={0.55} /> : null}

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

        {/* 要点カード群: シーンのlayoutに応じて縦積み/横並び/対比/パネル/年表/マス目/ピラミッド/ゲージに出し分ける */}
        <PointsArea
          points={points}
          layout={scene.layout}
          separator={scene.separator}
          frame={frame}
          fps={fps}
          accentIndex={index}
        />
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
