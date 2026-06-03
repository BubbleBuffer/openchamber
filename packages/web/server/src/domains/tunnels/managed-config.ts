import type { ManagedTunnelConfig, ManagedTunnelEntry } from "./types.js";

export interface ManagedTunnelConfigRuntimeDeps {
  fsPromises: typeof import("fs/promises");
  path: typeof import("path");
  normalizeManagedRemoteTunnelHostname: (value: unknown) => string | undefined;
  normalizeManagedRemoteTunnelPresets: (value: unknown) => Array<{ id: string; name: string; hostname: string }> | undefined;
  constants: {
    CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH: string;
    CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH: string;
    CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION: number;
  };
}

export interface ManagedTunnelConfigRuntime {
  readManagedRemoteTunnelConfigFromDisk(): Promise<ManagedTunnelConfig>;
  syncManagedRemoteTunnelConfigWithPresets(presets: unknown): Promise<void>;
  upsertManagedRemoteTunnelToken(params: {
    id: string;
    name: string;
    hostname: string;
    token: string;
  }): Promise<void>;
  resolveManagedRemoteTunnelToken(params: {
    presetId?: string;
    hostname?: string;
  }): Promise<string>;
}

export const createManagedTunnelConfigRuntime = (
  deps: ManagedTunnelConfigRuntimeDeps,
): ManagedTunnelConfigRuntime => {
  const { fsPromises, path, normalizeManagedRemoteTunnelHostname, normalizeManagedRemoteTunnelPresets, constants } = deps;

  const {
    CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH,
    CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH,
    CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
  } = constants;

  let persistManagedRemoteTunnelConfigLock = Promise.resolve();

  const sanitizeManagedRemoteTunnelConfigEntries = (value: unknown): ManagedTunnelEntry[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    const result: ManagedTunnelEntry[] = [];
    const seenIds = new Set<string>();
    const seenHostnames = new Set<string>();
    for (const entry of value) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const e = entry as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id.trim() : "";
      const name = typeof e.name === "string" ? e.name.trim() : "";
      const hostname = normalizeManagedRemoteTunnelHostname(e.hostname) ?? "";
      const token = typeof e.token === "string" ? e.token.trim() : "";
      const updatedAt = Number.isFinite(e.updatedAt) ? (e.updatedAt as number) : Date.now();

      if (!id || !name || !hostname || !token) {
        continue;
      }
      if (seenIds.has(id) || seenHostnames.has(hostname)) {
        continue;
      }

      seenIds.add(id);
      seenHostnames.add(hostname);
      result.push({ id, name, hostname, token, updatedAt });
    }

    return result;
  };

  const writeManagedRemoteTunnelConfigToDisk = async (data: ManagedTunnelConfig): Promise<void> => {
    await fsPromises.mkdir(path.dirname(CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH), { recursive: true });
    await fsPromises.writeFile(
      CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH,
      JSON.stringify(data, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
  };

  const migrateManagedRemoteTunnelConfigFromLegacyFile = async (): Promise<ManagedTunnelConfig> => {
    try {
      const legacyRaw = await fsPromises.readFile(CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH, "utf8");
      const parsed = JSON.parse(legacyRaw) as Record<string, unknown>;
      const tunnels = sanitizeManagedRemoteTunnelConfigEntries(parsed?.tunnels);
      const migrated: ManagedTunnelConfig = {
        version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
        tunnels,
      };
      await writeManagedRemoteTunnelConfigToDisk(migrated);
      return migrated;
    } catch (error) {
      const err = error as NodeJS.ErrnoException | null;
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return { version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION, tunnels: [] };
      }
      console.warn("Failed to migrate legacy named tunnel config file:", error);
      return { version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION, tunnels: [] };
    }
  };

  const readManagedRemoteTunnelConfigFromDisk = async (): Promise<ManagedTunnelConfig> => {
    try {
      const raw = await fsPromises.readFile(CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") {
        return { version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION, tunnels: [] };
      }

      return {
        version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
        tunnels: sanitizeManagedRemoteTunnelConfigEntries(parsed.tunnels),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException | null;
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return migrateManagedRemoteTunnelConfigFromLegacyFile();
      }
      console.warn("Failed to read managed remote tunnel config file:", error);
      return { version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION, tunnels: [] };
    }
  };

  const updateManagedRemoteTunnelConfig = async (
    mutate: (current: ManagedTunnelConfig) => Partial<ManagedTunnelConfig>,
  ): Promise<void> => {
    persistManagedRemoteTunnelConfigLock = persistManagedRemoteTunnelConfigLock.then(async () => {
      const current = await readManagedRemoteTunnelConfigFromDisk();
      const next = mutate({
        version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
        tunnels: sanitizeManagedRemoteTunnelConfigEntries(current.tunnels),
      });

      await writeManagedRemoteTunnelConfigToDisk({
        version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
        tunnels: sanitizeManagedRemoteTunnelConfigEntries(next?.tunnels),
      });
    });

    return persistManagedRemoteTunnelConfigLock;
  };

  const syncManagedRemoteTunnelConfigWithPresets = async (presets: unknown): Promise<void> => {
    const sanitizedPresets = normalizeManagedRemoteTunnelPresets(presets) || [];

    await updateManagedRemoteTunnelConfig((current) => {
      const byId = new Map(current.tunnels.map((entry) => [entry.id, entry]));
      const byHostname = new Map(current.tunnels.map((entry) => [entry.hostname, entry]));

      const nextTunnels: ManagedTunnelEntry[] = [];
      for (const preset of sanitizedPresets) {
        const existing = byId.get(preset.id) || byHostname.get(preset.hostname) || null;
        if (!existing) {
          continue;
        }

        nextTunnels.push({
          ...existing,
          id: preset.id,
          name: preset.name,
          hostname: preset.hostname,
        });
      }

      return {
        version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
        tunnels: nextTunnels,
      };
    });
  };

  const upsertManagedRemoteTunnelToken = async ({
    id,
    name,
    hostname,
    token,
  }: {
    id: string;
    name: string;
    hostname: string;
    token: string;
  }): Promise<void> => {
    if (typeof id !== "string" || typeof name !== "string" || typeof hostname !== "string" || typeof token !== "string") {
      return;
    }
    const normalizedId = id.trim();
    const normalizedName = name.trim();
    const normalizedHostname = normalizeManagedRemoteTunnelHostname(hostname) ?? "";
    const normalizedToken = token.trim();
    if (!normalizedId || !normalizedName || !normalizedHostname || !normalizedToken) {
      return;
    }

    await updateManagedRemoteTunnelConfig((current) => {
      const withoutConflicts = current.tunnels.filter(
        (entry) => entry.id !== normalizedId && entry.hostname !== normalizedHostname,
      );
      withoutConflicts.push({
        id: normalizedId,
        name: normalizedName,
        hostname: normalizedHostname,
        token: normalizedToken,
        updatedAt: Date.now(),
      });

      return {
        version: CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
        tunnels: withoutConflicts,
      };
    });
  };

  const resolveManagedRemoteTunnelToken = async ({
    presetId,
    hostname,
  }: {
    presetId?: string;
    hostname?: string;
  }): Promise<string> => {
    const normalizedPresetId = typeof presetId === "string" ? presetId.trim() : "";
    const normalizedHostname = normalizeManagedRemoteTunnelHostname(hostname) ?? "";
    const config = await readManagedRemoteTunnelConfigFromDisk();

    if (normalizedPresetId) {
      const byId = config.tunnels.find((entry) => entry.id === normalizedPresetId);
      if (byId?.token) {
        return byId.token;
      }
    }

    if (normalizedHostname) {
      const byHostname = config.tunnels.find((entry) => entry.hostname === normalizedHostname);
      if (byHostname?.token) {
        return byHostname.token;
      }
    }

    return "";
  };

  return {
    readManagedRemoteTunnelConfigFromDisk,
    syncManagedRemoteTunnelConfigWithPresets,
    upsertManagedRemoteTunnelToken,
    resolveManagedRemoteTunnelToken,
  };
};
