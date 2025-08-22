// server.mjs
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs"; // Add this for synchronous operations
import { fileURLToPath } from "url";
import multer from "multer";
import { readdir } from "fs/promises";
import ttsService from "./src/services/ttsService.mjs";
import https from "https";
import http from "http";
import os from "os";

// ============= OPDS Helper Functions =============

/**
 * Get MIME type for book files
 */
function getMimeType(filename) {
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes = {
    pdf: "application/pdf",
    epub: "application/epub+zip",
    mobi: "application/x-mobipocket-ebook",
    azw3: "application/vnd.amazon.ebook",
    fb2: "application/x-fictionbook+xml",
    txt: "text/plain",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Escape special characters for XML
 */
function escapeXml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Check if a book should be shown in OPDS (filter out audiobooks)
 */
function shouldShowInOPDS(book) {
  // Filter by format
  if (book.format === "audio") return false;

  // Filter by itemType
  if (book.metadata?.itemType === "audiobook") return false;

  // Filter by file extension as safety check
  const audioExtensions = [
    ".m4b",
    ".m4a",
    ".mp3",
    ".aac",
    ".ogg",
    ".wma",
    ".flac",
  ];
  if (
    book.fileName &&
    audioExtensions.some((ext) => book.fileName.toLowerCase().endsWith(ext))
  ) {
    return false;
  }

  return true;
}

/**
 * Format date for OPDS (ISO 8601)
 */
function formatDate(date) {
  if (!date) return new Date().toISOString();
  if (date instanceof Date) return date.toISOString();
  try {
    return new Date(date).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ============= END - OPDS Helper Functions - END =============

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

// ---- Collections storage (.nostos/collections.json) ----
const NOSTOS_DIR = path.join(LIBRARY_ROOT, ".nostos");
const COLLECTIONS_PATH = path.join(NOSTOS_DIR, "collections.json");

const ensureCollectionsFile = async () => {
  await ensureDir(NOSTOS_DIR);
  try {
    await fs.stat(COLLECTIONS_PATH);
  } catch {
    const seed = {
      version: 1,
      updatedAt: new Date().toISOString(),
      collections: [],
    };
    await writeJSON(COLLECTIONS_PATH, seed);
  }
};

await ensureCollectionsFile(); // call once during boot

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

// ---------- COLLECTIONS API ----------
// Shape on disk: { version: 1, updatedAt: string, collections: Collection[] }
// Collection = { id, name, parentId?, bookIds: string[], createdAt, updatedAt }

app.get("/api/collections", async (_req, res) => {
  try {
    await ensureCollectionsFile();
    const data = await readJSON(COLLECTIONS_PATH, null);
    res.json((data && data.collections) || []);
  } catch (e) {
    console.error("collections:get", e);
    res.status(500).json({ error: "Could not read collections" });
  }
});

app.put("/api/collections", async (req, res) => {
  try {
    const collections = Array.isArray(req.body?.collections)
      ? req.body.collections
      : null;
    if (!collections) {
      return res
        .status(400)
        .json({ error: "Body must be { collections: Collection[] }" });
    }
    // Minimal validation
    for (const c of collections) {
      if (!c || typeof c !== "object")
        return res.status(400).json({ error: "Invalid collection" });
      if (typeof c.id !== "string" || typeof c.name !== "string")
        return res.status(400).json({ error: "Collection must have id/name" });
      if (!Array.isArray(c.bookIds))
        return res.status(400).json({ error: "bookIds must be an array" });
    }
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      collections,
    };
    await ensureCollectionsFile();
    await writeJSON(COLLECTIONS_PATH, payload);
    res.json({ ok: true, updatedAt: payload.updatedAt });
  } catch (e) {
    console.error("collections:put", e);
    res.status(500).json({ error: "Could not write collections" });
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

  // Get old notes to track concept changes
  let oldNotes = [];
  try {
    const oldData = await fs.readFile(path.join(dir, "notes.json"), "utf8");
    const parsed = JSON.parse(oldData);
    oldNotes = parsed.notes || [];
  } catch {}

  // Save notes as before
  await writeJSON(path.join(dir, "notes.json"), req.body || {});

  // Update concept index for each note
  if (req.body.notes) {
    // Create a map of old concepts
    const oldConceptsMap = {};
    oldNotes.forEach((note) => {
      oldConceptsMap[note.id] = note.linkedConcepts || [];
    });

    // Update index for each note
    for (const note of req.body.notes) {
      await updateConceptIndexForNote(
        req.params.id,
        note,
        oldConceptsMap[note.id] || []
      );
    }

    // Handle deleted notes
    const currentIds = req.body.notes.map((n) => n.id);
    const deletedNotes = oldNotes.filter((n) => !currentIds.includes(n.id));
    for (const deleted of deletedNotes) {
      await updateConceptIndexForNote(
        req.params.id,
        { id: deleted.id, content: null }, // Signal deletion
        deleted.linkedConcepts || []
      );
    }
  }

  res.json({ ok: true });
});

app.post("/api/notes/rebuild-index", async (req, res) => {
  try {
    const index = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      concepts: {},
      notes: {},
    };

    const books = await fs.readdir(LIBRARY_ROOT);
    let totalNotes = 0;

    for (const bookFolder of books) {
      if (bookFolder.startsWith("_")) continue; // Skip system files

      const bookPath = path.join(LIBRARY_ROOT, bookFolder);
      const stat = await fs.stat(bookPath);

      if (stat.isDirectory()) {
        const notesPath = path.join(bookPath, "notes.json");
        try {
          const notesData = await fs.readFile(notesPath, "utf8");
          const notes = JSON.parse(notesData);

          if (notes.notes) {
            for (const note of notes.notes) {
              totalNotes++;

              // Extract concepts from note content
              const linkRegex = /\[\[([^\]]+)\]\]/g;
              const concepts = [];
              let match;

              while ((match = linkRegex.exec(note.content)) !== null) {
                const concept = match[1].trim().toLowerCase();
                if (concept.length > 0 && !concepts.includes(concept)) {
                  concepts.push(concept);
                }
              }

              // Update note to have linkedConcepts field
              note.linkedConcepts = concepts;

              // Update index
              concepts.forEach((concept) => {
                if (!index.concepts[concept]) {
                  index.concepts[concept] = {
                    count: 0,
                    noteIds: [],
                    bookIds: new Set(),
                    lastUsed: note.createdAt,
                  };
                }

                index.concepts[concept].noteIds.push(note.id);
                index.concepts[concept].bookIds.add(bookFolder);
                index.concepts[concept].count++;

                // Update lastUsed to most recent
                if (
                  new Date(note.createdAt) >
                  new Date(index.concepts[concept].lastUsed)
                ) {
                  index.concepts[concept].lastUsed = note.createdAt;
                }
              });

              index.notes[note.id] = {
                bookId: bookFolder,
                concepts,
              };
            }

            // Save updated notes with linkedConcepts field
            await writeJSON(notesPath, notes);
          }
        } catch (error) {
          // Skip if notes.json doesn't exist
        }
      }
    }

    // Convert Sets to Arrays for JSON serialization
    Object.keys(index.concepts).forEach((concept) => {
      index.concepts[concept].bookIds = Array.from(
        index.concepts[concept].bookIds
      );
    });

    await saveConceptIndex(index);

    res.json({
      ok: true,
      stats: {
        totalConcepts: Object.keys(index.concepts).length,
        totalNotes: totalNotes,
      },
    });
  } catch (error) {
    console.error("Failed to rebuild index:", error);
    res.status(500).json({ error: "Failed to rebuild index" });
  }
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

      // Determine item type
      const primary = req.files?.file?.[0];
      if (!primary)
        return res.status(400).json({ error: "Missing 'file' field" });

      const ext = (primary.originalname.split(".").pop() || "").toLowerCase();
      const format = fmt(`x.${ext}`);

      // Determine itemType based on file format and metadata
      let itemType = rawMeta.itemType;
      if (!itemType) {
        if (format === "audio") {
          itemType = "audiobook";
        } else if (format === "epub") {
          itemType = "book";
        } else if (rawMeta?.doi && !rawMeta?.isbn) {
          itemType = "article";
        } else {
          itemType = "book";
        }
      }

      // Build folder name with format: "ITEMTYPE - TITLE - AUTHOR"
      const baseTitle = sanitize(
        rawMeta.title ||
          (primary.originalname || "Untitled").replace(/\.[^/.]+$/, "")
      );
      const author = rawMeta.author ? sanitize(rawMeta.author) : "";
      const itemTypeUpper = (itemType || "book").toUpperCase();

      // Format: "ITEMTYPE - TITLE - AUTHOR" or "ITEMTYPE - TITLE" if no author
      const baseFolder = author
        ? sanitize(`${itemTypeUpper} - ${baseTitle} - ${author}`)
        : sanitize(`${itemTypeUpper} - ${baseTitle}`);

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

      // Write primary file
      await fs.writeFile(path.join(dir, `book.${ext}`), primary.buffer);

      // Write metadata with itemType
      const metadata = {
        ...rawMeta,
        itemType: itemType,
        dateAdded: rawMeta.dateAdded || new Date().toISOString(),
      };
      await writeJSON(path.join(dir, "metadata.json"), metadata);

      // Optional cover (rest of the code remains the same)
      if (req.files?.cover?.[0]) {
        const cover = req.files.cover[0];
        const cext = (
          cover.originalname.split(".").pop() || "jpg"
        ).toLowerCase();
        await fs.writeFile(path.join(dir, `book.cover.${cext}`), cover.buffer);
      }

      // Return the created book
      const book = {
        id: folderName,
        folderName,
        fileName: `book.${ext}`,
        format,
        metadata,
      };

      res.json({ ok: true, book });
    } catch (e) {
      console.error("books:post", e);
      res.status(500).json({ error: "Could not upload book" });
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

// ============= OPDS Routes (Protected with Auth) =============
// Root OPDS catalog
app.get("/opds", async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    res.type("application/atom+xml; charset=utf-8");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>root</id>
  <title>My Digital Library</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>My Digital Library</name>
  </author>
  
  <link rel="self" 
        href="${baseUrl}/opds" 
        type="application/atom+xml;profile=opds-catalog"/>
  <link rel="start" 
        href="${baseUrl}/opds" 
        type="application/atom+xml;profile=opds-catalog"/>
  
  <entry>
    <title>All Books</title>
    <id>all</id>
    <updated>${new Date().toISOString()}</updated>
    <content type="text">Browse all books in your library</content>
    <link rel="subsection" 
          href="${baseUrl}/opds/all" 
          type="application/atom+xml;profile=opds-catalog"/>
  </entry>
  
  <entry>
    <title>Recently Added</title>
    <id>recent</id>
    <updated>${new Date().toISOString()}</updated>
    <content type="text">Books added in the last 30 days</content>
    <link rel="subsection" 
          href="${baseUrl}/opds/recent" 
          type="application/atom+xml;profile=opds-catalog"/>
  </entry>
</feed>`);
  } catch (error) {
    console.error("OPDS root error:", error);
    res.status(500).send("Error generating OPDS catalog");
  }
});

// All books OPDS feed
app.get("/opds/all", async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Get all books using your existing function
    const allBooks = await listBooks();

    // Filter out audiobooks
    const books = allBooks.filter((book) => shouldShowInOPDS(book));

    // Generate OPDS feed
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
  <id>all-books</id>
  <title>All Books</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>My Digital Library</name>
  </author>
  <link rel="self" 
        href="${baseUrl}/opds/all" 
        type="application/atom+xml;profile=opds-catalog"/>
  <link rel="up" 
        href="${baseUrl}/opds" 
        type="application/atom+xml;profile=opds-catalog"/>
  
  ${books
    .map((book) => {
      const m = book.metadata || {};
      const mimeType = getMimeType(book.fileName);

      // Determine cover file - look for any cover.* file
      const coverFile = m.coverFile || "book.cover.jpg";

      return `<entry>
    <id>${escapeXml(book.id)}</id>
    <title>${escapeXml(
      m.title || book.fileName.replace(/\.[^/.]+$/, "")
    )}</title>
    ${
      m.author
        ? `<author><name>${escapeXml(m.author)}</name></author>`
        : "<author><name>Unknown Author</name></author>"
    }
    <updated>${formatDate(m.dateAdded)}</updated>
    ${m.language ? `<dc:language>${escapeXml(m.language)}</dc:language>` : ""}
    ${
      m.publisher
        ? `<dc:publisher>${escapeXml(m.publisher)}</dc:publisher>`
        : ""
    }
    ${
      m.publishedDate
        ? `<dc:issued>${escapeXml(m.publishedDate)}</dc:issued>`
        : ""
    }
    ${
      m.description
        ? `<summary>${escapeXml(m.description)}</summary>`
        : "<summary>No description available</summary>"
    }
    
    <!-- Categories/Tags -->
    ${
      m.categories && Array.isArray(m.categories)
        ? m.categories
            .map(
              (cat) =>
                `<category term="${escapeXml(cat)}" label="${escapeXml(cat)}"/>`
            )
            .join("\n    ")
        : ""
    }
    
    <!-- Download link -->
    <link rel="http://opds-spec.org/acquisition" 
          href="${baseUrl}/files/${encodeURIComponent(
        book.folderName
      )}/${encodeURIComponent(book.fileName)}"
          type="${mimeType}"
          title="Download"/>
    
    <!-- Cover image if exists -->
    ${
      m.coverFile
        ? `<link rel="http://opds-spec.org/image" 
             href="${baseUrl}/files/${encodeURIComponent(
            book.folderName
          )}/${encodeURIComponent(coverFile)}"
             type="image/jpeg"/>
      <link rel="http://opds-spec.org/image/thumbnail" 
             href="${baseUrl}/files/${encodeURIComponent(
            book.folderName
          )}/${encodeURIComponent(coverFile)}"
             type="image/jpeg"/>`
        : ""
    }
  </entry>`;
    })
    .join("\n")}
</feed>`;

    res.type("application/atom+xml; charset=utf-8");
    res.send(feed);
  } catch (error) {
    console.error("OPDS all books error:", error);
    res.status(500).send("Error generating OPDS feed");
  }
});

