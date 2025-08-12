// server.mjs
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import multer from "multer";
import { readdir } from "fs/promises";
import ttsService from "./src/services/ttsService.mjs";

// --- ESM __dirname/__filename ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Default path: C:/digital-library  (override with LIBRARY_ROOT env)
const LIBRARY_ROOT = process.env.LIBRARY_ROOT || "C:/digital-library";

// --- utils ---
const sanitize = (name) =>
  name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

const fmt = (name) => {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".epub")) return "epub";
  if (n.match(/\.(mp3|wav|m4a|m4b|aac|flac|ogg)$/)) return "audio";
  return null;
};

const ensureDir = async (p) => fs.mkdir(p, { recursive: true });

const findAvailable = async (base) => {
  let name = base;
  let i = 2;
  while (true) {
    try {
      await fs.stat(path.join(LIBRARY_ROOT, name));
      name = `${base} (${i++})`;
    } catch {
      return name;
    }
  }
};

const readJSON = async (p, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJSON = (p, data) => fs.writeFile(p, JSON.stringify(data, null, 2));

const listBooks = async () => {
  const entries = await fs.readdir(LIBRARY_ROOT, { withFileTypes: true });
  const books = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const folder = path.join(LIBRARY_ROOT, e.name);
    const files = await fs.readdir(folder);
    const fileName = files.find((n) => fmt(n));
    if (!fileName) continue;
    const metadata = await readJSON(path.join(folder, "metadata.json"), null);
    books.push({
      id: e.name,
      folderName: e.name,
      fileName,
      format: fmt(fileName),
      metadata,
    });
  }
  return books;
};

