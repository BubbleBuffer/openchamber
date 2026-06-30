import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

// ============================================================================
// Legacy migration helper
// Copies valid model-preference fields from a legacy `ui-store` persisted
// envelope into the new `model-preferences-store` envelope.
// Returns `true` only when a new envelope was written.
// ============================================================================

export const migrateModelPreferencesFromLegacyUIStore = (
  storage: Storage = getSafeStorage(),
): boolean => {
  try {
    // If the new store already has data, do not overwrite it.
    const existing = storage.getItem('model-preferences-store');
    if (existing !== null) {
      return false;
    }

    // Read the legacy ui-store envelope.
    const legacyRaw = storage.getItem('ui-store');
    if (legacyRaw === null) {
      return false;
    }

    const envelope = JSON.parse(legacyRaw) as { state?: unknown; version?: unknown };
    if (!envelope || !envelope.state || typeof envelope.state !== 'object') {
      return false;
    }

    const state = envelope.state as Record<string, unknown>;

    // --- favoriteModels ---
    const rawFavoriteModels = state.favoriteModels;
    let favoriteModels: Array<{ providerID: string; modelID: string }> = [];
    if (Array.isArray(rawFavoriteModels)) {
      favoriteModels = rawFavoriteModels.filter(
        (item): item is { providerID: string; modelID: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.providerID === 'string' &&
          item.providerID.length > 0 &&
          typeof item.modelID === 'string' &&
          item.modelID.length > 0,
      );
    }

    // --- hiddenModels ---
    const rawHiddenModels = state.hiddenModels;
    let hiddenModels: Array<{ providerID: string; modelID: string }> = [];
    if (Array.isArray(rawHiddenModels)) {
      hiddenModels = rawHiddenModels.filter(
        (item): item is { providerID: string; modelID: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.providerID === 'string' &&
          item.providerID.length > 0 &&
          typeof item.modelID === 'string' &&
          item.modelID.length > 0,
      );
    }

    // --- collapsedModelProviders ---
    const rawCollapsed = state.collapsedModelProviders;
    let collapsedModelProviders: string[] = [];
    if (Array.isArray(rawCollapsed)) {
      collapsedModelProviders = rawCollapsed.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      );
    }

    // --- recentModels ---
    const rawRecentModels = state.recentModels;
    let recentModels: Array<{ providerID: string; modelID: string }> = [];
    if (Array.isArray(rawRecentModels)) {
      recentModels = rawRecentModels.filter(
        (item): item is { providerID: string; modelID: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.providerID === 'string' &&
          item.providerID.length > 0 &&
          typeof item.modelID === 'string' &&
          item.modelID.length > 0,
      );
    }

    // --- recentEfforts ---
    const rawRecentEfforts = state.recentEfforts;
    let recentEfforts: Record<string, string[]> = {};
    if (typeof rawRecentEfforts === 'object' && rawRecentEfforts !== null) {
      for (const [key, value] of Object.entries(rawRecentEfforts)) {
        if (Array.isArray(value)) {
          recentEfforts[key] = value.filter((v): v is string => typeof v === 'string');
        } else {
          recentEfforts[key] = [];
        }
      }
    }

    // Write the new envelope.
    const newEnvelope = {
      state: {
        favoriteModels,
        hiddenModels,
        collapsedModelProviders,
        recentModels,
        recentEfforts,
      },
      version: 1,
    };

    storage.setItem('model-preferences-store', JSON.stringify(newEnvelope));
    return true;
  } catch {
    // Swallow any JSON/storage errors so the store still loads cleanly.
    return false;
  }
};

// ============================================================================
// Module-load migration
// Runs once at module import time, before the store is defined.
// ============================================================================
migrateModelPreferencesFromLegacyUIStore();

// ============================================================================
// Model Preferences Store
// ============================================================================

export type ModelRef = { providerID: string; modelID: string };

type ModelPreferencesState = {
  favoriteModels: ModelRef[];
  hiddenModels: ModelRef[];
  collapsedModelProviders: string[];
  recentModels: ModelRef[];
  recentEfforts: Record<string, string[]>;
  toggleFavoriteModel: (providerID: string, modelID: string) => void;
  toggleHiddenModel: (providerID: string, modelID: string) => void;
  isHiddenModel: (providerID: string, modelID: string) => boolean;
  hideAllModels: (providerID: string, modelIDs: string[]) => void;
  showAllModels: (providerID: string) => void;
  toggleModelProviderCollapsed: (providerID: string) => void;
  isFavoriteModel: (providerID: string, modelID: string) => boolean;
  addRecentModel: (providerID: string, modelID: string) => void;
  addRecentEffort: (providerID: string, modelID: string, variant: string | undefined) => void;
};

export const useModelPreferencesStore = create<ModelPreferencesState>()(
  persist(
    (set, get) => ({
      favoriteModels: [],
      hiddenModels: [],
      collapsedModelProviders: [],
      recentModels: [],
      recentEfforts: {},

      toggleFavoriteModel: (providerID, modelID) => {
        set((state) => {
          const exists = state.favoriteModels.some(
            (fav) => fav.providerID === providerID && fav.modelID === modelID,
          );

          if (exists) {
            return {
              favoriteModels: state.favoriteModels.filter(
                (fav) => !(fav.providerID === providerID && fav.modelID === modelID),
              ),
            };
          }
          return {
            favoriteModels: [{ providerID, modelID }, ...state.favoriteModels],
          };
        });
      },

      toggleHiddenModel: (providerID, modelID) => {
        set((state) => {
          const exists = state.hiddenModels.some(
            (item) => item.providerID === providerID && item.modelID === modelID,
          );

          if (exists) {
            return {
              hiddenModels: state.hiddenModels.filter(
                (item) => !(item.providerID === providerID && item.modelID === modelID),
              ),
            };
          }

          return {
            hiddenModels: [{ providerID, modelID }, ...state.hiddenModels],
          };
        });
      },

      isHiddenModel: (providerID, modelID) => {
        const { hiddenModels } = get();
        return hiddenModels.some(
          (item) => item.providerID === providerID && item.modelID === modelID,
        );
      },

      hideAllModels: (providerID, modelIDs) => {
        set((state) => {
          const current = state.hiddenModels.filter((item) => item.providerID !== providerID);
          const additions = modelIDs
            .filter((modelID) => typeof modelID === 'string' && modelID.length > 0)
            .map((modelID) => ({ providerID, modelID }));
          return { hiddenModels: [...additions, ...current] };
        });
      },

      showAllModels: (providerID) => {
        set((state) => ({
          hiddenModels: state.hiddenModels.filter((item) => item.providerID !== providerID),
        }));
      },

      toggleModelProviderCollapsed: (providerID) => {
        const normalizedProviderID = typeof providerID === 'string' ? providerID.trim() : '';
        if (!normalizedProviderID) {
          return;
        }

        set((state) => {
          const isCollapsed = state.collapsedModelProviders.includes(normalizedProviderID);
          if (isCollapsed) {
            return {
              collapsedModelProviders: state.collapsedModelProviders.filter(
                (id) => id !== normalizedProviderID,
              ),
            };
          }

          return {
            collapsedModelProviders: [...state.collapsedModelProviders, normalizedProviderID],
          };
        });
      },

      isFavoriteModel: (providerID, modelID) => {
        const { favoriteModels } = get();
        return favoriteModels.some(
          (fav) => fav.providerID === providerID && fav.modelID === modelID,
        );
      },

      addRecentModel: (providerID, modelID) => {
        set((state) => {
          const filtered = state.recentModels.filter(
            (m) => !(m.providerID === providerID && m.modelID === modelID),
          );
          return {
            recentModels: [{ providerID, modelID }, ...filtered].slice(0, 5),
          };
        });
      },

      addRecentEffort: (providerID, modelID, variant) => {
        const provider = typeof providerID === 'string' ? providerID.trim() : '';
        const model = typeof modelID === 'string' ? modelID.trim() : '';
        if (!provider || !model) {
          return;
        }
        const key = `${provider}/${model}`;
        const normalizedVariant =
          typeof variant === 'string' && variant.trim().length > 0 ? variant.trim() : 'default';
        set((state) => {
          const current = state.recentEfforts[key] ?? [];
          if (current.includes(normalizedVariant)) {
            return state;
          }
          return {
            recentEfforts: {
              ...state.recentEfforts,
              [key]: [normalizedVariant, ...current].slice(0, 5),
            },
          };
        });
      },
    }),
    {
      name: 'model-preferences-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        favoriteModels: state.favoriteModels,
        hiddenModels: state.hiddenModels,
        collapsedModelProviders: state.collapsedModelProviders,
        recentModels: state.recentModels,
        recentEfforts: state.recentEfforts,
      }),
    },
  ),
);