// ---------- Serve built frontend (Vite build in ./dist) ----------
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback using a REGEX (works with Express 5 + path-to-regexp@6)
// This serves index.html for anything NOT starting with /api or /files
app.get(/^(?!\/(?:api|files|opds)\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ---------- Tailscale HTTPS Certification ----------

// Auto-detect hostname
const machineName = os.hostname().toLowerCase();
let hostname;

if (machineName.includes("desktop")) {
  hostname = "stationary-pc-home.tail87a215.ts.net";
} else {
  hostname = "nostos-server.tail87a215.ts.net";
}

// Rest of your HTTPS setup using the detected hostname
console.log(`🔐 Using certificates for: ${hostname}`);

const port = process.env.PORT || 8080;

// Tailscale certificate configuration
const tailscaleCertPath = `${process.env.LOCALAPPDATA}/Tailscale/certs`;
// REMOVED the duplicate hostname declaration - using the auto-detected one from above

const hasTailscaleCerts =
  tailscaleCertPath &&
  fsSync.existsSync(`${tailscaleCertPath}/${hostname}.crt`) &&
  fsSync.existsSync(`${tailscaleCertPath}/${hostname}.key`);

if (hasTailscaleCerts) {
  // HTTPS with Tailscale certificates
  const httpsOptions = {
    key: fsSync.readFileSync(`${tailscaleCertPath}/${hostname}.key`),
    cert: fsSync.readFileSync(`${tailscaleCertPath}/${hostname}.crt`),
  };

  https.createServer(httpsOptions, app).listen(443, () => {
    console.log(`🔐 HTTPS server running (Tailscale certificates)`);
    console.log(`🌐 Access at: https://${hostname}`);
    console.log(`📂 Library root: ${LIBRARY_ROOT}`);
  });

  // ALSO run HTTP server for compatibility
  http.createServer(app).listen(80, () => {
    console.log(`📚 HTTP server also running on port 80`);
    console.log(`🌐 HTTP access at: http://${hostname}`);
  });
} else {
  // Fallback to HTTP if no Tailscale certs
  app.listen(port, () => {
    console.log(`📚 HTTP server running on port ${port}`);
    console.log(`📂 Library root: ${LIBRARY_ROOT}`);
  });
}

// ---------- TTS ENDPOINTS (OpenAI-Compatible Kokoro) ----------

// Get available voices
app.get("/api/tts/voices", async (_req, res) => {
  try {
    const voices = await ttsService.getVoices();
    res.json(voices);
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

// Check TTS availability
app.get("/api/tts/status", async (_req, res) => {
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
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const dataBuffer = await fs.readFile(path.join(bookPath, bookFile));
        const data = await pdfParse(dataBuffer);

        if (startPage && endPage) {
          const allText = data.text;
          const pages = allText.split(/\f/);
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

    extractedText = extractedText
      .replace(/<[^>]*>/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[^\x00-\x7F]/g, "")
      .trim();

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
app.get("/api/tts/models", async (_req, res) => {
  try {
    const models = await ttsService.getModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch models" });
  }
});

// Load sentence index for a book
app.get("/api/books/:id/tts/sentences", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    const sentencesPath = path.join(bookPath, "sentences.json");

    try {
      const data = await fs.readFile(sentencesPath, "utf8");
      res.json(JSON.parse(data));
    } catch (error) {
      // Return empty structure if file doesn't exist
      res.json({
        version: 1,
        epub: { spine: {} },
        pdf: { pages: {} },
      });
    }
  } catch (error) {
    console.error("Error loading sentences:", error);
    res.status(500).json({ error: "Failed to load sentences" });
  }
});

// Save sentence index for a book
app.put("/api/books/:id/tts/sentences", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    await ensureDir(bookPath);

    const sentencesPath = path.join(bookPath, "sentences.json");
    await fs.writeFile(sentencesPath, JSON.stringify(req.body, null, 2));

    res.json({ ok: true });
  } catch (error) {
    console.error("Error saving sentences:", error);
    res.status(500).json({ error: "Failed to save sentences" });
  }
});

// Load TTS bookmark for a book
app.get("/api/books/:id/tts/bookmark", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    const bookmarkPath = path.join(bookPath, "tts-bookmark.json");

    try {
      const data = await fs.readFile(bookmarkPath, "utf8");
      res.json(JSON.parse(data));
    } catch (error) {
      // Return null if no bookmark exists
      res.json(null);
    }
  } catch (error) {
    console.error("Error loading bookmark:", error);
    res.status(500).json({ error: "Failed to load bookmark" });
  }
});

// Save TTS bookmark for a book
app.put("/api/books/:id/tts/bookmark", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    await ensureDir(bookPath);

    const bookmarkPath = path.join(bookPath, "tts-bookmark.json");
    await fs.writeFile(bookmarkPath, JSON.stringify(req.body, null, 2));

    res.json({ ok: true });
  } catch (error) {
    console.error("Error saving bookmark:", error);
    res.status(500).json({ error: "Failed to save bookmark" });
  }
});

