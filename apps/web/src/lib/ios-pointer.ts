import type { KeyboardEvent, PointerEvent } from 'react';

export function blockIosCallout(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function activateOnPointerUp(
  event: PointerEvent<HTMLElement>,
  action: () => void,
) {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }
  event.preventDefault();
  action();
}

export function activateOnEnterOrSpace(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export function isClipboardReadSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard && typeof navigator.clipboard.read === 'function')
  );
}
