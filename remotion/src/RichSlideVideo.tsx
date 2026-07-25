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
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";
import { ChibiOverlay, ChibiPose } from "./ChibiOverlay";
import { LineIcon } from "./LineIcons";

// 全体を丸ゴシック1書体で統一する(HyperFramesで確定したデザイン)
const { fontFamily: MARU } = loadMaru();
const MARKER = MARU;
const GOTHIC = MARU;

const INK = "#1a1a1a";
const PAPER = "#ffffff";
const DARK = "#2b2b2b"; // 番号丸・ピル見出しの地色
const RED = "#d92b2b"; // 図版・強調の赤
const RED_TEXT = "#c62222"; // 本文中の強調赤
const NAVY = "#16202e"; // 字幕バー
const YELLOW_MARK = "#ffe94d"; // 白背景用の蛍光マーカー
const YELLOW_SOLID = "#ffe500"; // 実写など暗い背景用のベタ塗り
const GRAY_BAR = "#8f8f8f";
// 既存レイアウトが色を順番に使う前提のため、赤と黒だけの落ち着いた並びにする
const ACCENTS = [RED, DARK, RED, DARK];
const GREEN = NAVY;

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
  icon?: string; // 図解レイアウトで使う線画アイコン名(LineIconsのIconName)
  note?: string; // アイコンの下に置く小さな補足（赤字・\n可）
  se?: SeKey; // このビートが画面に出る瞬間に鳴らす効果音(任意)
};

export type Scene = {
  type: "points" | "stock" | "title" | "cta" | "cut";
  layout?:
    | "stack"
    | "row"
    | "compare"
    | "panels"
    | "timeline"
    | "grid"
    | "pyramid"
    | "meter"
    | "split2"
    | "stairs"
    | "chart4step"
    | "flow3"
    | "iconsteps"
    | "reject"; // pointsの並べ方: 縦積み / 横並び(→) / 対比(≠) / パネルが左から順に増える / 一直線に並ぶ年表 / マス目に埋まる / 下から積み上がる土台 / ゲージが満ちていく / 左に否定・右に解決策の2分割 / 階段状に積み上がり最後で壁を突破 / 番号付き4ステップ
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

// カード・小さめの文字での**強調**は赤の太字にする
const renderMarked = (text: string, _accent: string, keyPrefix: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={`${keyPrefix}-${i}`} style={{ color: RED_TEXT, fontWeight: 900 }}>
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    )
  );

// 見出し・大きい文字での**強調**は黄色の蛍光マーカーが左から引かれる
const renderMarkedHL = (text: string, keyPrefix: string, grow: number) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={`${keyPrefix}-${i}`} style={{ position: "relative", display: "inline-block" }}>
        <span
          style={{
            position: "absolute",
            left: "-0.04em",
            right: "-0.04em",
            bottom: "0.16em",
            height: "0.42em",
            background: YELLOW_MARK,
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

const MultiLineHL: React.FC<{ text: string; keyPrefix: string; grow: number }> = ({
  text,
  keyPrefix,
  grow,
}) => (
  <>
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderMarkedHL(line, `${keyPrefix}-l${i}`, grow)}</div>
    ))}
  </>
);

// 白背景シーンの大見出し。**強調**の裏に黄色のベタ塗りが左から伸びる
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

// 図解シーン共通の大見出し(画面上部・センター)
const Headline: React.FC<{ text: string; opacity: number; grow: number }> = ({
  text,
  opacity,
  grow,
}) => (
  <div
    style={{
      fontFamily: MARU,
      fontWeight: 900,
      fontSize: 74,
      lineHeight: 1.35,
      color: INK,
      textAlign: "center",
      opacity,
      transform: `translateY(${(1 - opacity) * -16}px)`,
      marginBottom: 54,
    }}
  >
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderHeadline(line, `hd-l${i}`, grow)}</div>
    ))}
  </div>
);

