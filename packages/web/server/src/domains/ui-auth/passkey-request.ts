import type { Request } from "express";

function normalizeHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0
      ? trimmed.slice(1, end).toLowerCase()
      : trimmed.toLowerCase();
  }

  const colonIndex = trimmed.indexOf(":");
  return (colonIndex >= 0 ? trimmed.slice(0, colonIndex) : trimmed).toLowerCase();
}

function getForwardedHost(req: Request): string {
  return typeof req.headers["x-forwarded-host"] === "string"
    ? req.headers["x-forwarded-host"].split(",")[0].trim()
    : "";
}

export function getCurrentRequestOrigin(req: Request): string {
  const forwardedProto =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0].trim().toLowerCase()
      : "";
  const socket = req.socket as typeof req.socket & { encrypted?: boolean };
  const protocol =
    forwardedProto || (socket.encrypted ? "https" : "http");
  const host =
    getForwardedHost(req) ||
    (typeof req.headers.host === "string" ? req.headers.host.trim() : "");

  return host ? `${protocol}://${host}` : "";
}

export function getCurrentRpId(req: Request): string {
  const host =
    getForwardedHost(req) ||
    (typeof req.headers.host === "string" ? req.headers.host.trim() : "");
  return normalizeHost(host || req.hostname || "");
}
