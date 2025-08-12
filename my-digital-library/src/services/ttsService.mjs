// my-digital-library/src/services/ttsService.mjs
import fetch from "node-fetch";
import { EventEmitter } from "events";
import fs from "fs/promises";

class TTSService extends EventEmitter {
  constructor() {
    super();
    this.kokoroUrl = process.env.KOKORO_TTS_URL || "http://localhost:8880";
    this.cache = new Map();
    this.voices = null;
  }

  /**
   * Get available voices from Kokoro TTS
   */
  async getVoices() {
    if (this.voices) return this.voices;

    try {
      const response = await fetch(`${this.kokoroUrl}/v1/audio/voices`);
      if (!response.ok) throw new Error("Failed to fetch voices");

      const voicesData = await response.json();

      // Transform the response into a consistent format
      // The API might return voice names as strings or objects
      if (Array.isArray(voicesData)) {
        this.voices = voicesData.map((voice) => {
          if (typeof voice === "string") {
            // Parse voice string like "af_heart" -> African Female Heart
            const parts = voice.split("_");
            const genderMap = {
              af: "female",
              am: "male",
              bf: "female",
              bm: "male",
            };
            return {
              id: voice,
              name: voice
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase()),
              gender: genderMap[parts[0]] || "unknown",
              style: parts[1] || "default",
            };
          }
          return voice;
        });
      } else {
        // Default voices based on Kokoro's standard set
        this.voices = [
          {
            id: "af_heart",
            name: "African Female - Heart",
            gender: "female",
            style: "heart",
          },
          {
            id: "af_bella",
            name: "African Female - Bella",
            gender: "female",
            style: "bella",
          },
          {
            id: "am_michael",
            name: "American Male - Michael",
            gender: "male",
            style: "michael",
          },
          {
            id: "bf_emma",
            name: "British Female - Emma",
            gender: "female",
            style: "emma",
          },
          {
            id: "bf_isabella",
            name: "British Female - Isabella",
            gender: "female",
            style: "isabella",
          },
          {
            id: "bm_george",
            name: "British Male - George",
            gender: "male",
            style: "george",
          },
        ];
      }

      return this.voices;
    } catch (error) {
      console.error("Error fetching voices:", error);
      // Return default voices if API call fails
      return [
        {
          id: "af_heart",
          name: "Default Female",
          gender: "female",
          style: "heart",
        },
        {
          id: "am_michael",
          name: "Default Male",
          gender: "male",
          style: "michael",
        },
      ];
    }
  }

  /**
   * Check if Kokoro TTS is available
   */
  async isAvailable() {
    try {
      const response = await fetch(`${this.kokoroUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate speech from text using OpenAI-compatible endpoint
   * @param {string} text - Text to convert to speech
   * @param {Object} options - TTS options
   * @param {string} options.voice - Voice ID (e.g., 'af_heart')
   * @param {number} options.speed - Speech speed (0.25-4.0)
   * @param {string} options.format - Audio format (mp3, wav, opus, aac, flac)
   * @returns {Promise<Buffer>} Audio buffer
   */
  async synthesize(text, options = {}) {
    const { voice = "af_heart", speed = 1.0, format = "mp3" } = options;

    // Check cache first
    const cacheKey = `${text}_${voice}_${speed}_${format}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.kokoroUrl}/v1/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice: voice,
          response_format: format,
          speed: speed,
          stream: false, // We'll handle streaming separately
          normalization_options: {
            normalize: true,
            url_normalization: true,
            email_normalization: true,
            phone_normalization: true,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TTS failed: ${response.statusText} - ${error}`);
      }

      const audioBuffer = await response.buffer();

      // Cache the result (limit cache size)
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, audioBuffer);

      return audioBuffer;
    } catch (error) {
      console.error("TTS synthesis error:", error);
      throw error;
    }
  }

  /**
   * Stream synthesis for long texts using OpenAI-compatible streaming
   * @param {string[]} chunks - Array of text chunks
   * @param {Object} options - TTS options
   * @returns {AsyncGenerator<Buffer>}
   */
  async *synthesizeStream(chunks, options = {}) {
    const { voice = "af_heart", speed = 1.0, format = "mp3" } = options;

    for (const chunk of chunks) {
      if (chunk.trim()) {
        try {
          const response = await fetch(`${this.kokoroUrl}/v1/audio/speech`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "kokoro",
              input: chunk,
              voice: voice,
              response_format: format,
              speed: speed,
              stream: true, // Enable streaming for real-time generation
            }),
          });

          if (!response.ok) {
            console.error(`Failed to synthesize chunk: ${response.statusText}`);
            continue;
          }

          // Stream the response
          const reader = response.body.getReader();
          const chunks = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }

          const audioBuffer = Buffer.concat(chunks);
          yield audioBuffer;
        } catch (error) {
          console.error("Error synthesizing chunk:", error);
          // Continue with next chunk even if one fails
        }
      }
    }
  }

  /**
   * Generate audio with word-level timestamps (if needed for syncing)
   */
  async synthesizeWithCaptions(text, options = {}) {
    const { voice = "af_heart", speed = 1.0, format = "mp3" } = options;

    try {
      const response = await fetch(`${this.kokoroUrl}/dev/captioned_speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice: voice,
          response_format: format,
          speed: speed,
          return_timestamps: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Captioned speech failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Captioned speech error:", error);
      // Fall back to regular synthesis
      const audio = await this.synthesize(text, options);
      return { audio, timestamps: [] };
    }
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get list of available models
   */
  async getModels() {
    try {
      const response = await fetch(`${this.kokoroUrl}/v1/models`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Error fetching models:", error);
    }
    return ["kokoro"];
  }
}

export default new TTSService();
