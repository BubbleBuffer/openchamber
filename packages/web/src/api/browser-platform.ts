/** Browser callbacks that do not belong to a network domain. */
export interface DiagnosticsAPI {
  downloadLogs(): Promise<{ fileName: string; content: string }>;
}

export interface EditorAPI {
  openFile(path: string, line?: number, column?: number): Promise<void>;
  openDiff(original: string, modified: string, label?: string, options?: { line?: number; patch?: string }): Promise<void>;
}
