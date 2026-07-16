import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadMarker } from "@remotion/google-fonts/YuseiMagic";
import { loadFont as loadGothic } from "@remotion/google-fonts/ZenKakuGothicNew";
import { ChibiOverlay, ChibiPose } from "./ChibiOverlay";

const { fontFamily: MARKER } = loadMarker();
const { fontFamily: GOTHIC } = loadGothic();

const INK = "#2b2b2b";
const PAPER = "#fbf8f1";
const ACCENTS = ["#d9482b", "#e08a1e", "#3a8f4a", "#2e6fb0"]; // 赤・橙・緑・青を順番に使う
const GREEN = "#3a8f4a";

// ビート単位の効果音。キーは意味カテゴリ、実ファイルはSE_MAPで対応
export const SE_MAP = {
  clink: "se/kakan_impact.mp3", // 小さな金属音・注意を引く
  reveal: "se/pa_switch.mp3", // パッと1つ見せる
  reveal_multi: "se/papa_quick_switch.mp3", // パパッと連続で見せる(リスト・ステップ向け)
  spark: "se/kira_sparkle.mp3", // キラッ・気づき/ポジティブな発見
  sad: "se/chiin_disappointment.mp3", // チーン・残念/失敗/後悔
  impact: "se/don_impact.mp3", // ドン・強い驚き/衝撃的な事実
  decide: "se/decide1_button.mp3", // 決定・結論に至った
  decide2: "se/decide2_button.mp3", // 決定(別音)
  cash: "se/register_payment.mp3", // レジ・お金/値段の話
  punch: "se/small_punch.mp3", // 小パンチ・言い切り/断言
  drum: "se/kotsuzumi_japanese.mp3", // 小鼓・伝統的/算命学など和風の話
  clapper: "se/hyoshigi1_japanese.mp3", // 拍子木・場面の区切り
  clapper2: "se/hyoshigi2_japanese.mp3", // 拍子木(別音)
  bell: "se/suzu1_bell.mp3", // 鈴・穏やか/癒し
  bell2: "se/suzu2_bell_ring.mp3", // 鈴(別音)
} as const;
export type SeKey = keyof typeof SE_MAP;

// 1ビート = 画面に追加される要素1つ + その間のナレーション字幕
export type Beat = {
  kind: "bubble" | "box" | "big" | "check" | "cross"; // 吹き出し/番号ボックス/中央大文字/✓/×
  text: string; // 画面テキスト（**強調**・\n可）
  sub: string; // 字幕（ナレーションの該当部分）
  se?: SeKey; // このビートが画面に出る瞬間に鳴らす効果音(任意)
};

export type Scene = {
  type: "points" | "stock" | "title" | "cta";
  layout?: "stack" | "row" | "compare" | "panels" | "timeline" | "grid" | "pyramid" | "meter"; // pointsの並べ方: 縦積み / 横並び(→) / 対比(≠) / パネルが左から順に増える / 一直線に並ぶ年表 / マス目に埋まる / 下から積み上がる土台 / ゲージが満ちていく
  separator?: string; // row/compareの区切り記号（既定: row=→ compare=≠）
  title?: string;
  kicker?: string;
  beats: Beat[];
  audio?: string;
  video?: string; // stockシーン用の実写動画(public相対)
  se?: string;
  ctaUrl?: string; // ctaシーン用のURL表示
  pose?: ChibiPose; // このシーンでのちびキャラのポーズ(showChibi時のみ使用)
  durationInSeconds: number;
};

export type RichSlideVideoProps = {
  scenes: Scene[];
  bgm?: string;
  footer?: string;
  showChibi?: boolean; // 右下に聖さんちびキャラのワイプを重ねる
};

const renderMarked = (text: string, accent: string, keyPrefix: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={`${keyPrefix}-${i}`} style={{ color: accent, fontWeight: 700 }}>
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

const MultiLine: React.FC<{ text: string; accent: string; keyPrefix: string }> = ({
  text,
  accent,
  keyPrefix,
}) => (
  <>
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderMarked(line, accent, `${keyPrefix}-l${i}`)}</div>
    ))}
  </>
);

// ビートの開始フレームを字幕の文字数比で割り出す
const beatStartFrames = (beats: Beat[], durationInFrames: number) => {
  const total = beats.reduce((a, b) => a + Math.max(b.sub.length, 1), 0);
  const starts: number[] = [];
  let acc = 0;
  for (const b of beats) {
    starts.push(Math.round((acc / total) * durationInFrames));
    acc += Math.max(b.sub.length, 1);
  }
  return starts;
};

