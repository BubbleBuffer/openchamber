import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

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
