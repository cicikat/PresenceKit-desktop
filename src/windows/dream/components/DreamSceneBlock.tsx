interface DreamSceneBlockProps {
  text: string;
}

export function DreamSceneBlock({ text }: DreamSceneBlockProps) {
  return (
    <div className="dream-scene-block">
      <div className="dream-scene-block__line" />
      <span className="dream-scene-block__text">{text}</span>
      <div className="dream-scene-block__line" />
    </div>
  );
}
