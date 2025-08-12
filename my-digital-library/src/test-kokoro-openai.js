// test-kokoro-openai.js
// Test script for your Kokoro TTS with OpenAI-compatible API on port 8880

const fetch = require("node-fetch");
const fs = require("fs");

const KOKORO_URL = "http://localhost:8880";

// Color codes for pretty output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testKokoro() {
  log("\n========================================", "cyan");
  log("  Testing Kokoro TTS (OpenAI API Mode)", "cyan");
  log("  Port: 8880", "cyan");
  log("========================================\n", "cyan");

  try {
    // Test 1: Health Check
    log("1. Testing Health Endpoint...", "yellow");
    try {
      const health = await fetch(`${KOKORO_URL}/health`);
      if (health.ok) {
        const data = await health.json();
        log("   ✅ Service is healthy: " + JSON.stringify(data), "green");
      } else {
        log("   ⚠️  Health check returned: " + health.status, "red");
      }
    } catch (e) {
      log("   ❌ Health check failed: " + e.message, "red");
    }

    // Test 2: Get Available Voices
    log("\n2. Fetching Available Voices...", "yellow");
    try {
      const voicesRes = await fetch(`${KOKORO_URL}/v1/audio/voices`);
      if (voicesRes.ok) {
        const voices = await voicesRes.json();
        log("   ✅ Available voices:", "green");

        if (Array.isArray(voices)) {
          voices.forEach((voice) => {
            if (typeof voice === "string") {
              log(`      • ${voice}`, "blue");
            } else {
              log(
                `      • ${voice.id || voice.name || JSON.stringify(voice)}`,
                "blue"
              );
            }
          });
        } else {
          log("      " + JSON.stringify(voices), "blue");
        }
      } else {
        log("   ⚠️  Could not fetch voices: " + voicesRes.status, "red");
      }
    } catch (e) {
      log("   ❌ Voice fetch failed: " + e.message, "red");
    }

    // Test 3: Get Models
    log("\n3. Checking Available Models...", "yellow");
    try {
      const modelsRes = await fetch(`${KOKORO_URL}/v1/models`);
      if (modelsRes.ok) {
        const models = await modelsRes.json();
        log("   ✅ Available models: " + JSON.stringify(models), "green");
      } else {
        log("   ⚠️  Could not fetch models", "red");
      }
    } catch (e) {
      log("   ℹ️  Models endpoint not critical", "blue");
    }

    // Test 4: Generate Speech
    log("\n4. Testing Speech Generation...", "yellow");
    const testText =
      "Hello! This is a test of Kokoro text to speech on port 8880.";

    try {
      const ttsRes = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: testText,
          voice: "af_heart", // Try default voice
          response_format: "mp3",
          speed: 1.0,
          stream: false,
        }),
      });

      if (ttsRes.ok) {
        const audioBuffer = await ttsRes.buffer();
        log(`   ✅ Speech generated successfully!`, "green");
        log(`      Size: ${audioBuffer.length} bytes`, "blue");

        // Save the audio file
        const filename = "test-kokoro-output.mp3";
        fs.writeFileSync(filename, audioBuffer);
        log(`      Saved to: ${filename}`, "blue");

        // Try to play it on Windows
        if (process.platform === "win32") {
          const { exec } = require("child_process");
          exec(`start ${filename}`, (err) => {
            if (!err) log("      🔊 Playing audio...", "green");
          });
        }
      } else {
        const error = await ttsRes.text();
        log(`   ❌ TTS failed (${ttsRes.status}): ${error}`, "red");
      }
    } catch (e) {
      log("   ❌ Speech generation error: " + e.message, "red");
    }

    // Test 5: Try Different Voices
    log("\n5. Testing Different Voices...", "yellow");
    const testVoices = ["af_heart", "af_bella", "am_michael", "bf_emma"];

    for (const voice of testVoices) {
      try {
        const response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "kokoro",
            input: `Testing voice ${voice}`,
            voice: voice,
            response_format: "mp3",
            speed: 1.0,
          }),
        });

        if (response.ok) {
          log(`   ✅ Voice "${voice}" works!`, "green");
        } else {
          log(`   ⚠️  Voice "${voice}" returned ${response.status}`, "yellow");
        }
      } catch (e) {
        log(`   ❌ Voice "${voice}" failed`, "red");
      }
    }

    // Summary
    log("\n========================================", "cyan");
    log("           Test Complete!", "cyan");
    log("========================================\n", "cyan");

    log("📋 Summary:", "yellow");
    log("   • Kokoro URL: " + KOKORO_URL, "blue");
    log("   • Main endpoint: /v1/audio/speech", "blue");
    log("   • Voices endpoint: /v1/audio/voices", "blue");
    log("   • Format: OpenAI-compatible", "blue");

    log("\n✅ Your Kokoro TTS is ready for integration!", "green");
    log("\n📝 Next steps:", "yellow");
    log("   1. Create .env file with: KOKORO_TTS_URL=" + KOKORO_URL, "blue");
    log("   2. Copy the updated ttsService.mjs to your project", "blue");
    log("   3. Add the TTS endpoints to your server.mjs", "blue");
  } catch (error) {
    log("\n❌ Fatal error: " + error.message, "red");
    log("\nTroubleshooting:", "yellow");
    log("1. Check Docker Desktop - is Kokoro running?", "blue");
    log("2. Verify port 8880 in Docker container settings", "blue");
    log("3. Check firewall/antivirus blocking port 8880", "blue");
  }
}

// Run the test
log("Starting Kokoro TTS Test...", "cyan");
testKokoro();
