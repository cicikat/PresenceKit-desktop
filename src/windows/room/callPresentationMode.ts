/** Audio owns subtitles only when both the service and this scene's auto-play are enabled. */
export function shouldUseCallAudio(ttsEnabled: boolean, videoCallAutoPlay: boolean): boolean {
  return ttsEnabled === true && videoCallAutoPlay === true;
}
