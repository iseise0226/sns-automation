import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadMincho } from "@remotion/google-fonts/ShipporiMincho";

// 縦書き明朝の「文章リール」(ise_sato_kosodate, 2026-10-24〜サンプル)
// 参考: tomo_mindcoach。共感→本音→葛藤→言い換え→許可→希望。前半は暗い映像、後半は明るく暖かい色へ。
// 1枚=1〜3行、ナレーションの長さに合わせて表示。背景の映像は2〜3枚ごとに切り替える(shotが同じ間は同じ映像)
const { fontFamily: MINCHO } = loadMincho("normal", { weights: ["500", "800"] });

export type EssayCard = { lines: string[]; audio?: string; seconds: number; shot: number; title?: boolean };
export type EssayShot = { clip: string; tone: "dark" | "dawn" | "warm" };
export type ClipEssayProps = { cards: EssayCard[]; shots: EssayShot[]; bgm?: string; bgmVolume?: number };

const FPS = 30;

// 縦書きで数字が横に寝ないよう、2〜3桁の数字は縦中横(1マスに横並び)にする
const Tate: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\d{1,3})/).map((p, i) => (/^\d{1,3}$/.test(p) ? <span key={i} style={{ textCombineUpright: "all" }}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>))}
  </>
);
const framesOf = (c: EssayCard) => Math.round(c.seconds * FPS);
export const clipEssayDuration = (p: ClipEssayProps) => p.cards.reduce((a, c) => a + framesOf(c), 0) + FPS;

const TONE: Record<EssayShot["tone"], { filter: string; overlay: string }> = {
  dark: { filter: "brightness(0.55) saturate(0.55) contrast(1.05)", overlay: "linear-gradient(rgba(10,20,40,0.55), rgba(0,0,0,0.6))" },
  dawn: { filter: "brightness(0.75) saturate(0.85)", overlay: "linear-gradient(rgba(30,20,40,0.45), rgba(60,30,10,0.35))" },
  warm: { filter: "brightness(0.9) saturate(1.1) sepia(0.18)", overlay: "linear-gradient(rgba(0,0,0,0.25), rgba(80,40,0,0.25))" },
};

const Shot: React.FC<{ shot: EssayShot; frames: number }> = ({ shot, frames }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 15, frames - 15, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, frames], [1.04, 1.14]);
  const t = TONE[shot.tone];
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {/* 素材は3秒なので、長いショットはゆっくり再生して映画のような動きにする */}
        <OffthreadVideo src={staticFile(shot.clip)} muted playbackRate={Math.min(1, 2.9 / (frames / FPS))} style={{ width: "100%", height: "100%", objectFit: "cover", filter: t.filter }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: t.overlay }} />
    </AbsoluteFill>
  );
};

const Card: React.FC<{ card: EssayCard; frames: number }> = ({ card, frames }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 14, frames - 12, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const drift = interpolate(frame, [0, frames], [10, -6]);
  if (card.title) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: op }}>
        <div
          style={{
            writingMode: "vertical-rl",
            fontFamily: MINCHO,
            fontWeight: 800,
            fontSize: 132,
            lineHeight: 1.35,
            letterSpacing: "0.12em",
            color: "#fff",
            textShadow: "0 0 30px rgba(0,0,0,0.7), 0 4px 14px rgba(0,0,0,0.6)",
            transform: `translateY(${drift}px)`,
          }}
        >
          {card.lines.map((l, i) => (
            <div key={i}><Tate text={l} /></div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <div
        style={{
          position: "absolute",
          top: 300,
          right: 150,
          writingMode: "vertical-rl",
          fontFamily: MINCHO,
          fontWeight: 500,
          fontSize: 66,
          lineHeight: 1.7,
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.96)",
          textShadow: "0 0 18px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.7)",
          transform: `translateY(${drift}px)`,
        }}
      >
        {card.lines.map((l, i) => (
          <div key={i}><Tate text={l} /></div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const ClipEssay: React.FC<ClipEssayProps> = ({ cards, shots, bgm, bgmVolume = 0.16 }) => {
  // ショットごとの開始フレームと長さ(同じshot番号が続く間は1本の映像)
  const starts: number[] = [];
  let acc = 0;
  cards.forEach((c) => {
    starts.push(acc);
    acc += framesOf(c);
  });
  const shotSpans = shots.map((_, si) => {
    const idx = cards.map((c, i) => (c.shot === si ? i : -1)).filter((i) => i >= 0);
    const from = starts[idx[0]];
    const last = idx[idx.length - 1];
    return { from, frames: starts[last] + framesOf(cards[last]) - from + (last === cards.length - 1 ? FPS : 12) };
  });
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.map((s, i) => (
        <Sequence key={`s${i}`} from={shotSpans[i].from} durationInFrames={shotSpans[i].frames}>
          <Shot shot={s} frames={shotSpans[i].frames} />
        </Sequence>
      ))}
      {cards.map((c, i) => (
        <Sequence key={`c${i}`} from={starts[i]} durationInFrames={framesOf(c)}>
          <Card card={c} frames={framesOf(c)} />
          {c.audio ? <Audio src={staticFile(c.audio)} /> : null}
        </Sequence>
      ))}
      {bgm ? <Audio src={staticFile(bgm)} volume={bgmVolume} /> : null}
    </AbsoluteFill>
  );
};
