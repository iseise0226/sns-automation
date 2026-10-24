import React from "react";
import { Composition, registerRoot } from "remotion";
import { ClipEssay, clipEssayDuration } from "./ClipEssay";

// 縦書き文章リール専用の入口(Root.tsx は他の作業と共用のため単独で登録する)
const EssayRoot: React.FC = () => (
  <Composition
    id="ClipEssay"
    component={ClipEssay}
    durationInFrames={900}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ cards: [{ lines: ["サンプル"], seconds: 4, shot: 0 }], shots: [{ clip: "clips/kosodate/s01_1.mp4", tone: "dark" }] }}
    calculateMetadata={({ props }) => ({ durationInFrames: clipEssayDuration(props) })}
  />
);

registerRoot(EssayRoot);
