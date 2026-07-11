// Content-script entry: the only file that touches the extension APIs in
// the page context. All real behavior lives in ui/overlay.ts (testable in
// jsdom); this is just the toggle glue.
//
// Lifecycle: background.ts pings the tab with ql-toggle; if nobody answers,
// it injects this bundle, which activates immediately and starts listening.
// Whether the overlay is on is read from the DOM (isActive), not a variable,
// so a re-injected script after an extension reload can still tear down
// leftovers from its dead predecessor.

import { browserAPI } from './browserAPI.js';
import { isActive, setup, teardown } from './ui/overlay.js';

declare global {
  interface Window {
    __quotelinkWired?: true;
  }
}

export const TOGGLE_MESSAGE = 'ql-toggle';

function toggle(): void {
  if (isActive(document)) {
    teardown(document);
  } else {
    setup(document, { onClose: () => teardown(document) });
  }
}

if (!window.__quotelinkWired) {
  window.__quotelinkWired = true;
  browserAPI().runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string } | null)?.type === TOGGLE_MESSAGE) toggle();
  });
  toggle();
}