const SubtitleBand: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (frame >= starts[i]) idx = i;
  const opacity = interpolate(frame - starts[idx], [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 130,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 60px",
      }}
    >
      <span
        style={{
          fontFamily: GOTHIC,
          fontSize: 50,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.04em",
          opacity,
          textAlign: "center",
        }}
      >
        {beats[idx]?.sub}
      </span>
    </div>
  );
};

// マーカー（番号・✓・×）
const Marker: React.FC<{ beat: Beat; index: number; accent: string }> = ({ beat, index, accent }) => {
  const symbol = beat.kind === "check" ? "✓" : beat.kind === "cross" ? "×" : `${index + 1}`;
  const color = beat.kind === "check" ? GREEN : beat.kind === "cross" ? ACCENTS[0] : accent;
  return (
    <div
      style={{
        minWidth: 78,
        height: 78,
        borderRadius: "50%",
        border: `5px solid ${color}`,
        color,
        fontFamily: MARKER,
        fontSize: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
      }}
    >
      {symbol}
    </div>
  );
};

// 縦積み用の1要素
const StackItem: React.FC<{ beat: Beat; index: number; startAt: number }> = ({
  beat,
  index,
  startAt,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  if (frame < startAt) return null;

  if (beat.kind === "big") {
    return (
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 92,
          color: INK,
          textAlign: "center",
          lineHeight: 1.55,
          margin: "30px 0",
          opacity: Math.min(1, s * 1.3),
          transform: `scale(${0.75 + s * 0.25})`,
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`big${index}`} />
      </div>
    );
  }

  const isBubble = beat.kind === "bubble";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26,
        margin: "20px 0",
        opacity: Math.min(1, s * 1.3),
        transform: `translateY(${(1 - s) * 70}px) translateX(${(1 - s) * (index % 2 === 0 ? -40 : 40)}px) scale(${0.8 + s * 0.2}) rotate(${(1 - s) * (index % 2 === 0 ? -2 : 2)}deg)`,
      }}
    >
      <Marker beat={beat} index={index} accent={accent} />
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 62,
          lineHeight: 1.5,
          color: INK,
          background: "#fff",
          border: `4px solid ${INK}`,
          borderRadius: isBubble ? 42 : 18,
          padding: "26px 46px",
          boxShadow: "6px 8px 0 rgba(0,0,0,0.08)",
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`b${index}`} />
      </div>
    </div>
  );
};

// 横並び(row)・対比(compare)用のカード
const RowItem: React.FC<{ beat: Beat; index: number; startAt: number; compact: boolean }> = ({
  beat,
  index,
  startAt,
  compact,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  return (
    <div
      style={{
        opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
        transform: `translateY(${(1 - s) * 70}px) scale(${0.7 + s * 0.3})`,
        fontFamily: MARKER,
        fontSize: compact ? 52 : 66,
        lineHeight: 1.5,
        color: INK,
        background: "#fff",
        border: `5px solid ${accent}`,
        borderRadius: 24,
        padding: compact ? "34px 40px" : "50px 58px",
        boxShadow: "6px 8px 0 rgba(0,0,0,0.08)",
        textAlign: "center",
        maxWidth: compact ? 540 : 720,
      }}
    >
      <MultiLine text={beat.text} accent={accent} keyPrefix={`r${index}`} />
    </div>
  );
};

// パネル(panels)用: UIウィンドウ風カードが左から順にポンと現れる
const PanelItem: React.FC<{ beat: Beat; index: number; startAt: number; total: number }> = ({
  beat,
  index,
  startAt,
  total,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });
  const width = total >= 4 ? 400 : total === 3 ? 510 : 640;
  return (
    <div
      style={{
        opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
        transform: `translateX(${(1 - s) * -140}px) scale(${0.7 + s * 0.3}) rotate(${(1 - s) * -3}deg)`,
        width,
        background: "#fff",
        border: `4px solid ${INK}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "6px 8px 0 rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          background: `${accent}22`,
          borderBottom: `3px solid ${INK}`,
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: accent }} />
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${accent}88` }} />
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: `${accent}44` }} />
      </div>
      <div
        style={{
          padding: "40px 28px",
          minHeight: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MARKER,
          fontSize: total >= 4 ? 42 : 50,
          lineHeight: 1.5,
          color: INK,
          textAlign: "center",
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`p${index}`} />
      </div>
    </div>
  );
};