// Load TTS settings for a book
app.get("/api/books/:id/tts/settings", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    const settingsPath = path.join(bookPath, "tts-settings.json");

    try {
      const data = await fs.readFile(settingsPath, "utf8");
      res.json(JSON.parse(data));
    } catch (error) {
      // Return default settings if file doesn't exist
      res.json({
        voice: "af_heart",
        rate: 1.0,
        volume: 1.0,
      });
    }
  } catch (error) {
    console.error("Error loading TTS settings:", error);
    res.status(500).json({ error: "Failed to load TTS settings" });
  }
});

// Save TTS settings for a book
app.put("/api/books/:id/tts/settings", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    await ensureDir(bookPath);

    const settingsPath = path.join(bookPath, "tts-settings.json");
    await fs.writeFile(settingsPath, JSON.stringify(req.body, null, 2));

    res.json({ ok: true });
  } catch (error) {
    console.error("Error saving TTS settings:", error);
    res.status(500).json({ error: "Failed to save TTS settings" });
  }
});

// Get EPUB chapter content for sentence indexing
app.get("/api/books/:id/epub/chapter/:href", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    const files = await fs.readdir(bookPath);
    const epubFile = files.find((n) => n.endsWith(".epub"));

    if (!epubFile) {
      return res.status(404).json({ error: "EPUB file not found" });
    }

    // Use epub library to extract chapter content
    const EPub = (await import("epub")).default;
    const epubPath = path.join(bookPath, epubFile);

    return new Promise((resolve, reject) => {
      const epub = new EPub(epubPath);

      epub.on("end", () => {
        // Find the chapter by href
        const chapter = epub.spine.contents.find(
          (item) =>
            item.href === req.params.href || item.href.endsWith(req.params.href)
        );

        if (!chapter) {
          return res.status(404).json({ error: "Chapter not found" });
        }

        epub.getChapter(chapter.id, (error, text) => {
          if (error) {
            console.error("Error reading chapter:", error);
            return res.status(500).json({ error: "Failed to read chapter" });
          }

          res.json({
            href: chapter.href,
            html: text,
          });
        });
      });

      epub.on("error", (error) => {
        console.error("EPUB parsing error:", error);
        res.status(500).json({ error: "Failed to parse EPUB" });
      });

      epub.parse();
    });
  } catch (error) {
    console.error("Error extracting EPUB chapter:", error);
    res.status(500).json({ error: "Failed to extract chapter" });
  }
});

