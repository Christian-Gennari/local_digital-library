export interface ThemeColors {
  // Core colors
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // UI elements
  border: string;
  borderHover: string;
  hover: string;
  shadow: string;

  // Reader specific
  readerBg: string;
  readerText: string;
  readerSelection: string;
  readerHighlight: string;

  // Semantic colors
  accent: string;
  success: string;
  warning: string;
  error: string;
}

export interface EPUBThemeStyles {
  body: Record<string, string>;
  p?: Record<string, string>;
  h1?: Record<string, string>;
  h2?: Record<string, string>;
  h3?: Record<string, string>;
  h4?: Record<string, string>;
  h5?: Record<string, string>;
  h6?: Record<string, string>;
  a?: Record<string, string>;
  blockquote?: Record<string, string>;
  code?: Record<string, string>;
  pre?: Record<string, string>;
  img?: Record<string, string>;
  ul?: Record<string, string>;
  ol?: Record<string, string>;
  li?: Record<string, string>;
  [key: string]: Record<string, string> | undefined;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description?: string;
  colors: ThemeColors;
  epubStyles: EPUBThemeStyles;
  pdfConfig?: {
    invertColors?: boolean;
    brightness?: number;
    contrast?: number;
  };
  timeRange?: {
    start: number; // hour (0-23)
    end: number;
  };
}

export interface ThemeSettings {
  currentTheme: string;
  autoSwitch: boolean;
  autoSwitchSchedule: {
    day: string; // theme id
    evening: string; // theme id
    night: string; // theme id
  };
  customThemes: ThemeDefinition[];
  fontSize: number; // percentage
  fontFamily: "serif" | "sans-serif";
  lineHeight: number;
  textAlign: "left" | "justify";
}
