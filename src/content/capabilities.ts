export interface PlaybackCapabilities {
  browserTtsAvailable: boolean;
  pointerEventsSupported: boolean;
  remoteAudioPlaybackLikelyAvailable: boolean;
}

export function detectPlaybackCapabilities(input?: {
  hasSpeechSynthesis?: boolean;
  hasSpeechSynthesisUtterance?: boolean;
  hasPointerEvent?: boolean;
  hasAudioElement?: boolean;
}): PlaybackCapabilities {
  const hasSpeechSynthesis = input?.hasSpeechSynthesis ?? typeof speechSynthesis !== 'undefined';
  const hasSpeechSynthesisUtterance = input?.hasSpeechSynthesisUtterance ?? typeof SpeechSynthesisUtterance !== 'undefined';
  const hasPointerEvent = input?.hasPointerEvent ?? typeof PointerEvent !== 'undefined';
  const hasAudioElement = input?.hasAudioElement ?? typeof Audio !== 'undefined';

  return {
    browserTtsAvailable: hasSpeechSynthesis && hasSpeechSynthesisUtterance,
    pointerEventsSupported: hasPointerEvent,
    remoteAudioPlaybackLikelyAvailable: hasAudioElement
  };
}
