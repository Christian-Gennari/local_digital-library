import { useEffect, ReactNode } from "react";
import { useThemeStore } from "../stores/themeStore";

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { currentTheme, themes, autoSwitch, autoSwitchSchedule, loadSettings } =
    useThemeStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Apply theme to document
  useEffect(() => {
    const theme = themes[currentTheme];
    if (!theme) return;

    // Set data attribute for CSS - THIS IS ALL WE NEED!
    document.documentElement.setAttribute("data-theme", currentTheme);

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", theme.colors.bgPrimary);
    } else {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = theme.colors.bgPrimary;
      document.head.appendChild(meta);
    }
  }, [currentTheme, themes]);

  // Auto-switch based on time
  useEffect(() => {
    if (!autoSwitch) return;

    const checkTimeAndSwitch = () => {
      const hour = new Date().getHours();
      let targetTheme = autoSwitchSchedule.day;

      // Check each theme's time range
      Object.entries(themes).forEach(([id, theme]) => {
        if (theme.timeRange) {
          const { start, end } = theme.timeRange;
          if (start <= end) {
            // Normal range (e.g., 6-18)
            if (hour >= start && hour < end) {
              targetTheme = id;
            }
          } else {
            // Overnight range (e.g., 22-6)
            if (hour >= start || hour < end) {
              targetTheme = id;
            }
          }
        }
      });

      if (targetTheme !== currentTheme) {
        useThemeStore.getState().setTheme(targetTheme);
      }
    };

    // Check immediately
    checkTimeAndSwitch();

    // Check every minute
    const interval = setInterval(checkTimeAndSwitch, 60000);

    return () => clearInterval(interval);
  }, [autoSwitch, autoSwitchSchedule, currentTheme, themes]);

  return <>{children}</>;
}
