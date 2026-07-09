import { Window as HappyDomWindow } from "happy-dom";

// Only set up DOM globals once in non-isolated runs
let _setup = false;
export function ensureDom(): void {
  if (_setup) return;
  _setup = true;
  const win = new HappyDomWindow();
  // happy-dom's Window is structurally compatible with the lib.dom Window for
  // the surfaces stores touch. Force the cast to bridge the gaps that exist in
  // happy-dom (e.g. ScrollTimeline, ViewTimeline, __TAURI_EVENT_PLUGIN_INTERNALS__).
  globalThis.window = win as unknown as Window & typeof globalThis;
  globalThis.document = win.document as unknown as Document;
}
