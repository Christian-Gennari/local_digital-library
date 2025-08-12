// src/utils/ttsUtils.ts
export class TTSUtils {
  // Enhanced sentence splitting with better abbreviation handling
  static splitSentences(
    text: string
  ): Array<{ text: string; start: number; end: number }> {
    // Common abbreviations that shouldn't trigger sentence breaks
    const abbreviations = new Set([
      // Titles
      "mr",
      "mrs",
      "ms",
      "dr",
      "prof",
      "rev",
      "st",
      "mt",
      // Academic
      "phd",
      "md",
      "ba",
      "ma",
      "bs",
      "ms",
      "ph.d",
      "m.d",
      // Business
      "inc",
      "ltd",
      "llc",
      "corp",
      "co",
      "vs",
      "etc",
      "dept",
      // Time/Date
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
      // Common
      "no",
      "vol",
      "ch",
      "fig",
      "p",
      "pp",
      "cf",
      "eg",
      "ie",
      "al",
      "approx",
      // Technical
      "cpu",
      "gpu",
      "ram",
      "usb",
      "api",
      "url",
      "html",
      "css",
      "js",
      "ts",
    ]);

    const sentences: Array<{ text: string; start: number; end: number }> = [];
    let currentStart = 0;

    // Match sentence-ending punctuation followed by whitespace and capital letter
    const sentenceRegex = /([.!?]+)\s+([A-Z])/g;
    let match;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const endPunctuation = match.index + match[1].length;
      const beforePunctuation = text
        .substring(currentStart, match.index)
        .trim();

      // Check if this might be an abbreviation
      const words = beforePunctuation.toLowerCase().split(/\s+/);
      const lastWord = words[words.length - 1]?.replace(/[^a-z]/g, "");

      // Skip if it's a known abbreviation and the sentence is too short
      if (abbreviations.has(lastWord) && beforePunctuation.length < 20) {
        continue;
      }

      // Check for other patterns that shouldn't break sentences
      if (this.isLikelyAbbreviation(beforePunctuation, text, match.index)) {
        continue;
      }

      const sentenceText = text.substring(currentStart, endPunctuation).trim();
      if (sentenceText.length > 5) {
        // Minimum sentence length
        sentences.push({
          text: sentenceText,
          start: currentStart,
          end: endPunctuation,
        });
      }

      currentStart = endPunctuation;
      // Adjust regex lastIndex to continue from after the punctuation
      sentenceRegex.lastIndex = endPunctuation;
    }

    // Add the remaining text as the last sentence
    if (currentStart < text.length) {
      const remaining = text.substring(currentStart).trim();
      if (remaining.length > 5) {
        sentences.push({
          text: remaining,
          start: currentStart,
          end: text.length,
        });
      }
    }

    return sentences;
  }

  private static isLikelyAbbreviation(
    beforeText: string,
    fullText: string,
    position: number
  ): boolean {
    // Check for numeric patterns (e.g., "Vol. 2", "No. 5")
    if (/\b\w+\.\s*\d+$/.test(beforeText)) {
      return true;
    }

    // Check for initials (e.g., "J. K. Rowling")
    if (/\b[A-Z]\.$/.test(beforeText) && beforeText.length < 30) {
      return true;
    }

    // Check for decimal numbers
    if (/\d+\.$/.test(beforeText)) {
      const nextChar = fullText[position + 1];
      if (nextChar && /\d/.test(nextChar)) {
        return true;
      }
    }

    return false;
  }

  // Clean and normalize text for TTS
  static normalizeTextForTTS(text: string): string {
    return (
      text
        // Fix common Unicode issues
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[–—]/g, " - ")
        // Expand common abbreviations for better pronunciation
        .replace(/\b(?:Dr|Mr|Mrs|Ms)\./g, (match) => {
          const expansions: Record<string, string> = {
            "Dr.": "Doctor",
            "Mr.": "Mister",
            "Mrs.": "Missus",
            "Ms.": "Miss",
          };
          return expansions[match] || match;
        })
        // Handle numbers and dates
        .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, "$2 $1 $3")
        .replace(/\b(\d+)%/g, "$1 percent")
        // Remove excessive whitespace
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  // Estimate reading time based on text length and speech rate
  static estimateReadingTime(
    text: string,
    wordsPerMinute: number = 150
  ): number {
    const words = text.split(/\s+/).length;
    return Math.ceil((words / wordsPerMinute) * 60); // Return seconds
  }

  // Format time duration for display
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  // Check if device has good TTS capabilities
  static async checkTTSCapabilities(): Promise<{
    hasAudioContext: boolean;
    hasWebAudio: boolean;
    maxSampleRate: number;
    supportedFormats: string[];
  }> {
    const capabilities = {
      hasAudioContext: false,
      hasWebAudio: false,
      maxSampleRate: 0,
      supportedFormats: [] as string[],
    };

    // Check AudioContext support
    if (
      typeof AudioContext !== "undefined" ||
      typeof (window as any).webkitAudioContext !== "undefined"
    ) {
      capabilities.hasAudioContext = true;

      try {
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        capabilities.hasWebAudio = true;
        capabilities.maxSampleRate = audioContext.sampleRate;
        await audioContext.close();
      } catch (error) {
        console.warn("AudioContext creation failed:", error);
      }
    }

    // Check supported audio formats
    const audio = document.createElement("audio");
    const formats = ["mp3", "wav", "ogg", "m4a", "aac"];

    for (const format of formats) {
      const mimeType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
      if (audio.canPlayType(mimeType)) {
        capabilities.supportedFormats.push(format);
      }
    }

    return capabilities;
  }

  // Detect if user is on mobile device
  static isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  // Calculate optimal chunk size based on device capabilities
  static calculateOptimalChunkSize(): number {
    const isMobile = this.isMobileDevice();
    const memoryGB = (navigator as any).deviceMemory || 4; // Default to 4GB if unknown

    if (isMobile) {
      return memoryGB < 3 ? 300 : 500; // Smaller chunks for low-memory mobile devices
    }

    return memoryGB < 4 ? 500 : 800; // Larger chunks for desktop
  }

  // Debounce function for frequent operations
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Show visual feedback for start-here action
  static showStartHereIndicator(
    x: number,
    y: number,
    message: string = "Starting here..."
  ): void {
    const indicator = document.createElement("div");
    indicator.className = "tts-start-here-indicator";
    indicator.textContent = message;
    indicator.style.left = `${x}px`;
    indicator.style.top = `${y - 40}px`;

    document.body.appendChild(indicator);

    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 600);
  }

  // Get readable error message for common TTS errors
  static getReadableErrorMessage(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes("audiocontext")) {
      return "Audio system unavailable. Please check your browser settings and try again.";
    }

    if (message.includes("network") || message.includes("fetch")) {
      return "Network error. Please check your connection and try again.";
    }

    if (message.includes("synthesis") || message.includes("tts")) {
      return "Text-to-speech service is temporarily unavailable. Please try again later.";
    }

    if (message.includes("permission") || message.includes("autoplay")) {
      return "Please interact with the page first, then try playing audio.";
    }

    if (message.includes("sentence") || message.includes("index")) {
      return "Unable to process text. Please try selecting a different section.";
    }

    return "An unexpected error occurred. Please try again.";
  }
}