// タイムライン(timeline)用: 一本の線の上をマーカーが左から順に進んでいく
const TimelineItem: React.FC<{ beat: Beat; index: number; startAt: number; total: number }> = ({
  beat,
  index,
  startAt,
  total,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
  const width = total >= 4 ? 370 : 460;
  const isTop = index % 2 === 0;
  return (
    <div
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
      }}
    >
      <div
        style={{
          minHeight: 130,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          marginBottom: isTop ? 18 : 0,
          order: 0,
          transform: `translateY(${(1 - s) * -20}px)`,
        }}
      >
        {isTop ? (
          <div
            style={{
              fontFamily: MARKER,
              fontSize: 42,
              lineHeight: 1.4,
              color: INK,
              textAlign: "center",
              background: "#fff",
              border: `3px solid ${accent}`,
              borderRadius: 14,
              padding: "18px 24px",
              boxShadow: "4px 5px 0 rgba(0,0,0,0.08)",
            }}
          >
            <MultiLine text={beat.text} accent={accent} keyPrefix={`tl${index}`} />
          </div>
        ) : null}
      </div>
      <div
        style={{
          order: 1,
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: accent,
          border: "4px solid #fff",
          boxShadow: `0 0 0 3px ${accent}`,
          transform: `scale(${0.6 + s * 0.4})`,
        }}
      />
      <div
        style={{
          minHeight: 130,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          marginTop: isTop ? 0 : 18,
          order: 2,
          transform: `translateY(${(1 - s) * 20}px)`,
        }}
      >
        {!isTop ? (
          <div
            style={{
              fontFamily: MARKER,
              fontSize: 42,
              lineHeight: 1.4,
              color: INK,
              textAlign: "center",
              background: "#fff",
              border: `3px solid ${accent}`,
              borderRadius: 14,
              padding: "18px 24px",
              boxShadow: "4px 5px 0 rgba(0,0,0,0.08)",
            }}
          >
            <MultiLine text={beat.text} accent={accent} keyPrefix={`tl${index}`} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const TimelineRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const lastStart = starts[starts.length - 1] ?? 0;
  const lineW = interpolate(frame, [starts[0] ?? 0, lastStart + 14], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <div
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          top: "50%",
          height: 5,
          background: "#d8d0bf",
          transform: "translateY(-50%)",
        }}
      >
        <div style={{ width: `${lineW}%`, height: "100%", background: ACCENTS[1] }} />
      </div>
      {beats.map((b, i) => (
        <TimelineItem key={i} beat={b} index={i} startAt={starts[i]} total={beats.length} />
      ))}
    </div>
  );
};

// グリッド(grid)用: マス目に読む順で1個ずつ埋まっていく
const GridItem: React.FC<{ beat: Beat; index: number; startAt: number }> = ({ beat, index, startAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENTS[index % ACCENTS.length];
  const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 160, mass: 0.6 } });
  return (
    <div
      style={{
        opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
        transform: `scale(${0.55 + s * 0.45}) rotate(${(1 - s) * (index % 2 === 0 ? -4 : 4)}deg)`,
        width: 560,
        minHeight: 190,
        background: "#fff",
        border: `4px solid ${accent}`,
        borderRadius: 20,
        boxShadow: "5px 6px 0 rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 30px",
        gap: 16,
      }}
    >
      <Marker beat={beat} index={index} accent={accent} />
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 44,
          lineHeight: 1.45,
          color: INK,
          textAlign: "left",
        }}
      >
        <MultiLine text={beat.text} accent={accent} keyPrefix={`g${index}`} />
      </div>
    </div>
  );
};

// ピラミッド(pyramid)用: 下から順に土台が積み上がっていく
const PyramidRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = beats.length;
  const baseWidth = 950;
  const shrink = baseWidth / (total + 1.6);
  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center" }}>
      {beats.map((b, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const startAt = starts[i];
        const s = spring({ frame: frame - startAt, fps, config: { damping: 12, stiffness: 150, mass: 0.7 } });
        const width = baseWidth - i * shrink;
        return (
          <div
            key={i}
            style={{
              opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
              transform: `translateY(${(1 - s) * -60}px) scale(${0.8 + s * 0.2})`,
              width,
              marginTop: i === 0 ? 0 : 12,
              background: "#fff",
              border: `4px solid ${accent}`,
              borderRadius: 14,
              padding: "24px 34px",
              textAlign: "center",
              boxShadow: "5px 6px 0 rgba(0,0,0,0.08)",
              fontFamily: MARKER,
              fontSize: total >= 4 ? 42 : 50,
              lineHeight: 1.4,
              color: INK,
            }}
          >
            <MultiLine text={b.text} accent={accent} keyPrefix={`py${i}`} />
          </div>
        );
      })}
    </div>
  );
};

