import React from "react";
import { Composition, Still, registerRoot } from "remotion";
import { ClipTalk, clipTalkDuration } from "./ClipTalk";
import { TalkCover } from "./TalkCover";

// トーク型リール専用の入口。Root.tsx は他の作業と共用で編集が重なりやすいため、こちらで単独登録する
const TalkRoot: React.FC = () => (
  <>
    <Composition
      id="ClipTalk"
      component={ClipTalk}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ title: "サンプル", scenes: [{ clip: "clips/kosodate/s01_1.mp4", lines: ["サンプル"], seconds: 4 }] }}
      calculateMetadata={({ props }) => ({ durationInFrames: clipTalkDuration(props) })}
    />
    <Still
      id="TalkCover"
      component={TalkCover}
      width={1080}
      height={1920}
      defaultProps={{ photo: "cover_photos/smile_02.jpg", badge: "3つのこと", titleTop: "この3つで、", titleMain: "毎日が楽しくなる", titleEn: "3 things that made my days fun" }}
    />
  </>
);

registerRoot(TalkRoot);
