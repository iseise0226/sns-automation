import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// 「長押しして読んでね」型のリスト解説リール(satoshi_mindset, 2026-10-08〜)
// 一覧を1枚見せてフェードアウト → 1項目ずつ1枚5秒で解説。背景の実写とBGMは全体で1本を流しっぱなしにする。
// 書体はGoogle Fontsから読まず、同梱のOTF(remotion/assets/fonts → public-dir/fonts)を使う。
// 他のコンポジションの書体と合わせて数千件の取得になり、読み込みが間に合わずゴシックに化けたため(2026-10-08)
const SERIF = "ListReelSerif";
const fontHandle = delayRender("ListReel fonts");
Promise.all(
  [
    ["fonts/NotoSerifJP-Light.otf", "300"],
    ["fonts/NotoSerifJP-Regular.otf", "400"],
  ].map(([file, weight]) =>
    new FontFace(SERIF, `url(${staticFile(file)})`, { weight }).load().then((f) => document.fonts.add(f))
  )
)
  .then(() => continueRender(fontHandle))
  .catch((e) => {
    console.error("ListReel font load failed", e);
    continueRender(fontHandle);
  });

export type ListItem = {
  text: string; // 一覧に出す1行
  short: string; // 一覧で項目の下に出す一言
  head: string[]; // 解説スライドの見出し(1〜2行)
  body: string[]; // 解説スライドの本文(3〜5行)
};

export type ListReelProps = {
  title: string[];
  label: string;
  items: ListItem[];
  footer?: string;
  video: string;
  bgm: string;
  slideSeconds?: number;
};

const FADE = 18; // 0.6秒
const W = 1080;
const SHADOW = "0 0 12px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.35)";

// 長い行は折り返さず、行ごとに文字を小さくして1行に収める
const fit = (text: string, base: number, maxWidth: number) =>
  Math.min(base, Math.floor(maxWidth / Math.max(1, [...text].length)));

const Line: React.FC<{ text: string; size: number; maxWidth?: number; opacity?: number; weight?: number; style?: React.CSSProperties }> = ({
  text,
  size,
  maxWidth = 940,
  opacity = 1,
  weight = 300,
  style,
}) => (
  <div
    style={{
      fontSize: fit(text, size, maxWidth),
      fontWeight: weight,
      color: `rgba(255,255,255,${opacity})`,
      whiteSpace: "nowrap",
      textShadow: SHADOW,
      letterSpacing: "0.04em",
      ...style,
    }}
  >
    {text}
  </div>
);

// 先頭でフェードイン、末尾でフェードアウトする文字の層
const Fader: React.FC<{ duration: number; fadeIn: boolean; fadeOut: boolean; children: React.ReactNode }> = ({
  duration,
  fadeIn,
  fadeOut,
  children,
}) => {
  const frame = useCurrentFrame();
  const a = fadeIn ? interpolate(frame, [0, FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const b = fadeOut ? interpolate(frame, [duration - FADE, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
};

const Overview: React.FC<{ title: string[]; items: ListItem[]; footer: string }> = ({ title, items, footer }) => {
  const itemSize = 46;
  return (
    <AbsoluteFill style={{ fontFamily: SERIF, alignItems: "center" }}>
      <div style={{ position: "absolute", top: 400, width: W, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        {title.map((t, i) => (
          <Line key={i} text={t} size={76} weight={400} />
        ))}
      </div>
      <div style={{ position: "absolute", top: 810, display: "flex", flexDirection: "column", gap: 34 }}>
        {items.map((it, i) => (
          <div key={i}>
            <Line text={`${i + 1}. ${it.text}`} size={itemSize} maxWidth={900} />
            <Line text={it.short} size={36} maxWidth={840} opacity={0.94} style={{ marginTop: 12, paddingLeft: itemSize * 1.3 }} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 1640, width: W, display: "flex", justifyContent: "center" }}>
        <Line text={footer} size={36} opacity={0.86} />
      </div>
    </AbsoluteFill>
  );
};

const Detail: React.FC<{ index: number; total: number; label: string; item: ListItem }> = ({ index, total, label, item }) => (
  <AbsoluteFill style={{ fontFamily: SERIF }}>
    <div style={{ position: "absolute", top: 380, width: W, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Line text={label} size={34} opacity={0.86} />
      <div style={{ fontSize: 150, fontWeight: 300, color: "white", textShadow: SHADOW, lineHeight: 1, marginTop: 70 }}>{index}</div>
      <div style={{ marginTop: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        {item.head.map((t, i) => (
          <Line key={i} text={t} size={62} weight={400} />
        ))}
      </div>
      <div style={{ width: 120, height: 2, background: "rgba(255,255,255,0.8)", margin: "56px 0 48px", boxShadow: SHADOW }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        {item.body.map((t, i) => (
          <Line key={i} text={t} size={42} opacity={0.95} />
        ))}
      </div>
    </div>
    <div style={{ position: "absolute", top: 1640, width: W, display: "flex", justifyContent: "center" }}>
      <Line text={`${index} / ${total}`} size={32} opacity={0.8} />
    </div>
  </AbsoluteFill>
);

export const listReelDuration = (props: Pick<ListReelProps, "items" | "slideSeconds">, fps: number) =>
  Math.round((props.slideSeconds || 5) * fps) * (props.items.length + 1);

export const ListReel: React.FC<ListReelProps> = ({ title, label, items, footer, video, bgm, slideSeconds = 5 }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const slide = Math.round(slideSeconds * fps);
  const bgmVolume = interpolate(frame, [0, fps, durationInFrames - 2 * fps, durationInFrames], [0, 0.8, 0.8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0e1e" }}>
      <OffthreadVideo src={staticFile(video)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {/* 文字が読めるよう、上下は薄く・中央は濃く暗くする。切り替えで明るさが変わらないよう常に一定 */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(10,14,30,0.3) 0%, rgba(10,14,30,0.56) 50%, rgba(10,14,30,0.3) 100%)",
        }}
      />
      <Sequence durationInFrames={slide}>
        <Fader duration={slide} fadeIn={false} fadeOut>
          <Overview title={title} items={items} footer={footer || "長押しして止めて読んでね♡"} />
        </Fader>
      </Sequence>
      {items.map((it, i) => (
        <Sequence key={i} from={slide * (i + 1)} durationInFrames={slide}>
          <Fader duration={slide} fadeIn fadeOut={i < items.length - 1}>
            <Detail index={i + 1} total={items.length} label={label} item={it} />
          </Fader>
        </Sequence>
      ))}
      <Audio src={staticFile(bgm)} volume={bgmVolume} />
    </AbsoluteFill>
  );
};
