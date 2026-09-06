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
import { EDITORIAL } from "./editorialTheme";

const { fontFamily: MARU } = loadMaru();
const { fontFamily: SERIF } = loadPlayfair();

// 行数の上限を超えた行は縮小もはみ出しもさせず、単に捨てる
const lines = (text: string | undefined, max: number) =>
  String(text || "")
    .split("\n")
    .slice(0, max);

// B-rollに固定のグレーディングをかける層。どの素材でも同じ色に着地させる
const Graded: React.FC<{ video?: string; zoomTo: number }> = ({ video, zoomTo }) => {
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
          ✤
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
