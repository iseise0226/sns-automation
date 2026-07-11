import { Composition, Still } from "remotion";
import { MyVideo } from "./MyVideo";
import { SlideVideo } from "./SlideVideo";
import { RichSlideVideo } from "./RichSlideVideo";
import { Thumbnail } from "./Thumbnail";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="MyVideo"
      component={MyVideo}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        scenes: [
          { image: "", audio: "", narration: "", durationInSeconds: 5 },
        ],
      }}
      calculateMetadata={({ props }) => {
        const fps = 30;
        const total = props.scenes.reduce(
          (sum: number, s: any) => sum + Math.round(s.durationInSeconds * fps),
          0
        );
        return { durationInFrames: total };
      }}
    />
    <Composition
      id="SlideVideo"
      component={SlideVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        slides: [
          { type: "title" as const, title: "サンプル", durationInSeconds: 5 },
        ],
      }}
      calculateMetadata={({ props }) => {
        const fps = 30;
        const total = props.slides.reduce(
          (sum: number, s: any) => sum + Math.round(s.durationInSeconds * fps),
          0
        );
        return { durationInFrames: total };
      }}
    />
    <Composition
      id="RichSlideVideo"
      component={RichSlideVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        scenes: [
          {
            type: "title" as const,
            beats: [{ kind: "big" as const, text: "サンプル", sub: "サンプル" }],
            durationInSeconds: 5,
          },
        ],
      }}
      calculateMetadata={({ props }) => {
        const fps = 30;
        const total = props.scenes.reduce(
          (sum: number, s: any) => sum + Math.round(s.durationInSeconds * fps),
          0
        );
        return { durationInFrames: total };
      }}
    />
    <Still
      id="Thumbnail"
      component={Thumbnail}
      width={1280}
      height={720}
      defaultProps={{
        text: "サンプル\n**サムネイル**",
        kicker: "サンプル",
        footer: "伊勢 聖",
        accentIndex: 0,
      }}
    />
    </>
  );
};