// 細いグレーの矢印(図解の列と列をつなぐ)
const FlowArrow: React.FC<{ opacity: number; size?: number }> = ({ opacity, size = 90 }) => (
  <svg width={size} height={40} viewBox="0 0 90 40" fill="none" style={{ opacity, flexShrink: 0 }}>
    <path
      d="M8 20h64M60 9l14 11-14 11"
      stroke="#8a8a8a"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 実写など暗い背景での**強調**は黄色のベタ塗り＋黒文字(マーカーだと沈むため)
const renderMarkedSolid = (text: string, keyPrefix: string, pop: number) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span
        key={`${keyPrefix}-${i}`}
        style={{
          display: "inline-block",
          background: YELLOW_SOLID,
          color: "#1a1a1a",
          textShadow: "none",
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

const MultiLineSolid: React.FC<{ text: string; keyPrefix: string; pop?: number }> = ({
  text,
  keyPrefix,
  pop = 1,
}) => (
  <>
    {text.split("\n").map((line, i) => (
      <div key={i}>{renderMarkedSolid(line, `${keyPrefix}-l${i}`, pop)}</div>
    ))}
  </>
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
        left: 60,
        bottom: 60,
        width: 1800,
        height: 130,
        background: NAVY,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 60px",
      }}
    >
      <span
        style={{
          fontFamily: GOTHIC,
          fontSize: 48,
          fontWeight: 700,
          color: "#fff",
          lineHeight: 1.4,
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
// 番号は黒丸に白抜き、×は赤の輪郭、✓はネイビーの輪郭
const Marker: React.FC<{ beat: Beat; index: number; accent: string }> = ({ beat, index }) => {
  const symbol = beat.kind === "check" ? "✓" : beat.kind === "cross" ? "×" : `${index + 1}`;
  const outlined = beat.kind === "check" || beat.kind === "cross";
  const color = beat.kind === "check" ? NAVY : beat.kind === "cross" ? RED : DARK;
  return (
    <div
      style={{
        minWidth: 72,
        height: 72,
        borderRadius: "50%",
        border: outlined ? `5px solid ${color}` : "none",
        background: outlined ? "#fff" : DARK,
        color: outlined ? color : "#fff",
        fontFamily: MARKER,
        fontWeight: 700,
        fontSize: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
          fontWeight: 700,
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
          fontWeight: 700,
          fontSize: 62,
          lineHeight: 1.5,
          color: INK,
          background: "#fff",
          border: `3px solid ${DARK}`,
          borderRadius: 16,
          padding: "26px 46px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
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
        fontWeight: 700,
        fontSize: compact ? 52 : 66,
        lineHeight: 1.5,
        color: INK,
        background: "#fff",
        border: `3px solid ${DARK}`,
        borderRadius: 16,
        padding: compact ? "34px 40px" : "50px 58px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
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
        border: `3px solid ${DARK}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          background: `${accent}22`,
          borderBottom: `3px solid ${DARK}`,
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
          fontWeight: 700,
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
              fontWeight: 700,
              fontSize: 42,
              lineHeight: 1.4,
              color: INK,
              textAlign: "center",
              background: "#fff",
              border: `3px solid ${DARK}`,
              borderRadius: 14,
              padding: "18px 24px",
              boxShadow: "0 3px 12px rgba(0,0,0,0.10)",
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
              fontWeight: 700,
              fontSize: 42,
              lineHeight: 1.4,
              color: INK,
              textAlign: "center",
              background: "#fff",
              border: `3px solid ${DARK}`,
              borderRadius: 14,
              padding: "18px 24px",
              boxShadow: "0 3px 12px rgba(0,0,0,0.10)",
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
        border: `3px solid ${DARK}`,
        borderRadius: 16,
        boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
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
          fontWeight: 700,
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
              border: `3px solid ${DARK}`,
              borderRadius: 16,
              padding: "24px 34px",
              textAlign: "center",
              boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
              fontFamily: MARKER,
              fontWeight: 700,
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
                fontWeight: 700,
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
                background: "#eeeeee",
                border: `3px solid ${DARK}`,
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

// 図解①(flow3): 上に見出しラベル / 中央に線画アイコン / 下に補足、を横に並べて矢印でつなぐ
const FlowRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colW = beats.length >= 4 ? 340 : 400;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 0 }}>
      {beats.map((b, i) => {
        const startAt = starts[i];
        const s = spring({ frame: frame - startAt, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
        const op = frame < startAt ? 0 : Math.min(1, s * 1.3);
        return (
          <React.Fragment key={i}>
            {i > 0 ? (
              <div style={{ paddingTop: 250 }}>
                <FlowArrow opacity={frame >= startAt ? 1 : 0} />
              </div>
            ) : null}
            <div
              style={{
                width: colW,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                opacity: op,
                transform: `translateY(${(1 - s) * 26}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: MARU,
                  fontWeight: 700,
                  fontSize: 40,
                  lineHeight: 1.5,
                  color: INK,
                  textAlign: "center",
                  minHeight: 190,
                }}
              >
                <MultiLine text={b.text} accent={RED_TEXT} keyPrefix={`fl${i}`} />
              </div>
              <div style={{ margin: "10px 0 26px" }}>
                <LineIcon name={b.icon} size={132} />
              </div>
              {b.note ? (
                <div
                  style={{
                    fontFamily: MARU,
                    fontWeight: 700,
                    fontSize: 34,
                    lineHeight: 1.5,
                    color: INK,
                    textAlign: "center",
                  }}
                >
                  <MultiLine text={b.note} accent={RED_TEXT} keyPrefix={`fn${i}`} />
                </div>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// 図解②(iconsteps): 丸で囲んだ線画アイコンを矢印でつなぎ、下にラベルを置く
const IconStepsRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = beats.length >= 4 ? 84 : 96;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
      {beats.map((b, i) => {
        const startAt = starts[i];
        const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 165, mass: 0.6 } });
        const op = frame < startAt ? 0 : Math.min(1, s * 1.3);
        return (
          <React.Fragment key={i}>
            {i > 0 ? (
              <div style={{ paddingTop: r - 20 }}>
                <FlowArrow opacity={frame >= startAt ? 1 : 0} size={64} />
              </div>
            ) : null}
            <div
              style={{
                width: r * 2 + 40,
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
                <LineIcon name={b.icon} size={r} />
              </div>
              <div
                style={{
                  marginTop: 22,
                  fontFamily: MARU,
                  fontWeight: 700,
                  fontSize: 34,
                  lineHeight: 1.45,
                  color: INK,
                  textAlign: "center",
                }}
              >
                <MultiLine text={b.text} accent={RED_TEXT} keyPrefix={`is${i}`} />
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// 図解③(reject): 左に「これではない」もの(大きな赤い×)、右に本当に伝えたいこと
const RejectRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const left = beats[0];
  const right = beats.slice(1);
  const sL = spring({ frame: frame - starts[0], fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  // ×は左のブロックが出たあと少し遅れて引かれる
  const xDraw = interpolate(frame - starts[0], [12, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ display: "flex", alignItems: "stretch", width: 1620 }}>
      <div
        style={{
          width: 620,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: frame < starts[0] ? 0 : Math.min(1, sL * 1.3),
          transform: `translateX(${(1 - sL) * -40}px)`,
        }}
      >
        {left ? (
          <>
            <div
              style={{
                border: `3px solid ${DARK}`,
                borderRadius: 16,
                padding: "26px 34px",
                fontFamily: MARU,
                fontWeight: 700,
                fontSize: 40,
                lineHeight: 1.5,
                color: INK,
                textAlign: "center",
              }}
            >
              <MultiLine text={left.text} accent={RED_TEXT} keyPrefix="rjt" />
            </div>
            <div style={{ position: "relative", margin: "44px 0 22px" }}>
              <LineIcon name={left.icon} size={190} />
              <svg
                width="230"
                height="230"
                viewBox="0 0 230 230"
                fill="none"
                style={{ position: "absolute", left: -20, top: -20 }}
              >
                <path
                  d="M28 28L202 202M202 28L28 202"
                  stroke={RED}
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeDasharray="246"
                  strokeDashoffset={246 * (1 - xDraw)}
                />
              </svg>
            </div>
            {left.note ? (
              <div
                style={{
                  fontFamily: MARU,
                  fontWeight: 700,
                  fontSize: 34,
                  color: INK,
                  textAlign: "center",
                }}
              >
                <MultiLine text={left.note} accent={RED_TEXT} keyPrefix="rjn" />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={{ width: 3, background: "#c9c9c9", margin: "0 50px" }} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        {right.map((b, i) => {
          const startAt = starts[i + 1];
          const s = spring({ frame: frame - startAt, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
          const grow = interpolate(frame - startAt, [6, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
                transform: `translateX(${(1 - s) * 40}px)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              {b.icon ? <LineIcon name={b.icon} size={112} /> : null}
              <div
                style={{
                  fontFamily: MARU,
                  fontWeight: 900,
                  fontSize: 48,
                  lineHeight: 1.45,
                  color: INK,
                  textAlign: "center",
                }}
              >
                {b.text.split("\n").map((line, j) => (
                  <div key={j}>{renderHeadline(line, `rr${i}-${j}`, grow)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 2分割(split2)用: 左に否定材料(×)、右に解決の手順(番号)を並べる
const Split2Row: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mid = Math.ceil(beats.length / 2);
  const left = beats.slice(0, mid);
  const right = beats.slice(mid);
  return (
    <div style={{ display: "flex", alignItems: "stretch", width: 1500, gap: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, paddingRight: 40 }}>
        {left.map((b, i) => {
          const startAt = starts[i];
          const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 150, mass: 0.6 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
                transform: `translateX(${(1 - s) * -50}px)`,
              }}
            >
              <div
                style={{
                  minWidth: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: `5px solid ${ACCENTS[0]}`,
                  color: ACCENTS[0],
                  fontFamily: MARKER,
                  fontWeight: 700,
                  fontSize: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fff",
                }}
              >
                ×
              </div>
              <div style={{ fontFamily: MARKER, fontWeight: 700, fontSize: 40, lineHeight: 1.45, color: INK }}>
                <MultiLine text={b.text} accent={ACCENTS[0]} keyPrefix={`sl${i}`} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ width: 5, background: `${INK}33`, margin: "0 20px" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, paddingLeft: 40 }}>
        {right.map((b, i) => {
          const startAt = starts[mid + i];
          const accent = ACCENTS[(i + 2) % ACCENTS.length];
          const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 150, mass: 0.6 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
                transform: `translateX(${(1 - s) * 50}px)`,
                background: "#fff",
                border: `3px solid ${DARK}`,
                borderRadius: 16,
                padding: "18px 26px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
              }}
            >
              <div
                style={{
                  minWidth: 54,
                  height: 54,
                  borderRadius: "50%",
                  background: accent,
                  color: "#fff",
                  fontFamily: MARKER,
                  fontWeight: 700,
                  fontSize: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontFamily: MARKER, fontWeight: 700, fontSize: 36, lineHeight: 1.4, color: INK }}>
                <MultiLine text={b.text} accent={accent} keyPrefix={`sr${i}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 階段(stairs)用: 段が右上に積み上がり、最後の段だけ壁を突破する演出
const StairsRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = beats.length;
  return (
    <div style={{ position: "relative", width: 1300, height: 460, display: "flex", alignItems: "flex-end" }}>
      {beats.map((b, i) => {
        const startAt = starts[i];
        const isLast = i === total - 1;
        const accent = isLast ? RED : DARK;
        const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 140, mass: 0.65 } });
        const stepH = 150 + i * 100;
        return (
          <div
            key={i}
            style={{
              position: "relative",
              width: 1300 / total,
              height: stepH,
              marginLeft: i === 0 ? 0 : -4,
              background: isLast ? "#fff" : "#eeeeee",
              border: `3px solid ${accent}`,
              borderBottom: "none",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: 24,
              opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
              transform: `translateY(${(1 - s) * 60}px)`,
              boxShadow: isLast ? "0 -6px 22px rgba(217,72,43,0.25)" : "none",
            }}
          >
            <div
              style={{
                fontFamily: MARKER,
                fontWeight: 700,
                fontSize: isLast ? 46 : 34,
                lineHeight: 1.4,
                color: isLast ? ACCENTS[0] : INK,
                textAlign: "center",
                padding: "0 20px",
              }}
            >
              <MultiLine text={b.text} accent={accent} keyPrefix={`st${i}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// データ+4ステップ(chart4step)用: 上に伸び率バッジ、下に番号付きステップを並べる
const Chart4StepRow: React.FC<{ beats: Beat[]; starts: number[] }> = ({ beats, starts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badgeStart = 0;
  const bs = spring({ frame: frame - badgeStart, fps, config: { damping: 11, stiffness: 160, mass: 0.6 } });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 30,
          opacity: Math.min(1, bs * 1.3),
          transform: `scale(${0.8 + bs * 0.2})`,
        }}
      >
        <div style={{ width: 60, height: 90, background: GRAY_BAR, borderRadius: "6px 6px 0 0" }} />
        <div style={{ width: 60, height: 210, background: ACCENTS[0], borderRadius: "6px 6px 0 0" }} />
        <div
          style={{
            marginLeft: 24,
            background: "#ffe500",
            border: `3px solid ${DARK}`,
            borderRadius: "50%",
            width: 200,
            height: 150,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MARKER,
            fontWeight: 700,
            fontSize: 30,
            color: INK,
            textAlign: "center",
            lineHeight: 1.3,
            transform: "rotate(-6deg)",
          }}
        >
          増えている
        </div>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {beats.map((b, i) => {
          const startAt = starts[i];
          const accent = ACCENTS[i % ACCENTS.length];
          const s = spring({ frame: frame - startAt, fps, config: { damping: 13, stiffness: 160, mass: 0.6 } });
          return (
            <div
              key={i}
              style={{
                width: 300,
                opacity: frame < startAt ? 0 : Math.min(1, s * 1.3),
                transform: `translateY(${(1 - s) * 40}px)`,
                background: "#fff",
                border: `3px solid ${DARK}`,
                borderRadius: 16,
                padding: "20px 20px",
                textAlign: "center",
                boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: "50%",
                  background: accent,
                  color: "#fff",
                  fontFamily: MARKER,
                  fontWeight: 700,
                  fontSize: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontFamily: MARKER, fontWeight: 700, fontSize: 30, lineHeight: 1.4, color: INK }}>
                <MultiLine text={b.text} accent={accent} keyPrefix={`c4${i}`} />
              </div>
            </div>
          );
        })}
      </div>
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
        style={{ transform: `scale(${drift})`, padding: "56px 130px 230px", alignItems: "center" }}
      >
        {scene.title ? (
          <Headline
            text={scene.title}
            opacity={titleOp}
            grow={interpolate(frame, [10, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        ) : null}
        {layout === "flow3" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <FlowRow beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "iconsteps" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <IconStepsRow beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "reject" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <RejectRow beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "stack" ? (
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
        ) : layout === "split2" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <Split2Row beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "stairs" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <StairsRow beats={scene.beats} starts={starts} />
          </div>
        ) : layout === "chart4step" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <Chart4StepRow beats={scene.beats} starts={starts} />
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
                      fontWeight: 700,
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
      {/* 上下を落として文字を読ませ、中央は素材を活かす(cutシーンと同じ処理) */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,14,20,0.86) 0%, rgba(10,14,20,0.5) 30%, rgba(10,14,20,0.5) 62%, rgba(10,14,20,0.92) 100%)",
        }}
      />
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
                fontWeight: 700,
                fontSize: 78,
                fontWeight: 900,
                color: "#fff",
                textAlign: "center",
                lineHeight: 1.55,
                textShadow: "0 6px 26px rgba(0,0,0,0.8)",
                opacity: op,
                margin: "14px 0",
              }}
            >
              <MultiLineSolid text={b.text} keyPrefix={`s${i}`} />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 実写ハイライトカット(cut)用: 短尺の実写に大きな一文＋黄色ベタ塗りの強調を重ねる
const CutScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, 999], [1, 1.08], { extrapolateRight: "clamp" });
  const textS = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  // 強調ワードは本文より少し遅れて黄色い箱がポンと出る
  const popScale = spring({ frame: frame - 14, fps, config: { damping: 10, stiffness: 200, mass: 0.5 } });
  const beat = scene.beats[0];
  const lines = (beat?.text || "").split("\n");
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
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
            "linear-gradient(180deg, rgba(10,14,20,0.86) 0%, rgba(10,14,20,0.58) 30%, rgba(10,14,20,0.58) 62%, rgba(10,14,20,0.92) 100%)",
        }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 160px 110px" }}>
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
                fontFamily: GOTHIC,
                fontWeight: 900,
                fontSize: 82,
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
            fontSize: 34,
            letterSpacing: "0.24em",
            color: "#ffffff",
            background: DARK,
            borderRadius: 12,
            padding: "12px 40px",
            fontWeight: 700,
            marginBottom: 46,
            opacity: s,
            transform: `translateY(${(1 - s) * -20}px)`,
          }}
        >
          {scene.kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: MARKER,
          fontWeight: 700,
          fontSize: 112,
          fontWeight: 900,
          color: INK,
          textAlign: "center",
          lineHeight: 1.5,
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px)`,
        }}
      >
        <MultiLineHL
          text={scene.beats[0]?.text || scene.title || ""}
          keyPrefix="ti"
          grow={interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
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
                fontWeight: 700,
                fontSize: 76,
                fontWeight: 900,
                color: INK,
                textAlign: "center",
                lineHeight: 1.55,
                opacity: op,
                margin: "14px 0",
              }}
            >
              <MultiLineHL
                text={b.text}
                keyPrefix={`c${i}`}
                grow={interpolate(frame - starts[i], [8, 24], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}
              />
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
                boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
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
      {scene.type === "cut" ? <CutScene scene={scene} /> : null}
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
          color: scene.type === "stock" || scene.type === "cut" ? "rgba(255,255,255,0.75)" : "rgba(43,43,43,0.55)",
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
        right: 60,
        bottom: 212,
        transform: `scale(${pulse})`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: RED,
        color: "#fff",
        fontFamily: GOTHIC,
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: "0.06em",
        padding: "12px 24px",
        borderRadius: 10,
        boxShadow: "0 4px 14px rgba(0,0,0,0.20)",
      }}
    >
      <span style={{ fontSize: 22 }}>▶</span>
      チャンネル登録
    </div>
  );
};
