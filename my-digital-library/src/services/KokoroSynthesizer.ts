// src/services/KokoroSynthesizer.ts
import { TTSSynthesizer, TTSOptions } from "./TTSController";

export class KokoroSynthesizer implements TTSSynthesizer {
  private cache = new Map<string, ArrayBuffer>();
  private readonly maxCacheSize = 100;

  async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    console.log("🔊 KokoroSynthesizer.synthesize called:", {
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
      voice: options?.voice,
      rate: options?.rate,
      textLength: text.length,
    });

    const cacheKey = this.getCacheKey(text, options);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log("💾 Found in cache, returning cached audio");
      return this.cache.get(cacheKey)!;
    }

    try {
      console.log("🌐 Making request to /api/tts/synthesize-buffer...");

      const requestBody = {
        text,
        voice: options?.voice || "af_heart",
        speed: options?.rate || 1.0,
      };
      console.log("📤 Request body:", requestBody);

      const response = await fetch("/api/tts/synthesize-buffer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📡 Response received:", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Server error response:", errorText);
        throw new Error(
          `Synthesis failed: ${response.statusText} - ${errorText}`
        );
      }

      console.log("⬇️ Getting array buffer...");
      const arrayBuffer = await response.arrayBuffer();

      console.log("🎵 Audio buffer received:", {
        size: arrayBuffer.byteLength,
        sizeKB: Math.round(arrayBuffer.byteLength / 1024),
      });

      // Cache the result with LRU eviction
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        if (typeof firstKey === "string") {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(cacheKey, arrayBuffer);

      console.log("✅ Synthesis complete, returning audio buffer");
      return arrayBuffer;
    } catch (error) {
      console.error("❌ Synthesis error:", error);
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