// メーター(meter)用: 段階が進むほどゲージが満ちていく
const MeterRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const total = beats.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, width: 1200 }}>
      {beats.map((b, i) => {
        const accent = ACCENTS[i % ACCENTS.length];
        const startAt = starts[i];
        const targetPct = Math.round(((i + 1) / total) * 100);
        const fillPct = interpolate(frame, [startAt, startAt + 20], [0, targetPct], {
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
                fontFamily: MARKER,
                fontSize: 46,
                color: INK,
                marginBottom: 12,
              }}
            >
              <MultiLine text={b.text} accent={accent} keyPrefix={`m${i}`} />
            </div>
            <div
              style={{
                width: "100%",
                height: 40,
                borderRadius: 20,
                background: "#e8e0cf",
                border: `3px solid ${INK}`,
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${fillPct}%`, height: "100%", background: accent }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PointsScene: React.FC<{ scene: Scene; starts: number[] }> = ({ scene, starts }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [1, 1.012]);
  const titleOp = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const layout = scene.layout || "stack";
  const separator = scene.separator || (layout === "compare" ? "≠" : "→");

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill
        style={{ transform: `scale(${drift})`, padding: "70px 130px 130px", alignItems: "center" }}
      >
        {scene.title ? (
          <div
            style={{
              fontFamily: MARKER,
              fontSize: 72,
              color: INK,
              opacity: titleOp,
              borderBottom: `6px solid ${ACCENTS[0]}55`,
              paddingBottom: 8,
              marginBottom: 24,
            }}
          >
            {renderMarked(scene.title, ACCENTS[0], "t")}
          </div>
        ) : null}
        {layout === "stack" ? (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
            {scene.beats.map((b, i) => (
              <StackItem key={i} beat={b} index={i} startAt={starts[i]} />
            ))}
          </div>
        ) : layout === "panels" ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 28,
              flex: 1,
            }}
          >
            {scene.beats.map((b, i) => (
              <PanelItem key={i} beat={b} index={i} startAt={starts[i]} total={scene.beats.length} />
            ))}
          </div>
        ) : layout === "timeline" ? (
          <div style={{ display: "flex", alignItems: "center", flex: 1, width: "100%" }}>
            <TimelineRow beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "grid" ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignContent: "center",
              justifyContent: "center",
              gap: 24,
              flex: 1,
            }}
          >
            {scene.beats.map((b, i) => (
              <GridItem key={i} beat={b} index={i} startAt={starts[i]} />
            ))}
          </div>
        ) : layout === "pyramid" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <PyramidRow beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "meter" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <MeterRow beats={scene.beats} starts={starts} />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 36,
              flex: 1,
            }}
          >
            {scene.beats.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 ? (
                  <div
                    style={{
                      fontFamily: MARKER,
                      fontSize: layout === "compare" ? 130 : 88,
                      color: ACCENTS[1],
                      opacity: frame >= starts[i] ? 1 : 0,
                    }}
                  >
                    {separator}
                  </div>
                ) : null}
                <RowItem beat={b} index={i} startAt={starts[i]} compact={scene.beats.length >= 3} />
              </React.Fragment>
            ))}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const StockScene: React.FC<{ scene: Scene; starts: number[] }> = ({ scene, starts }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scene.video ? (
        <OffthreadVideo
          src={staticFile(scene.video)}
          muted
          loop
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.45)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 160px 110px" }}>
        {scene.beats.map((b, i) => {
          if (frame < starts[i]) return null;
          const op = interpolate(frame - starts[i], [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: MARKER,
                fontSize: 82,
                color: "#fff",
                textAlign: "center",
                lineHeight: 1.7,
                textShadow: "0 4px 24px rgba(0,0,0,0.8)",
                opacity: op,
                margin: "14px 0",
              }}
            >
              <MultiLine text={b.text} accent="#ffd75e" keyPrefix={`s${i}`} />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TitleScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 200, stiffness: 100 } });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, justifyContent: "center", alignItems: "center" }}>
      {scene.kicker ? (
        <div
          style={{
            fontFamily: GOTHIC,
            fontSize: 32,
            letterSpacing: "0.35em",
            color: ACCENTS[1],
            fontWeight: 700,
            marginBottom: 36,
            opacity: s,
          }}
        >
          {scene.kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: MARKER,
          fontSize: 116,
          color: INK,
          textAlign: "center",
          lineHeight: 1.6,
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px)`,
        }}
      >
        <MultiLine text={scene.beats[0]?.text || scene.title || ""} accent={ACCENTS[0]} keyPrefix="ti" />
      </div>
    </AbsoluteFill>
  );
};

// LP誘導用のCTAシーン
const CtaScene: React.FC<{ scene: Scene; starts: number[] }> = ({ scene, starts }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const urlAt = starts[starts.length - 1] + 20;
  const s = spring({ frame: frame - urlAt, fps, config: { damping: 12, stiffness: 150, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 140px 150px" }}>
        {scene.beats.map((b, i) => {
          if (frame < starts[i]) return null;
          const op = interpolate(frame - starts[i], [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: MARKER,
                fontSize: 78,
                color: INK,
                textAlign: "center",
                lineHeight: 1.7,
                opacity: op,
                margin: "14px 0",
              }}
            >
              <MultiLine text={b.text} accent={ACCENTS[0]} keyPrefix={`c${i}`} />
            </div>
          );
        })}
        {scene.ctaUrl && frame >= urlAt ? (
          <div
            style={{
              marginTop: 46,
              opacity: Math.min(1, s * 1.3),
              transform: `scale(${0.9 + s * 0.1})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                fontFamily: GOTHIC,
                fontSize: 40,
                fontWeight: 700,
                color: "#fff",
                background: GREEN,
                borderRadius: 60,
                padding: "26px 70px",
                boxShadow: "6px 8px 0 rgba(0,0,0,0.12)",
              }}
            >
              ▼ 概要欄のリンクから
            </div>
            <div style={{ fontFamily: GOTHIC, fontSize: 30, color: INK, opacity: 0.7 }}>
              {scene.ctaUrl}
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 各ビートが画面に現れる瞬間にse指定があれば短く効果音を鳴らす(レイアウト共通)
const BeatSeLayer: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => (
  <>
    {beats.map((b, i) =>
      b.se ? (
        <Sequence key={i} from={starts[i]} durationInFrames={45}>
          <Audio src={staticFile(SE_MAP[b.se])} volume={0.5} />
        </Sequence>
      ) : null
    )}
  </>
);

const SceneView: React.FC<{ scene: Scene; footer: string }> = ({ scene, footer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const starts = beatStartFrames(scene.beats, durationInFrames);
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {scene.type === "points" ? <PointsScene scene={scene} starts={starts} /> : null}
      {scene.type === "stock" ? <StockScene scene={scene} starts={starts} /> : null}
      {scene.type === "title" ? <TitleScene scene={scene} /> : null}
      {scene.type === "cta" ? <CtaScene scene={scene} starts={starts} /> : null}
      {scene.type !== "title" ? <SubtitleBand beats={scene.beats} starts={starts} /> : null}
      <BeatSeLayer beats={scene.beats} starts={starts} />
      <div
        style={{
          position: "absolute",
          right: 40,
          top: 28,
          fontFamily: GOTHIC,
          fontSize: 26,
          color: scene.type === "stock" ? "rgba(255,255,255,0.75)" : "rgba(43,43,43,0.55)",
          letterSpacing: "0.1em",
        }}
      >
        {footer}
      </div>
    </AbsoluteFill>
  );
};

export const RichSlideVideo: React.FC<RichSlideVideoProps> = ({
  scenes,
  bgm,
  footer = "伊勢 聖",
  showChibi = false,
}) => {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {bgm ? <Audio src={staticFile(bgm)} loop volume={0.07} /> : null}
      {scenes.map((scene, i) => {
        const dur = Math.round(scene.durationInSeconds * fps);
        const seq = (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
            {scene.se ? <Audio src={staticFile(scene.se)} volume={0.15} /> : null}
            <SceneView scene={scene} footer={footer} />
            {showChibi && scene.audio ? <ChibiOverlay audioSrc={scene.audio} pose={scene.pose} /> : null}
          </Sequence>
        );
        from += dur;
        return seq;
      })}
      <SubscribeBadge />
    </AbsoluteFill>
  );
};

// 画面右下に常時表示するチャンネル登録バッジ(ゆっくり脈打つ)
const SubscribeBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 22) * 0.03;
  return (
    <div
      style={{
        position: "absolute",
        right: 26,
        bottom: 152,
        transform: `scale(${pulse})`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#cc0000",
        color: "#fff",
        fontFamily: GOTHIC,
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: "0.06em",
        padding: "12px 24px",
        borderRadius: 10,
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      }}
    >
      <span style={{ fontSize: 22 }}>▶</span>
      チャンネル登録
    </div>
  );
};