// Add this debug route before your static middleware
app.get("/debug/dist", async (req, res) => {
  try {
    const distPath = path.join(__dirname, "dist");
    const files = await readdir(distPath, { recursive: true });
    res.json(files);
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ---------- READ ----------
app.get("/api/books", async (_req, res) => {
  try {
    res.json(await listBooks());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list books" });
  }
});

app.get("/api/books/:id/metadata", async (req, res) => {
  const p = path.join(LIBRARY_ROOT, req.params.id, "metadata.json");
  res.type("json").send((await readJSON(p, null)) ?? null);
});

app.put("/api/books/:id/metadata", async (req, res) => {
  const dir = path.join(LIBRARY_ROOT, req.params.id);
  await ensureDir(dir);
  await writeJSON(path.join(dir, "metadata.json"), req.body || {});
  res.json({ ok: true });
});

app.get("/api/books/:id/notes", async (req, res) => {
  const p = path.join(LIBRARY_ROOT, req.params.id, "notes.json");
  res
    .type("json")
    .send(
      await readJSON(p, { bookId: req.params.id, notes: [], lastUpdated: null })
    );
});

app.put("/api/books/:id/notes", async (req, res) => {
  const dir = path.join(LIBRARY_ROOT, req.params.id);
  await ensureDir(dir);
  await writeJSON(path.join(dir, "notes.json"), req.body || {});
  res.json({ ok: true });
});

// ---------- CREATE / UPDATE FILES (UPLOADS) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

// Create a new book folder + primary file (+ optional cover + metadata)
// mode=auto-number|overwrite|fail (default auto-number)
app.post(
  "/api/books",
  upload.fields([{ name: "file" }, { name: "cover" }]),
  async (req, res) => {
    try {
      const mode = (req.query.mode || "auto-number").toString();
      const rawMeta = req.body.metadata ? JSON.parse(req.body.metadata) : {};
      const baseTitle = sanitize(
        rawMeta.title ||
          (req.files?.file?.[0]?.originalname || "Untitled").replace(
            /\.[^/.]+$/,
            ""
          )
      );
      const author = rawMeta.author ? ` - ${sanitize(rawMeta.author)}` : "";
      const baseFolder = sanitize(`${baseTitle}${author}`);
      let folderName = baseFolder;

      const dirExists = async (name) => {
        try {
          await fs.stat(path.join(LIBRARY_ROOT, name));
          return true;
        } catch {
          return false;
        }
      };

      if (await dirExists(folderName)) {
        if (mode === "overwrite") {
          await fs.rm(path.join(LIBRARY_ROOT, folderName), {
            recursive: true,
            force: true,
          });
        } else if (mode === "fail") {
          return res
            .status(409)
            .json({ error: "Folder exists", conflictingName: folderName });
        } else {
          folderName = await findAvailable(baseFolder);
        }
      }

      const dir = path.join(LIBRARY_ROOT, folderName);
      await ensureDir(dir);

      // write primary file
      if (!req.files?.file?.[0])
        return res.status(400).json({ error: "Missing 'file' field" });
      const primary = req.files.file[0];
      const ext = (primary.originalname.split(".").pop() || "").toLowerCase();
      const f = fmt(`x.${ext}`);
      if (!f) return res.status(400).json({ error: "Unsupported file type" });
      await fs.writeFile(path.join(dir, `book.${ext}`), primary.buffer);

      // write metadata
      const metadata = {
        ...rawMeta,
        itemType:
          f === "audio"
            ? "audiobook"
            : f === "epub"
            ? "book"
            : rawMeta?.doi && !rawMeta?.isbn
            ? "article"
            : rawMeta.itemType || "book",
        dateAdded: rawMeta.dateAdded || new Date().toISOString(),
      };
      await writeJSON(path.join(dir, "metadata.json"), metadata);

      // optional cover
      if (req.files?.cover?.[0]) {
        const cover = req.files.cover[0];
        const cext = (
          cover.originalname.split(".").pop() || "jpg"
        ).toLowerCase();
        await fs.writeFile(path.join(dir, `cover.${cext}`), cover.buffer);
        metadata.coverFile = `cover.${cext}`;
        await writeJSON(path.join(dir, "metadata.json"), metadata);
      }

      res.json({
        ok: true,
        book: {
          id: folderName,
          folderName,
          fileName: `book.${ext}`,
          format: f,
          metadata,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// Replace primary file for a book
app.put("/api/books/:id/file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    const dir = path.join(LIBRARY_ROOT, req.params.id);
    await ensureDir(dir);

    // remove any existing primary book.* file
    const files = await fs.readdir(dir);
    for (const n of files) {
      if (n.startsWith("book."))
        await fs.rm(path.join(dir, n), { force: true });
    }

    const ext = (req.file.originalname.split(".").pop() || "").toLowerCase();
    await fs.writeFile(path.join(dir, `book.${ext}`), req.file.buffer);
    res.json({ ok: true, fileName: `book.${ext}`, format: fmt(`x.${ext}`) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Replace failed" });
  }
});

// Upload/replace cover
app.put("/api/books/:id/cover", upload.single("cover"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing cover" });
    const dir = path.join(LIBRARY_ROOT, req.params.id);
    await ensureDir(dir);

    // remove old cover.*
    const files = await fs.readdir(dir);
    for (const n of files)
      if (n.startsWith("cover."))
        await fs.rm(path.join(dir, n), { force: true });

    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const coverName = `cover.${ext}`;
    await fs.writeFile(path.join(dir, coverName), req.file.buffer);

    // patch metadata
    const metaPath = path.join(dir, "metadata.json");
    const meta = (await readJSON(metaPath, {})) || {};
    meta.coverFile = coverName;
    meta.coverUrl = undefined;
    await writeJSON(metaPath, meta);

    res.json({ ok: true, coverFile: coverName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Cover upload failed" });
  }
});

// Rename book folder
app.put("/api/books/:id/rename", async (req, res) => {
  try {
    const { newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: "Missing newName" });
    const safe = sanitize(newName);
    const src = path.join(LIBRARY_ROOT, req.params.id);
    let dstName = safe;

    // avoid conflict
    try {
      await fs.stat(path.join(LIBRARY_ROOT, dstName));
      dstName = await findAvailable(safe);
    } catch {}

    await fs.rename(src, path.join(LIBRARY_ROOT, dstName));
    res.json({ ok: true, id: dstName, folderName: dstName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Rename failed" });
  }
});

// Delete a book folder
app.delete("/api/books/:id", async (req, res) => {
  await fs.rm(path.join(LIBRARY_ROOT, req.params.id), {
    recursive: true,
    force: true,
  });
  res.json({ ok: true });
});

// Serve files (PDF/EPUB/audio/cover)
app.use("/files", express.static(LIBRARY_ROOT, { fallthrough: false }));

// ---------- Serve built frontend (Vite build in ./dist) ----------
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback using a REGEX (works with Express 5 + path-to-regexp@6)
// This serves index.html for anything NOT starting with /api or /files
app.get(/^(?!\/(?:api|files)\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`📚 server :${port}`);
  console.log(`📂 root   ${LIBRARY_ROOT}`);
});

// Add these to your server.mjs file

// ---------- TTS ENDPOINTS (OpenAI-Compatible Kokoro) ----------

// Get available voices
app.get("/api/tts/voices", async (req, res) => {
  try {
    const voices = await ttsService.getVoices();
    res.json(voices);
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

// Check TTS availability
app.get("/api/tts/status", async (req, res) => {
  try {
    const available = await ttsService.isAvailable();
    const voices = available ? await ttsService.getVoices() : [];
    res.json({
      available,
      service: "Kokoro TTS (OpenAI Mode)",
      endpoint: process.env.KOKORO_TTS_URL || "http://localhost:8880",
      voiceCount: voices.length,
    });
  } catch (error) {
    res.json({ available: false, error: error.message });
  }
});

// Generate TTS for text
app.post("/api/tts/synthesize", async (req, res) => {
  try {
    const { text, voice, speed } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Default to af_heart if no voice specified
    const selectedVoice = voice || "af_heart";

    const audioBuffer = await ttsService.synthesize(text, {
      voice: selectedVoice,
      speed: speed || 1.0,
      format: "mp3",
    });

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "public, max-age=3600",
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error("TTS synthesis error:", error);
    res
      .status(500)
      .json({ error: "Failed to synthesize speech: " + error.message });
  }
});

// Extract and prepare text from book for TTS
app.post("/api/books/:id/tts/extract", async (req, res) => {
  try {
    const { startPage, endPage, chapter, maxLength = 5000 } = req.body;
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    const files = await fs.readdir(bookPath);
    const bookFile = files.find((n) => fmt(n));

    if (!bookFile) {
      return res.status(404).json({ error: "Book file not found" });
    }

    const format = fmt(bookFile);
    let extractedText = "";

    if (format === "pdf") {
      // For PDFs - you'll need pdf-parse
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const dataBuffer = await fs.readFile(path.join(bookPath, bookFile));
        const data = await pdfParse(dataBuffer);

        if (startPage && endPage) {
          // Simple page extraction (you may need more sophisticated parsing)
          const allText = data.text;
          const pages = allText.split(/\f/); // Form feed character often separates pages

          const start = Math.max(0, startPage - 1);
          const end = Math.min(pages.length, endPage);
          extractedText = pages.slice(start, end).join("\n\n");
        } else {
          extractedText = data.text;
        }
      } catch (error) {
        console.error("PDF extraction error:", error);
        return res.status(500).json({ error: "Failed to extract PDF text" });
      }
    } else if (format === "epub") {
      // For EPUBs - you'll need epub or epub-parser
      try {
        const EPub = (await import("epub")).default;
        const epub = new EPub(path.join(bookPath, bookFile));

        await new Promise((resolve, reject) => {
          epub.on("end", resolve);
          epub.on("error", reject);
          epub.parse();
        });

        if (chapter !== undefined && epub.flow[chapter]) {
          const chapterData = await new Promise((resolve, reject) => {
            epub.getChapter(epub.flow[chapter].id, (err, text) => {
              if (err) reject(err);
              else resolve(text);
            });
          });
          extractedText = chapterData;
        } else {
          // Get first chapter as default
          if (epub.flow && epub.flow[0]) {
            const firstChapter = await new Promise((resolve, reject) => {
              epub.getChapter(epub.flow[0].id, (err, text) => {
                if (err) reject(err);
                else resolve(text);
              });
            });
            extractedText = firstChapter;
          }
        }
      } catch (error) {
        console.error("EPUB extraction error:", error);
        return res.status(500).json({ error: "Failed to extract EPUB text" });
      }
    } else {
      return res.status(400).json({ error: "Format not supported for TTS" });
    }

    // Clean the text
    extractedText = extractedText
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/\[.*?\]/g, "") // Remove markdown links
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\x00-\x7F]/g, "") // Remove non-ASCII for safety
      .trim();

    // Limit length if needed
    if (maxLength && extractedText.length > maxLength) {
      extractedText = extractedText.substring(0, maxLength) + "...";
    }

    res.json({
      text: extractedText,
      wordCount: extractedText.split(/\s+/).filter((w) => w.length > 0).length,
      characterCount: extractedText.length,
    });
  } catch (error) {
    console.error("Text extraction error:", error);
    res.status(500).json({ error: "Failed to extract text: " + error.message });
  }
});

// Stream TTS for long texts
app.post("/api/tts/stream", async (req, res) => {
  try {
    const { chunks, voice, speed } = req.body;

    if (!chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ error: "Chunks array is required" });
    }

    res.set({
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    for await (const audioBuffer of ttsService.synthesizeStream(chunks, {
      voice: voice || "af_heart",
      speed: speed || 1.0,
    })) {
      res.write(audioBuffer);
    }

    res.end();
  } catch (error) {
    console.error("TTS streaming error:", error);
    res.status(500).json({ error: "Failed to stream speech" });
  }
});

// Get TTS models (optional endpoint)
app.get("/api/tts/models", async (req, res) => {
  try {
    const models = await ttsService.getModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch models" });
  }
});
