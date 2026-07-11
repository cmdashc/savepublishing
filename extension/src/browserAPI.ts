// Firefox's `browser.*` is Promise-native; Chrome's MV3 `chrome.*` already
// resolves without a callback, so preferring `browser` when it exists is
// enough to run every `await chrome.foo()` call unmodified in both browsers
// — no polyfill dependency needed. Call this inside functions, not at
// module scope, so files that also load outside a real extension (see
// share/targets.ts's defaultDeps) stay safe to import.
export function browserAPI(): typeof chrome {
  return (globalThis as { browser?: typeof chrome }).browser ?? chrome;
}