// Get PDF page text content for sentence indexing
app.get("/api/books/:id/pdf/page/:page", async (req, res) => {
  try {
    const bookPath = path.join(LIBRARY_ROOT, req.params.id);
    const files = await fs.readdir(bookPath);
    const pdfFile = files.find((n) => n.endsWith(".pdf"));

    if (!pdfFile) {
      return res.status(404).json({ error: "PDF file not found" });
    }

    const pageNum = parseInt(req.params.page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }

    // Use pdf-parse to extract page text
    const pdfParse = (await import("pdf-parse")).default;
    const dataBuffer = await fs.readFile(path.join(bookPath, pdfFile));

    // Parse with page-specific options
    const data = await pdfParse(dataBuffer, {
      pagerender: function (pageData) {
        // Only render the requested page
        if (pageData.pageIndex + 1 === pageNum) {
          return pageData.getTextContent().then(function (textContent) {
            return textContent.items.map((item) => item.str).join(" ");
          });
        }
        return "";
      },
    });

    // Extract just the text for the requested page
    const allText = data.text;
    const pages = allText.split(/\f/); // Form feed separates pages
    const pageText = pages[pageNum - 1] || "";

    res.json({
      page: pageNum,
      text: pageText.trim(),
    });
  } catch (error) {
    console.error("Error extracting PDF page:", error);
    res.status(500).json({ error: "Failed to extract page text" });
  }
});

