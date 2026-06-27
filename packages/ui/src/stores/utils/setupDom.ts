import { Window } from "happy-dom";

// Only set up DOM globals once in non-isolated runs
let _setup = false;
export function ensureDom(): void {
  if (_setup) return;
  _setup = true;
  const win = new Window();
  globalThis.window = win as unknown as Window & typeof globalThis;
  globalThis.document = win.document;
}
