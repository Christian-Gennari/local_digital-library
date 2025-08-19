import { create } from "zustand";
import { ThemeSettings, ThemeDefinition } from "../types/theme";
import { defaultThemes } from "../config/themes";
import { RemoteFS } from "../fsRemote";

interface ThemeStore extends ThemeSettings {
  // State
  themes: Record<string, ThemeDefinition>;
  isLoading: boolean;

  // Actions
  setTheme: (themeId: string) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: "serif" | "sans-serif") => void;
  setLineHeight: (height: number) => void;
  setTextAlign: (align: "left" | "justify") => void;
  toggleAutoSwitch: () => void;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (themeId: string) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS: ThemeSettings = {
  currentTheme: "paper",
  autoSwitch: false,
  autoSwitchSchedule: {
    day: "paper",
    evening: "sepia",
    night: "night",
  },
  customThemes: [],
  fontSize: 100,
  fontFamily: "serif",
  lineHeight: 1.75,
  textAlign: "justify",
};

export const useThemeStore = create<ThemeStore>((set, get) => ({
  // Initial state
  ...DEFAULT_SETTINGS,
  themes: defaultThemes,
  isLoading: false,

  // Actions
  setTheme: (themeId: string) => {
    set({ currentTheme: themeId });
    get().saveSettings();
  },

  setFontSize: (size: number) => {
    set({ fontSize: Math.max(70, Math.min(200, size)) });
    get().saveSettings();
  },

  setFontFamily: (family: "serif" | "sans-serif") => {
    set({ fontFamily: family });
    get().saveSettings();
  },

  setLineHeight: (height: number) => {
    set({ lineHeight: Math.max(1.2, Math.min(2.5, height)) });
    get().saveSettings();
  },

  setTextAlign: (align: "left" | "justify") => {
    set({ textAlign: align });
    get().saveSettings();
  },

  toggleAutoSwitch: () => {
    set((state) => ({ autoSwitch: !state.autoSwitch }));
    get().saveSettings();
  },

  addCustomTheme: (theme: ThemeDefinition) => {
    set((state) => ({
      customThemes: [...state.customThemes, theme],
      themes: { ...state.themes, [theme.id]: theme },
    }));
    get().saveSettings();
  },

  removeCustomTheme: (themeId: string) => {
    set((state) => {
      const { [themeId]: removed, ...remainingThemes } = state.themes;
      return {
        customThemes: state.customThemes.filter((t) => t.id !== themeId),
        themes: remainingThemes,
      };
    });
    get().saveSettings();
  },

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await RemoteFS.getThemeSettings();
      if (settings) {
        // Merge custom themes with defaults
        const allThemes = { ...defaultThemes };
        settings.customThemes?.forEach((theme: ThemeDefinition) => {
          allThemes[theme.id] = theme;
        });

        set({
          ...settings,
          themes: allThemes,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error("Failed to load theme settings:", error);
      set({ isLoading: false });
    }
  },

  saveSettings: async () => {
    const state = get();
    const settings: ThemeSettings = {
      currentTheme: state.currentTheme,
      autoSwitch: state.autoSwitch,
      autoSwitchSchedule: state.autoSwitchSchedule,
      customThemes: state.customThemes,
      fontSize: state.fontSize,
      fontFamily: state.fontFamily,
      lineHeight: state.lineHeight,
      textAlign: state.textAlign,
    };

    try {
      await RemoteFS.saveThemeSettings(settings);
    } catch (error) {
      // Don't log errors in production - localStorage is already saved
      if (import.meta.env.DEV) {
        console.warn("Theme settings saved to localStorage only");
      }
    }
  },

  resetToDefaults: () => {
    set({
      ...DEFAULT_SETTINGS,
      themes: defaultThemes,
    });
    get().saveSettings();
  },
}));
