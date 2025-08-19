import React, { useState } from "react";
import { useThemeStore } from "../stores/themeStore";
import {
  SunIcon,
  MoonIcon,
  BookOpenIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

export function ThemeSelector() {
  const {
    currentTheme,
    themes,
    setTheme,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    lineHeight,
    setLineHeight,
    textAlign,
    setTextAlign,
    autoSwitch,
    toggleAutoSwitch,
  } = useThemeStore();

  const [showAdvanced, setShowAdvanced] = useState(false);

  const themeIcons: Record<string, React.ReactElement> = {
    paper: <SunIcon className="h-5 w-5" />,
    sepia: <BookOpenIcon className="h-5 w-5" />,
    night: <MoonIcon className="h-5 w-5" />,
    highContrast: <AdjustmentsHorizontalIcon className="h-5 w-5" />,
  };

  return (
    <div className="space-y-4 p-4">
      {/* Theme Grid */}
      <div>
        <h3 className="text-sm font-medium theme-text-secondary mb-3">
          Reading Theme
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(themes).map(([id, theme]) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={`
                relative p-3 rounded-lg border-2 transition-all
                ${
                  currentTheme === id
                    ? "shadow-md"
                    : "theme-border hover\\:theme-border-hover" // ✅ Keep escaped
                }
              `}
              style={{
                backgroundColor: theme.colors.bgPrimary,
                color: theme.colors.textPrimary,
                borderColor:
                  currentTheme === id ? "var(--theme-accent)" : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{theme.name}</span>
                {themeIcons[id]}
              </div>
              {currentTheme === id && (
                <CheckIcon className="absolute top-1 right-1 h-4 w-4" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Switch - FIXED */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5 theme-text-secondary" />
          <span className="text-sm theme-text-primary">
            Auto-switch by time
          </span>
        </div>
        <button
          onClick={toggleAutoSwitch}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${
              autoSwitch ? "" : "theme-bg-tertiary"
            }  // ✅ FIXED: removed hardcoded gray
          `}
          style={{
            backgroundColor: autoSwitch ? "var(--theme-accent)" : undefined,
          }}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${autoSwitch ? "translate-x-6" : "translate-x-1"}
            `}
          />
        </button>
      </div>

      {/* Advanced Settings */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm theme-text-secondary hover\:theme-text-primary transition-colors"
        >
          {showAdvanced ? "Hide" : "Show"} advanced settings
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {/* Font Size */}
            <div>
              <label className="text-sm theme-text-secondary">
                Font Size: {fontSize}%
              </label>
              <input
                type="range"
                min="70"
                max="200"
                step="5"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full mt-1 accent-blue-500"
                style={{ accentColor: "var(--theme-accent)" }}
              />
            </div>

            {/* Font Family - FIXED hover escapes */}
            <div>
              <label className="text-sm theme-text-secondary">
                Font Family
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => setFontFamily("serif")}
                  className={`
                    p-2 rounded border-2 transition-all
                    ${
                      fontFamily === "serif"
                        ? "theme-bg-tertiary shadow-sm"
                        : "theme-border hover\\:theme-border-hover hover\\:theme-bg-secondary" // ✅ FIXED
                    }
                  `}
                  style={{
                    fontFamily: "Lora, serif",
                    borderColor:
                      fontFamily === "serif"
                        ? "var(--theme-accent)"
                        : undefined,
                  }}
                >
                  Serif
                </button>
                <button
                  onClick={() => setFontFamily("sans-serif")}
                  className={`
                    p-2 rounded border-2 transition-all
                    ${
                      fontFamily === "sans-serif"
                        ? "theme-bg-tertiary shadow-sm"
                        : "theme-border hover\\:theme-border-hover hover\\:theme-bg-secondary" // ✅ FIXED
                    }
                  `}
                  style={{
                    fontFamily: "Inter, sans-serif",
                    borderColor:
                      fontFamily === "sans-serif"
                        ? "var(--theme-accent)"
                        : undefined,
                  }}
                >
                  Sans
                </button>
              </div>
            </div>

            {/* Line Height */}
            <div>
              <label className="text-sm theme-text-secondary">
                Line Height: {lineHeight}
              </label>
              <input
                type="range"
                min="1.2"
                max="2.5"
                step="0.05"
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className="w-full mt-1"
                style={{ accentColor: "var(--theme-accent)" }}
              />
            </div>

            {/* Text Alignment - FIXED hover escapes */}
            <div>
              <label className="text-sm theme-text-secondary">
                Text Alignment
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => setTextAlign("left")}
                  className={`
                    p-2 rounded border-2 transition-all
                    ${
                      textAlign === "left"
                        ? "theme-bg-tertiary shadow-sm"
                        : "theme-border hover\\:theme-border-hover hover\\:theme-bg-secondary" // ✅ FIXED
                    }
                  `}
                  style={{
                    borderColor:
                      textAlign === "left" ? "var(--theme-accent)" : undefined,
                  }}
                >
                  Left
                </button>
                <button
                  onClick={() => setTextAlign("justify")}
                  className={`
                    p-2 rounded border-2 transition-all
                    ${
                      textAlign === "justify"
                        ? "theme-bg-tertiary shadow-sm"
                        : "theme-border hover\\:theme-border-hover hover\\:theme-bg-secondary" // ✅ FIXED
                    }
                  `}
                  style={{
                    borderColor:
                      textAlign === "justify"
                        ? "var(--theme-accent)"
                        : undefined,
                  }}
                >
                  Justified
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