// src/utils/ttsPerformance.ts
export class TTSPerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTimer(operation: string): void {
    this.startTimes.set(operation, performance.now());
  }

  endTimer(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.startTimes.delete(operation);

    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(duration);

    // Keep only last 100 measurements
    if (operationMetrics.length > 100) {
      operationMetrics.shift();
    }

    return duration;
  }

  getAverageTime(operation: string): number {
    const times = this.metrics.get(operation);
    if (!times || times.length === 0) return 0;

    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  getMetrics(): Record<string, { avg: number; count: number; last: number }> {
    const result: Record<string, { avg: number; count: number; last: number }> =
      {};

    for (const [operation, times] of this.metrics) {
      result[operation] = {
        avg: times.reduce((sum, time) => sum + time, 0) / times.length,
        count: times.length,
        last: times[times.length - 1] || 0,
      };
    }

    return result;
  }

  shouldOptimize(operation: string, threshold: number = 1000): boolean {
    return this.getAverageTime(operation) > threshold;
  }

  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

// src/utils/ttsErrorRecovery.ts
export class TTSErrorRecovery {
  private retryCount: Map<string, number> = new Map();
  private maxRetries: number = 3;
  private backoffBase: number = 1000; // 1 second

  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "unknown"
  ): Promise<T> {
    const currentRetries = this.retryCount.get(operationName) || 0;

    try {
      const result = await operation();
      this.retryCount.delete(operationName); // Reset on success
      return result;
    } catch (error) {
      console.error(
        `Operation ${operationName} failed (attempt ${currentRetries + 1}):`,
        error
      );

      if (currentRetries >= this.maxRetries) {
        this.retryCount.delete(operationName);
        throw new Error(
          `Operation ${operationName} failed after ${this.maxRetries} attempts: ${error}`
        );
      }

      // Exponential backoff
      const delay = this.backoffBase * Math.pow(2, currentRetries);
      await new Promise((resolve) => setTimeout(resolve, delay));

      this.retryCount.set(operationName, currentRetries + 1);
      return this.withRetry(operation, operationName);
    }
  }

  reset(operationName?: string): void {
    if (operationName) {
      this.retryCount.delete(operationName);
    } else {
      this.retryCount.clear();
    }
  }
}

// src/utils/ttsCache.ts
export class TTSCache {
  private cache = new Map<
    string,
    { data: any; timestamp: number; accessCount: number }
  >();
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize: number = 100, maxAgeMinutes: number = 60) {
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  set(key: string, data: any): void {
    // Remove expired entries
    this.cleanup();

    // If at max size, remove least recently used item
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 0,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Update access count and timestamp
    entry.accessCount++;
    entry.timestamp = Date.now();

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }

  private evictLRU(): void {
    let oldestKey = "";
    let oldestTime = Date.now();
    let lowestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (
        entry.accessCount < lowestAccess ||
        (entry.accessCount === lowestAccess && entry.timestamp < oldestTime)
      ) {
        oldestKey = key;
        oldestTime = entry.timestamp;
        lowestAccess = entry.accessCount;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need to track hits/misses to calculate
    };
  }
}
