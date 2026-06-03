const normalizeProjectPathForId = (value: string): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/\/+$/g, "") || value;
};

export const createProjectIdFromPath = (projectPath: string): string => {
  const normalized = normalizeProjectPathForId(projectPath).trim();
  if (!normalized) {
    return "";
  }

  return `path_${Buffer.from(normalized, "utf8").toString("base64url")}`;
};
