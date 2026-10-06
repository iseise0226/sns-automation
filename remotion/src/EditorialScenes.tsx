import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { useEditorial } from "./editorialTheme";
import { LineIcon } from "./LineIcons";
import { loadFont as loadMincho } from "@remotion/google-fonts/ShipporiMincho";

const { fontFamily: MINCHO } = loadMincho("normal", { weights: ["800"] });

const { fontFamily: MARU } = loadMaru();
const { fontFamily: SERIF } = loadPlayfair();

// 行数の上限を超えた行は縮小もはみ出しもさせず、単に捨てる
const lines = (text: string | undefined, max: number) =>
  String(text || "")
    .split("\n")
    .slice(0, max);

// B-rollに固定のグレーディングをかける層。どの素材でも同じ色に着地させる
const Graded: React.FC<{ video?: string; zoomTo: number }> = ({ video, zoomTo }) => {
  const EDITORIAL = useEditorial();
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 999], [1, zoomTo], { extrapolateRight: "clamp" });
  return (
    <>
      {video ? (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", transform: `scale(${zoom})` }}>
          <OffthreadVideo
            src={staticFile(video)}
            muted
            loop
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: EDITORIAL.filter }}
          />
        </div>
      ) : null}
      <AbsoluteFill style={{ backgroundColor: EDITORIAL.warm }} />
      <AbsoluteFill style={{ background: EDITORIAL.topFade }} />
      <AbsoluteFill style={{ background: EDITORIAL.bottomFade }} />
    </>
  );
};

