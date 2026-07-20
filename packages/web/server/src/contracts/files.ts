import { parseJsonArray, parseJsonBoolean, parseJsonNumber, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const FS_ERROR_CODES = ["fs_invalid_path", "fs_invalid_content", "fs_not_found", "fs_forbidden", "fs_conflict", "fs_internal_error"] as const;
export type FsErrorCode = (typeof FS_ERROR_CODES)[number];
export type FsPathRequest = { path: string };
export type FsWriteRequest = FsPathRequest & { content: string };
export type FsRenameRequest = { oldPath: string; newPath: string };
export type FsDirectoryEntry = { name: string; path: string; isDirectory: boolean };
export type FsListResponse = { directory: string; entries: FsDirectoryEntry[] };
export type FsStatResponse = { path: string; isFile: boolean; size: number; mtimeMs?: number };
export type FsMutationResponse = { success: boolean; path?: string };
export type FsRawQuery = FsPathRequest & { download: boolean };
export type FsListQuery = { path?: string; respectGitignore: boolean };
export type FsExecRequest = { commands: string[]; cwd: string; background: boolean };
export type FsExecResponse = { jobId: string; status: "queued" | "running" | "done"; success?: boolean; results?: Array<{ command: string; success: boolean; exitCode?: number; stdout: string; stderr: string; error?: string }> };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const path = (value: unknown): ParseResult<string> => {
  const result = parseJsonString(value);
  const trimmed = result.ok ? result.value.trim() : "";
  return trimmed.length > 0 ? { ok: true, value: trimmed } : invalid("path is required");
};

export function parseFsPathRequest(value: unknown): ParseResult<FsPathRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const target = path(object.value.path); return target.ok ? { ok: true, value: { path: target.value } } : target;
}
export function parseFsPathQuery(value: unknown): ParseResult<FsPathRequest> {
  return parseFsPathRequest(value);
}
export function parseFsRawQuery(value: unknown): ParseResult<FsRawQuery> {
  const request = parseFsPathRequest(value); if (!request.ok) return request;
  const object = value as Record<string, unknown>;
  if (object.download !== undefined && object.download !== "true" && object.download !== "false") return invalid("invalid download flag");
  return { ok: true, value: { path: request.value.path, download: object.download === "true" } };
}
export function parseFsListQuery(value: unknown): ParseResult<FsListQuery> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.path !== undefined && !path(object.value.path).ok) return invalid("invalid path");
  if (object.value.respectGitignore !== undefined && object.value.respectGitignore !== "true" && object.value.respectGitignore !== "false") return invalid("invalid respectGitignore flag");
  return { ok: true, value: { ...(typeof object.value.path === "string" ? { path: object.value.path } : {}), respectGitignore: object.value.respectGitignore === "true" } };
}
export function parseFsWriteRequest(value: unknown): ParseResult<FsWriteRequest> {
  const request = parseFsPathRequest(value); if (!request.ok) return request;
  const content = parseJsonString((value as Record<string, unknown>).content);
  return content.ok ? { ok: true, value: { ...request.value, content: content.value } } : invalid("content is required");
}
export function parseFsRenameRequest(value: unknown): ParseResult<FsRenameRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const oldPath = path(object.value.oldPath); const newPath = path(object.value.newPath);
  return oldPath.ok && newPath.ok ? { ok: true, value: { oldPath: oldPath.value, newPath: newPath.value } } : invalid("oldPath and newPath are required");
}
export function parseFsExecRequest(value: unknown): ParseResult<FsExecRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const commands = parseJsonArray(object.value.commands); const cwd = path(object.value.cwd);
  if (!commands.ok || commands.value.length === 0 || !commands.value.every((command) => typeof command === "string") || !cwd.ok || (object.value.background !== undefined && !parseJsonBoolean(object.value.background).ok)) return invalid("invalid exec request");
  return { ok: true, value: { commands: commands.value as string[], cwd: cwd.value, background: object.value.background === true } };
}
export function parseFsExecResponse(value: unknown): ParseResult<FsExecResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const jobId = parseJsonString(object.value.jobId); const status = object.value.status;
  if (!jobId.ok || (status !== "queued" && status !== "running" && status !== "done")) return invalid("invalid exec response");
  if (object.value.success !== undefined && !parseJsonBoolean(object.value.success).ok) return invalid("invalid exec response");
  if (object.value.results !== undefined && !parseJsonArray(object.value.results).ok) return invalid("invalid exec response");
  return { ok: true, value: object.value as FsExecResponse };
}
export function parseFileListResponse(value: unknown): ParseResult<FsListResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const directory = path(object.value.directory ?? object.value.path); const entries = parseJsonArray(object.value.entries);
  if (!directory.ok || !entries.ok) return invalid("invalid file list response");
  const parsed: FsDirectoryEntry[] = [];
  for (const entry of entries.value) {
    const item = parseJsonObject(entry); if (!item.ok) return invalid("invalid directory entry");
    const name = parseJsonString(item.value.name); const entryPath = path(item.value.path); const isDirectory = parseJsonBoolean(item.value.isDirectory);
    if (!name.ok || !entryPath.ok || !isDirectory.ok) return invalid("invalid directory entry");
    parsed.push({ name: name.value, path: entryPath.value, isDirectory: isDirectory.value });
  }
  return { ok: true, value: { directory: directory.value, entries: parsed } };
}
export function parseStatResponse(value: unknown): ParseResult<FsStatResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const target = path(object.value.path); const isFile = parseJsonBoolean(object.value.isFile); const size = parseJsonNumber(object.value.size);
  if (!target.ok || !isFile.ok || !size.ok || (object.value.mtimeMs !== undefined && !parseJsonNumber(object.value.mtimeMs).ok)) return invalid("invalid stat response");
  return { ok: true, value: { path: target.value, isFile: isFile.value, size: size.value, ...(object.value.mtimeMs === undefined ? {} : { mtimeMs: object.value.mtimeMs as number }) } };
}
export function parseFsMutationResponse(value: unknown): ParseResult<FsMutationResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const success = parseJsonBoolean(object.value.success); if (!success.ok || (object.value.path !== undefined && !path(object.value.path).ok)) return invalid("invalid file mutation response");
  return { ok: true, value: { success: success.value, ...(typeof object.value.path === "string" ? { path: object.value.path } : {}) } };
}
