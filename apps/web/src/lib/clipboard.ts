export function isClipboardReadSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard && typeof navigator.clipboard.read === 'function')
  );
}
