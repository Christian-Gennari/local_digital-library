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
   * Parse voice string into structured format
   */
  parseVoiceString(voiceId) {
    const parts = voiceId.split("_");
    const prefix = parts[0];
    const name = parts.slice(1).join("_");

    const voiceInfo = this.getVoiceInfo(prefix, name);

    return {
      id: voiceId,
      name: voiceInfo.name,
      gender: voiceInfo.gender,
      language: voiceInfo.language,
      style: name || "default",
    };
  }

  /**
   * Get voice information based on prefix and name
   */
  getVoiceInfo(prefix, name) {
    const prefixMap = {
      af: { gender: "female", language: "American", region: "US" },
      am: { gender: "male", language: "American", region: "US" },
      bf: { gender: "female", language: "British", region: "UK" },
      bm: { gender: "male", language: "British", region: "UK" },
      ef: { gender: "female", language: "Spanish", region: "Spain" },
      em: { gender: "male", language: "Spanish", region: "Spain" },
      ff: { gender: "female", language: "French", region: "France" },
      hf: { gender: "female", language: "Hindi", region: "India" },
      hm: { gender: "male", language: "Hindi", region: "India" },
      if: { gender: "female", language: "Italian", region: "Italy" },
      im: { gender: "male", language: "Italian", region: "Italy" },
      jf: { gender: "female", language: "Japanese", region: "Japan" },
      jm: { gender: "male", language: "Japanese", region: "Japan" },
      pf: { gender: "female", language: "Portuguese", region: "Portugal" },
      pm: { gender: "male", language: "Portuguese", region: "Portugal" },
      zf: { gender: "female", language: "Chinese", region: "China" },
      zm: { gender: "male", language: "Chinese", region: "China" },
    };

    const info = prefixMap[prefix] || {
      gender: "unknown",
      language: "Unknown",
      region: "",
    };

    // Format the display name
    const formattedName = name
      ? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ")
      : "Default";

    // Special handling for specific voice names
    const specialNames = {
      v0: "V0",
      v0bella: "V0 Bella",
      v0irulan: "V0 Irulan",
      v0nicole: "V0 Nicole",
      v0sarah: "V0 Sarah",
      v0sky: "V0 Sky",
      v0adam: "V0 Adam",
      v0gurney: "V0 Gurney",
      v0michael: "V0 Michael",
      v0emma: "V0 Emma",
      v0isabella: "V0 Isabella",
      v0george: "V0 George",
      v0lewis: "V0 Lewis",
    };

    const displayName = specialNames[name] || formattedName;

    return {
      name: `${info.language} ${
        info.gender === "female" ? "Female" : "Male"
      } - ${displayName}`,
      gender: info.gender,
      language: info.language,
    };
  }

  /**
   * Get complete default voice list
   */
  getDefaultVoices() {
    const allVoices = [
      // American Female voices
      {
        id: "af_alloy",
        name: "American Female - Alloy",
        gender: "female",
        language: "American",
      },
      {
        id: "af_aoede",
        name: "American Female - Aoede",
        gender: "female",
        language: "American",
      },
      {
        id: "af_bella",
        name: "American Female - Bella",
        gender: "female",
        language: "American",
      },
      {
        id: "af_heart",
        name: "American Female - Heart",
        gender: "female",
        language: "American",
      },
      {
        id: "af_jadzia",
        name: "American Female - Jadzia",
        gender: "female",
        language: "American",
      },
      {
        id: "af_jessica",
        name: "American Female - Jessica",
        gender: "female",
        language: "American",
      },
      {
        id: "af_kore",
        name: "American Female - Kore",
        gender: "female",
        language: "American",
      },
      {
        id: "af_nicole",
        name: "American Female - Nicole",
        gender: "female",
        language: "American",
      },
      {
        id: "af_nova",
        name: "American Female - Nova",
        gender: "female",
        language: "American",
      },
      {
        id: "af_river",
        name: "American Female - River",
        gender: "female",
        language: "American",
      },
      {
        id: "af_sarah",
        name: "American Female - Sarah",
        gender: "female",
        language: "American",
      },
      {
        id: "af_sky",
        name: "American Female - Sky",
        gender: "female",
        language: "American",
      },
      {
        id: "af_v0",
        name: "American Female - V0",
        gender: "female",
        language: "American",
      },
      {
        id: "af_v0bella",
        name: "American Female - V0 Bella",
        gender: "female",
        language: "American",
      },
      {
        id: "af_v0irulan",
        name: "American Female - V0 Irulan",
        gender: "female",
        language: "American",
      },
      {
        id: "af_v0nicole",
        name: "American Female - V0 Nicole",
        gender: "female",
        language: "American",
      },
      {
        id: "af_v0sarah",
        name: "American Female - V0 Sarah",
        gender: "female",
        language: "American",
      },
      {
        id: "af_v0sky",
        name: "American Female - V0 Sky",
        gender: "female",
        language: "American",
      },

      // American Male voices
      {
        id: "am_adam",
        name: "American Male - Adam",
        gender: "male",
        language: "American",
      },
      {
        id: "am_echo",
        name: "American Male - Echo",
        gender: "male",
        language: "American",
      },
      {
        id: "am_eric",
        name: "American Male - Eric",
        gender: "male",
        language: "American",
      },
      {
        id: "am_fenrir",
        name: "American Male - Fenrir",
        gender: "male",
        language: "American",
      },
      {
        id: "am_liam",
        name: "American Male - Liam",
        gender: "male",
        language: "American",
      },
      {
        id: "am_michael",
        name: "American Male - Michael",
        gender: "male",
        language: "American",
      },
      {
        id: "am_onyx",
        name: "American Male - Onyx",
        gender: "male",
        language: "American",
      },
      {
        id: "am_puck",
        name: "American Male - Puck",
        gender: "male",
        language: "American",
      },
      {
        id: "am_santa",
        name: "American Male - Santa",
        gender: "male",
        language: "American",
      },
      {
        id: "am_v0adam",
        name: "American Male - V0 Adam",
        gender: "male",
        language: "American",
      },
      {
        id: "am_v0gurney",
        name: "American Male - V0 Gurney",
        gender: "male",
        language: "American",
      },
      {
        id: "am_v0michael",
        name: "American Male - V0 Michael",
        gender: "male",
        language: "American",
      },

      // British Female voices
      {
        id: "bf_alice",
        name: "British Female - Alice",
        gender: "female",
        language: "British",
      },
      {
        id: "bf_emma",
        name: "British Female - Emma",
        gender: "female",
        language: "British",
      },
      {
        id: "bf_lily",
        name: "British Female - Lily",
        gender: "female",
        language: "British",
      },
      {
        id: "bf_v0emma",
        name: "British Female - V0 Emma",
        gender: "female",
        language: "British",
      },
      {
        id: "bf_v0isabella",
        name: "British Female - V0 Isabella",
        gender: "female",
        language: "British",
      },

      // British Male voices
      {
        id: "bm_daniel",
        name: "British Male - Daniel",
        gender: "male",
        language: "British",
      },
      {
        id: "bm_fable",
        name: "British Male - Fable",
        gender: "male",
        language: "British",
      },
      {
        id: "bm_george",
        name: "British Male - George",
        gender: "male",
        language: "British",
      },
      {
        id: "bm_lewis",
        name: "British Male - Lewis",
        gender: "male",
        language: "British",
      },
      {
        id: "bm_v0george",
        name: "British Male - V0 George",
        gender: "male",
        language: "British",
      },
      {
        id: "bm_v0lewis",
        name: "British Male - V0 Lewis",
        gender: "male",
        language: "British",
      },

      // English voices
      {
        id: "ef_dora",
        name: "Spanish Female - Dora",
        gender: "female",
        language: "Spanish",
      },
      {
        id: "em_alex",
        name: "Spanish Male - Alex",
        gender: "male",
        language: "Spanish",
      },
      {
        id: "em_santa",
        name: "Spanish Male - Santa",
        gender: "male",
        language: "Spanish",
      },

      // French voices
      {
        id: "ff_siwis",
        name: "French Female - Siwis",
        gender: "female",
        language: "French",
      },

      // Hindi voices
      {
        id: "hf_alpha",
        name: "Hindi Female - Alpha",
        gender: "female",
        language: "Hindi",
      },
      {
        id: "hf_beta",
        name: "Hindi Female - Beta",
        gender: "female",
        language: "Hindi",
      },
      {
        id: "hm_omega",
        name: "Hindi Male - Omega",
        gender: "male",
        language: "Hindi",
      },
      {
        id: "hm_psi",
        name: "Hindi Male - Psi",
        gender: "male",
        language: "Hindi",
      },

      // Italian voices
      {
        id: "if_sara",
        name: "Italian Female - Sara",
        gender: "female",
        language: "Italian",
      },
      {
        id: "im_nicola",
        name: "Italian Male - Nicola",
        gender: "male",
        language: "Italian",
      },

      // Japanese voices
      {
        id: "jf_alpha",
        name: "Japanese Female - Alpha",
        gender: "female",
        language: "Japanese",
      },
      {
        id: "jf_gongitsune",
        name: "Japanese Female - Gongitsune",
        gender: "female",
        language: "Japanese",
      },
      {
        id: "jf_nezumi",
        name: "Japanese Female - Nezumi",
        gender: "female",
        language: "Japanese",
      },
      {
        id: "jf_tebukuro",
        name: "Japanese Female - Tebukuro",
        gender: "female",
        language: "Japanese",
      },
      {
        id: "jm_kumo",
        name: "Japanese Male - Kumo",
        gender: "male",
        language: "Japanese",
      },

      // Portuguese voices
      {
        id: "pf_dora",
        name: "Portuguese Female - Dora",
        gender: "female",
        language: "Portuguese",
      },
      {
        id: "pm_alex",
        name: "Portuguese Male - Alex",
        gender: "male",
        language: "Portuguese",
      },
      {
        id: "pm_santa",
        name: "Portuguese Male - Santa",
        gender: "male",
        language: "Portuguese",
      },

      // Chinese voices
      {
        id: "zf_xiaobei",
        name: "Chinese Female - Xiaobei",
        gender: "female",
        language: "Chinese",
      },
      {
        id: "zf_xiaoni",
        name: "Chinese Female - Xiaoni",
        gender: "female",
        language: "Chinese",
      },
      {
        id: "zf_xiaoxiao",
        name: "Chinese Female - Xiaoxiao",
        gender: "female",
        language: "Chinese",
      },
      {
        id: "zf_xiaoyi",
        name: "Chinese Female - Xiaoyi",
        gender: "female",
        language: "Chinese",
      },
      {
        id: "zm_yunjian",
        name: "Chinese Male - Yunjian",
        gender: "male",
        language: "Chinese",
      },
      {
        id: "zm_yunxi",
        name: "Chinese Male - Yunxi",
        gender: "male",
        language: "Chinese",
      },
      {
        id: "zm_yunxia",
        name: "Chinese Male - Yunxia",
        gender: "male",
        language: "Chinese",
      },
      {
        id: "zm_yunyang",
        name: "Chinese Male - Yunyang",
        gender: "male",
        language: "Chinese",
      },
    ];

    return allVoices;
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
      if (Array.isArray(voicesData)) {
        this.voices = voicesData.map((voice) => {
          if (typeof voice === "string") {
            return this.parseVoiceString(voice);
          }
          return voice;
        });
      } else if (voicesData.voices && Array.isArray(voicesData.voices)) {
        // Handle case where API returns {voices: [...]}
        this.voices = voicesData.voices.map((voice) => {
          if (typeof voice === "string") {
            return this.parseVoiceString(voice);
          }
          return voice;
        });
      } else {
        // Fallback to complete voice list
        this.voices = this.getDefaultVoices();
      }

      return this.voices;
    } catch (error) {
      console.error("Error fetching voices:", error);
      // Return complete default voices if API call fails
      this.voices = this.getDefaultVoices();
      return this.voices;
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