// 表紙(0番スロット)。グリッドに並ぶ顔になるので、この型は絶対に崩さない
export const EditorialCover: React.FC<{ video?: string; titleEn?: string[]; headline?: string }> = ({
  video,
  titleEn,
  headline,
}) => {
  const EDITORIAL = useEditorial();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const en = spring({ frame: frame - 6, fps, config: { damping: 200, stiffness: 100 } });
  const box = spring({ frame: frame - 12, fps, config: { damping: 200, stiffness: 100 } });
  const en1 = (titleEn && titleEn[0]) || "";
  const en2 = (titleEn && titleEn[1]) || "";
  return (
    <>
      <Graded video={video} zoomTo={1.06} />
      <div style={{ position: "absolute", left: 539, top: 0, width: 2, height: 540, background: EDITORIAL.LINE }} />
      <div
        style={{
          position: "absolute",
          left: 122,
          right: 122,
          top: 540,
          bottom: 346,
          border: `2px solid ${EDITORIAL.LINE}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 122,
          right: 122,
          top: 670,
          textAlign: "center",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 104,
          lineHeight: 1.1,
          color: "#ffffff",
          opacity: en,
          transform: `translateY(${(1 - en) * -18}px)`,
        }}
      >
        {en1}
      </div>
      <div
        style={{
          position: "absolute",
          left: 122,
          right: 122,
          top: 806,
          textAlign: "center",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: 112,
          lineHeight: 1.1,
          color: EDITORIAL.GOLD,
          opacity: en,
          transform: `translateY(${(1 - en) * -18}px)`,
        }}
      >
        {en2}
      </div>
      <div
        style={{
          position: "absolute",
          left: 223,
          right: 223,
          top: 1066,
          opacity: box,
          transform: `translateY(${(1 - box) * 24}px)`,
        }}
      >
        <div style={{ background: EDITORIAL.TERRA, padding: "54px 36px", textAlign: "center" }}>
          {lines(headline, 3).map((line, i) => (
            <div
              key={i}
              style={{ fontFamily: MARU, fontWeight: 900, fontSize: 54, lineHeight: 1.62, color: "#ffffff" }}
            >
              {line}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 56,
            textAlign: "center",
            fontFamily: SERIF,
            fontSize: 68,
            lineHeight: 1,
            color: "#ffffff",
          }}
        >
          ✳
        </div>
      </div>
    </>
  );
};

// 実写カット。表紙が「中央に箱」なのに対し、こちらは「下三分の一に横帯」
export const EditorialCut: React.FC<{ video?: string; titleEn?: string[]; headline?: string }> = ({
  video,
  titleEn,
  headline,
}) => {
  const EDITORIAL = useEditorial();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  const label = (titleEn && titleEn[0]) || "";
  return (
    <>
      <Graded video={video} zoomTo={1.08} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 150,
          textAlign: "center",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 44,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.9)",
          opacity: s,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1180,
          height: 140,
          background: "linear-gradient(180deg, rgba(40,28,22,0) 0%, rgba(40,28,22,0.35) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1320,
          height: 300,
          background: EDITORIAL.TERRA,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 90px",
          opacity: s,
          transform: `translateY(${(1 - s) * 24}px)`,
        }}
      >
        <div style={{ textAlign: "center" }}>
          {lines(headline, 2).map((line, i) => (
            <div
              key={i}
              style={{ fontFamily: MARU, fontWeight: 900, fontSize: 76, lineHeight: 1.35, color: "#ffffff" }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// 明朝の大テロップ(satoshi_mindset)。暗く落とした実写の上に、言い切りの一文を大きく置く。
// 右上に縦書きの一言(内省の余白)。強調語(**…**)だけ金色。
const renderGold = (text: string, gold: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <span key={i} style={{ color: gold }}>
        {p.slice(2, -2)}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );

export const MinchoTelop: React.FC<{ video?: string; headline?: string; vertical?: string }> = ({
  video,
  headline,
  vertical,
}) => {
  const E = useEditorial();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 3, fps, config: { damping: 13, stiffness: 170, mass: 0.7 } });
  const vert = spring({ frame: frame - 16, fps, config: { damping: 200, stiffness: 90 } });
  const flash = interpolate(frame, [0, 4], [0.55, 0], { extrapolateRight: "clamp" });
  const outline = "0 0 6px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.65), 4px 4px 0 rgba(0,0,0,0.55)";
  return (
    <>
      <Graded video={video} zoomTo={1.1} />
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash }} />
      {vertical ? (
        <div
          style={{
            position: "absolute",
            right: 92,
            top: 180,
            height: 640,
            writingMode: "vertical-rl",
            fontFamily: MINCHO,
            fontWeight: 800,
            fontSize: 54,
            letterSpacing: "0.32em",
            color: "rgba(255,255,255,0.92)",
            textShadow: outline,
            opacity: vert,
            transform: `translateY(${(1 - vert) * -20}px)`,
          }}
        >
          {vertical}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 1010,
          textAlign: "center",
          opacity: pop,
          transform: `scale(${0.9 + 0.1 * pop})`,
        }}
      >
        {lines(headline, 2).map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: MINCHO,
              fontWeight: 800,
              fontSize: 128,
              lineHeight: 1.22,
              color: "#ffffff",
              textShadow: outline,
              letterSpacing: "0.02em",
            }}
          >
            {renderGold(line, E.GOLD)}
          </div>
        ))}
      </div>
    </>
  );
};

// 番号付き解説カード(1枚=1ポイント)。実写の上に濃い箱を置き、番号・見出し・アイコン・一言・補足の順に積む。
export const NumberedCard: React.FC<{
  video?: string;
  num?: string;
  title?: string;
  text?: string;
  note?: string;
  icon?: string;
}> = ({ video, num, title, text, note, icon }) => {
  const E = useEditorial();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = spring({ frame: frame - 3, fps, config: { damping: 15, stiffness: 140, mass: 0.7 } });
  const numIn = spring({ frame: frame - 10, fps, config: { damping: 200, stiffness: 90 } });
  const iconIn = spring({ frame: frame - 18, fps, config: { damping: 11, stiffness: 160, mass: 0.6 } });
  const textIn = interpolate(frame, [26, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const noteIn = interpolate(frame, [38, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Graded video={video} zoomTo={1.1} />
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 300,
          padding: "52px 56px 58px",
          background: `${E.WARM_INK}eb`,
          borderRadius: 18,
          border: `2px solid ${E.GOLD}`,
          opacity: card,
          transform: `translateY(${(1 - card) * 40}px) scale(${0.96 + 0.04 * card})`,
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: numIn, transform: `translateX(${(1 - numIn) * -40}px)` }}>
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontWeight: 600,
              fontSize: 150,
              lineHeight: 1,
              color: E.GOLD,
            }}
          >
            {num}
          </div>
          <div style={{ flex: 1, height: 3, background: E.GOLD, opacity: 0.8 }} />
        </div>
        <div style={{ marginTop: 18, fontFamily: MARU, fontWeight: 900, fontSize: 78, lineHeight: 1.25, color: "#ffffff", textAlign: "left" }}>
          {lines(title, 2).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div
          style={{
            margin: "34px auto 0",
            width: 220,
            height: 220,
            borderRadius: "50%",
            border: `4px solid ${E.GOLD}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${iconIn})`,
          }}
        >
          <LineIcon name={icon} size={130} color={E.GOLD} strokeWidth={3.2} />
        </div>
        <div style={{ marginTop: 34, opacity: textIn }}>
          {lines(text, 2).map((l, i) => (
            <div key={i} style={{ fontFamily: MARU, fontWeight: 800, fontSize: 56, lineHeight: 1.5, color: "#ffffff" }}>
              {l}
            </div>
          ))}
        </div>
        {note ? (
          <div style={{ marginTop: 28, opacity: noteIn }}>
            <span
              style={{
                display: "inline-block",
                background: E.TERRA,
                borderRadius: 999,
                padding: "10px 36px",
                fontFamily: MARU,
                fontWeight: 800,
                fontSize: 40,
                color: "#ffffff",
              }}
            >
              {note.replace(/\*\*/g, "")}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
};
