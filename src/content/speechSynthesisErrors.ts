export function shouldIgnoreSpeechSynthesisError(event: { error?: string | null } | null | undefined): boolean {
  const errorCode = (event?.error || '').toLowerCase();
  return errorCode === 'canceled' || errorCode === 'cancelled' || errorCode === 'interrupted';
}
