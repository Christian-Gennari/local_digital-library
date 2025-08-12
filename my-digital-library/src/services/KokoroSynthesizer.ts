// src/services/KokoroSynthesizer.ts
import { TTSSynthesizer, TTSOptions } from "./TTSController";

export class KokoroSynthesizer implements TTSSynthesizer {
  private cache = new Map<string, ArrayBuffer>();
  private readonly maxCacheSize = 100;

  async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    const cacheKey = this.getCacheKey(text, options);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const response = await fetch("/api/tts/synthesize-buffer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voice: options?.voice || "af_heart",
          speed: options?.rate || 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Synthesis failed: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      // Cache the result with LRU eviction
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        if (typeof firstKey === "string") {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(cacheKey, arrayBuffer);

      return arrayBuffer;
    } catch (error) {
      console.error("Synthesis error:", error);
      throw error;
    }
  }

  private getCacheKey(text: string, options?: TTSOptions): string {
    const voice = options?.voice || "af_heart";
    const rate = options?.rate || 1.0;
    const volume = options?.volume || 1.0;

    // Create a simple hash of the text and options
    return `${text.substring(0, 50)}_${voice}_${rate}_${volume}`;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}