// Enhanced TTS synthesis endpoint that returns ArrayBuffer for AudioContext
app.post("/api/tts/synthesize-buffer", async (req, res) => {
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
      "Content-Type": "application/octet-stream",
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

// Throttled bookmark saving to avoid too frequent writes
const bookmarkSaveQueues = new Map();

app.put("/api/books/:id/tts/bookmark-throttled", async (req, res) => {
  const bookId = req.params.id;

  // Clear existing timer for this book
  if (bookmarkSaveQueues.has(bookId)) {
    clearTimeout(bookmarkSaveQueues.get(bookId));
  }

  // Set new timer to save after 2 seconds of inactivity
  const timer = setTimeout(async () => {
    try {
      const bookPath = path.join(LIBRARY_ROOT, bookId);
      await ensureDir(bookPath);

      const bookmarkPath = path.join(bookPath, "tts-bookmark.json");
      await fs.writeFile(bookmarkPath, JSON.stringify(req.body, null, 2));

      bookmarkSaveQueues.delete(bookId);
    } catch (error) {
      console.error("Error saving throttled bookmark:", error);
    }
  }, 2000);

  bookmarkSaveQueues.set(bookId, timer);

  // Return immediately
  res.json({ ok: true, queued: true });
});

// ============= CONCEPT INDEX SYSTEM =============
const CONCEPT_INDEX_PATH = path.join(LIBRARY_ROOT, "_concept_index.json");

// Load or create concept index
async function loadConceptIndex() {
  try {
    const data = await fs.readFile(CONCEPT_INDEX_PATH, "utf8");
    return JSON.parse(data);
  } catch {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      concepts: {},
      notes: {},
    };
  }
}

// Save concept index
async function saveConceptIndex(index) {
  await fs.writeFile(CONCEPT_INDEX_PATH, JSON.stringify(index, null, 2));
}

// Update index when a note is added/updated/deleted
async function updateConceptIndexForNote(bookId, note, oldConcepts = []) {
  const index = await loadConceptIndex();

  // Remove old concept references
  oldConcepts.forEach((concept) => {
    if (index.concepts[concept]) {
      index.concepts[concept].noteIds = index.concepts[concept].noteIds.filter(
        (id) => id !== note.id
      );
      if (index.concepts[concept].noteIds.length === 0) {
        delete index.concepts[concept];
      }
    }
  });

  // If note is being deleted, also remove from notes index
  if (!note.content) {
    delete index.notes[note.id];
    index.lastUpdated = new Date().toISOString();
    await saveConceptIndex(index);
    return;
  }

  // Add new concept references
  (note.linkedConcepts || []).forEach((concept) => {
    if (!index.concepts[concept]) {
      index.concepts[concept] = {
        count: 0,
        noteIds: [],
        bookIds: [], // Start as Array, not Set
        lastUsed: new Date().toISOString(),
      };
    }

    // Add note ID if not already present
    if (!index.concepts[concept].noteIds.includes(note.id)) {
      index.concepts[concept].noteIds.push(note.id);
    }

    // FIXED: Handle bookIds as Array
    if (!Array.isArray(index.concepts[concept].bookIds)) {
      // Convert Set to Array if needed
      index.concepts[concept].bookIds = Array.from(
        index.concepts[concept].bookIds
      );
    }

    // Add bookId if not already present
    if (!index.concepts[concept].bookIds.includes(bookId)) {
      index.concepts[concept].bookIds.push(bookId);
    }

    index.concepts[concept].count = index.concepts[concept].noteIds.length;
    index.concepts[concept].lastUsed = new Date().toISOString();
  });

  // Update note entry
  index.notes[note.id] = {
    bookId,
    concepts: note.linkedConcepts || [],
  };

  index.lastUpdated = new Date().toISOString();
  await saveConceptIndex(index);
}

// ============= API ENDPOINTS =============

// Get all unique concepts (FAST - uses index)
app.get("/api/notes/concepts", async (req, res) => {
  try {
    const index = await loadConceptIndex();

    // Return concepts sorted by usage frequency and recency
    const concepts = Object.keys(index.concepts)
      .map((concept) => ({
        name: concept,
        count: index.concepts[concept].count,
        lastUsed: index.concepts[concept].lastUsed,
      }))
      .sort((a, b) => {
        // First by count (popularity), then by recency
        if (b.count !== a.count) return b.count - a.count;
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      })
      .map((c) => c.name);

    res.json(concepts);
  } catch (error) {
    console.error("Failed to get concepts:", error);
    res.status(500).json({ error: "Failed to get concepts" });
  }
});

// Search notes by concept (FAST - uses index)
app.get("/api/notes/search", async (req, res) => {
  try {
    const concept = (req.query.concept || "").toLowerCase();
    const index = await loadConceptIndex();

    if (!index.concepts[concept]) {
      return res.json([]);
    }

    // Get all note IDs for this concept
    const noteIds = index.concepts[concept].noteIds;
    const bookIds = Array.isArray(index.concepts[concept].bookIds)
      ? index.concepts[concept].bookIds
      : Array.from(index.concepts[concept].bookIds);

    // Load only the relevant notes
    const results = [];

    for (const bookId of bookIds) {
      const notesPath = path.join(LIBRARY_ROOT, bookId, "notes.json");
      const metadataPath = path.join(LIBRARY_ROOT, bookId, "metadata.json");

      try {
        const [notesData, metadataData] = await Promise.all([
          fs.readFile(notesPath, "utf8"),
          fs.readFile(metadataPath, "utf8").catch(() => "{}"),
        ]);

        const notes = JSON.parse(notesData);
        const metadata = JSON.parse(metadataData);
        const bookTitle = metadata.title || bookId;

        if (notes.notes) {
          const relevantNotes = notes.notes
            .filter((note) => noteIds.includes(note.id))
            .map((note) => ({
              ...note,
              bookId,
              bookTitle,
            }));

          results.push(...relevantNotes);
        }
      } catch (error) {
        // Skip if files don't exist
      }
    }

    res.json(
      results.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  } catch (error) {
    console.error("Concept search failed:", error);
    res.status(500).json({ error: "Concept search failed" });
  }
});
