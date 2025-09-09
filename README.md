# 📚 Nostos
**Your Intellectual Homecoming**

A modern, feature-rich personal digital library application for organizing, reading, and annotating your book collection. Built with React, TypeScript, and Tailwind CSS.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-06b6d4)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)
![Vite](https://img.shields.io/badge/Vite-6.0-646cff)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Key Features

### 📖 Reading Experience
- **Multi-Format Support**: Native readers for EPUB, PDF, and audiobooks
- **Advanced EPUB Reader**: 
  - Full ePub.js integration with CFI navigation
  - Customizable themes and typography
  - Chapter navigation with nested table of contents
  - Text selection and highlighting
  - Full-text search with occurrence highlighting
- **PDF Reader**: 
  - PDF.js-powered viewing with zoom and navigation
  - Page-based bookmarking and progress tracking
  - Text selection and search capabilities
- **Audiobook Player**: Support for MP3, M4A, M4B, WAV, AAC, FLAC, OGG formats

### 🎙️ Text-to-Speech (TTS)
- **Kokoro TTS Integration**: 50+ high-quality neural voices
  - Languages: American English, British English, Spanish, French, Italian, Japanese, Chinese, Hindi, Portuguese
  - Gender options: Male and female voices for each language
  - Special voices: V0 series (Nicole, Sarah, Sky, Adam, Michael, etc.)
- **Advanced Playback**:
  - Sentence-level highlighting synchronized with speech
  - Adjustable speech rate (0.5x - 2.0x) and volume
  - Background audio buffering for smooth playback
  - Resume from last position
  - Web Worker-based sentence indexing

### 📝 Note-Taking & Knowledge Management
- **Smart Notes System**:
  - Wiki-style concept linking with `[[concept]]` syntax
  - Automatic backlink generation
  - Cross-book concept network
  - Concept search and navigation
- **Highlighting & Annotations**:
  - Multiple highlight colors (yellow, green, blue, pink, orange)
  - Quote extraction from selected text
  - Location-based notes (CFI for EPUB, page numbers for PDF)
- **Citation Generation**:
  - Formats: APA 7th, MLA 9th, Chicago 17th, Harvard (Cite Them Right)
  - Automatic bibliographic formatting
  - Copy-to-clipboard functionality

### 📚 Library Organization
- **Hierarchical Collections**: 
  - Nested folder structure with parent-child relationships
  - Smart collections: Recently Read, Favorites, Currently Reading, Finished
  - Drag-and-drop organization (planned)
  - Collection-based filtering
- **Advanced Search & Filters**:
  - Full-text search across library
  - Filter by: Format, Rating (1-5 stars), Reading Status
  - Search within notes and highlights
- **Metadata Management**:
  - ISBN lookup via Zotero Translation Server
  - DOI lookup for academic articles
  - Integration with Open Library and Google Books APIs
  - Item types: Books, Audiobooks, Articles
  - Custom metadata fields per item type

### 🎨 Customization & Themes
- **Built-in Themes**:
  - Paper: Light, classic reading experience
  - Sepia: Warm, comfortable tones
  - Night: Dark mode for evening reading
  - OLED: True black for OLED displays
  - High Contrast: Accessibility-focused
- **Typography Controls**:
  - Font size: 70-200% scaling
  - Font family: Serif or Sans-serif
  - Line height: 1.2 - 2.5
  - Text alignment: Left or Justified
- **Auto Theme Switching**: Time-based automatic theme changes

### 🔐 Authentication & Security
- **Clerk Authentication**: 
  - Secure user management
  - SSO support
  - Session persistence
- **User Isolation**: Individual libraries per authenticated user
- **File Security**: Type validation and sanitization

### 📱 Cross-Platform Access
- **Responsive Design**: Optimized for phones, tablets, and desktops
- **OPDS Catalog**: `/opds` endpoint for e-reader integration (KOReader, Calibre)
- **Progressive Web App**: Installable on mobile devices
- **Touch Gestures**: Swipe navigation for page turning

## 🚀 Getting Started

### Prerequisites
- **Node.js** 20.0.0 or higher
- **npm** 10.0.0 or higher
- **Git**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Christian-Gennari/nostos_digital-library
   cd nostos
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file:
   ```env
   # Required
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
   
   # Optional - TTS Service
   KOKORO_TTS_URL=http://localhost:8880
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```
   
   Application runs at `http://localhost:5173`

### Production Build

```bash
# Build application
npm run build

# Preview production build
npm run preview

# Start production server (if backend configured)
npm run start
```

## 📁 Complete Project Structure

```
nostos/
├── src/
│   ├── components/
│   │   ├── readers/
│   │   │   ├── EPUB/
│   │   │   │   ├── EpubReader.tsx         # Main EPUB reader component
│   │   │   │   ├── EpubHighlighting.tsx   # Highlight management
│   │   │   │   └── ToCForEpubReader.tsx   # Table of contents
│   │   │   ├── PDF/
│   │   │   │   └── PdfReader.tsx          # PDF reader with PDF.js
│   │   │   ├── shared/
│   │   │   │   └── ReaderSearchBar.tsx    # Unified search UI
│   │   │   └── AudioPlayer.tsx            # Audio playback with Howler.js
│   │   ├── BookList.tsx                   # Book grid with pagination
│   │   ├── BookCover.tsx                  # Cover image display
│   │   ├── BookDetailsSidebar.tsx         # Book info panel
│   │   ├── BookMetadataEditor.tsx         # Metadata editing modal
│   │   ├── BookMetadataEntry.tsx          # Initial metadata entry
│   │   ├── BookViewer.tsx                 # Reader container
│   │   ├── CollectionsSidebar.tsx         # Collection management
│   │   ├── LibraryLayout.tsx              # Main library interface
│   │   ├── NotesSidebar.tsx               # Notes panel
│   │   ├── SmartNoteTextarea.tsx          # Note input with linking
│   │   ├── LinkedConceptModal.tsx         # Concept network viewer
│   │   ├── TTSPlayer.tsx                  # TTS controls
│   │   ├── FileUpload.tsx                 # Book upload
│   │   ├── SearchBar.tsx                  # Library search
│   │   ├── SettingsMenu.tsx               # App settings
│   │   ├── ThemeSelector.tsx              # Theme customization
│   │   ├── ThemeProvider.tsx              # Theme context
│   │   ├── ReadingContext.tsx             # Reading state provider
│   │   ├── ReferenceGenerator.tsx         # Citation formatter
│   │   ├── ProgressBar.tsx                # Reading progress
│   │   ├── ConfirmationModal.tsx          # Delete confirmation
│   │   ├── CoverPreview.tsx               # Cover upload preview
│   │   └── CategoriesInput.tsx            # Tag input component
│   ├── services/
│   │   ├── TTSController.ts               # TTS orchestration
│   │   ├── KokoroSynthesizer.ts          # Voice synthesis interface
│   │   ├── SentenceIndexer.ts            # Text sentence parsing
│   │   ├── EPUBSearchService.ts          # EPUB search implementation
│   │   └── ttsService.mjs                # Backend TTS service
│   ├── stores/                           # Zustand state management
│   │   ├── store.ts                      # Main app state
│   │   ├── notesStore.ts                 # Notes management
│   │   ├── collectionsStore.ts          # Collections state
│   │   └── themeStore.ts                # Theme preferences
│   ├── adapters/
│   │   ├── EPUBAdapter.ts               # EPUB TTS adapter
│   │   └── PDFAdapter.ts                # PDF TTS adapter
│   ├── utils/
│   │   ├── isbn.ts                      # ISBN validation & lookup
│   │   ├── doi.ts                       # DOI validation & lookup
│   │   ├── noteLinking.ts               # Concept link parsing
│   │   ├── metadataHelpers.ts           # Metadata utilities
│   │   ├── epubToc.ts                   # EPUB navigation helpers
│   │   ├── coverUtils.ts                # Cover image management
│   │   └── ttsUtils.ts                  # TTS helper functions
│   ├── types/
│   │   ├── index.d.ts                   # Main type definitions
│   │   └── theme.ts                     # Theme type definitions
│   ├── hooks/
│   │   ├── useAudioDuration.ts          # Audio duration detection
│   │   └── useTTSPlaybook.ts           # TTS hook interface
│   ├── config/
│   │   └── themes.ts                    # Theme definitions
│   ├── assets/
│   │   └── NostosLogo.tsx              # App logo component
│   ├── workers/                         # Web Workers (if any)
│   ├── App.tsx                         # Root application component
│   ├── main.tsx                        # Application entry point
│   ├── index.css                       # Global styles & theme CSS
│   ├── fsRemote.ts                     # Remote file system API
│   └── vite-env.d.ts                   # Vite type declarations
├── public/                              # Static assets
├── server.mjs                           # Backend server (if configured)
├── package.json                         # Dependencies & scripts
├── package-lock.json                    # Dependency lock file
├── tsconfig.json                        # TypeScript configuration
├── vite.config.ts                       # Vite bundler config
├── tailwind.config.js                   # Tailwind CSS config
├── postcss.config.js                    # PostCSS config
├── .env.example                         # Environment template
├── .gitignore                           # Git ignore rules
└── README.md                            # This file
```

## 🛠️ Technology Stack

### Core Framework
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript 5.6** - Type-safe development with strict mode
- **Vite 6** - Lightning-fast bundling and HMR
- **Tailwind CSS 4** - Utility-first styling framework

### State Management & Data
- **Zustand** - Lightweight state management
- **LocalStorage** - Theme and preference persistence
- **SessionStorage** - Temporary data caching

### Reading & Rendering
- **ePub.js** - EPUB rendering engine
- **PDF.js** - Mozilla's PDF rendering library
- **Howler.js** - Audio playback library
- **Web Audio API** - Low-level audio control for TTS

### Authentication
- **Clerk** - Complete user management solution

### UI Components
- **Heroicons** - Hand-crafted SVG icons
- **React Portals** - Modal and overlay rendering

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **PostCSS** - CSS processing

### External APIs
- **Zotero Translation Server** - ISBN/DOI metadata lookup
- **Open Library API** - Book covers and metadata
- **Google Books API** - Supplementary book information
- **Kokoro TTS** - Neural text-to-speech synthesis


## 📚 API Reference

### Book Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/books` | List all books |
| POST | `/api/books` | Upload new book |
| PUT | `/api/books/:id/metadata` | Update metadata |
| DELETE | `/api/books/:id` | Delete book |
| PUT | `/api/books/:id/file` | Replace book file |
| PUT | `/api/books/:id/cover` | Upload cover image |

### OPDS Catalog
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/opds` | OPDS catalog root |
| GET | `/opds/all` | All books catalog feed |

## 🎯 Advanced Features

### Concept Linking System
Create a network of linked concepts across your library:
```markdown
This relates to [[epistemology]] and [[knowledge management]].
The [[Zettelkasten]] method is particularly effective for [[note-taking]].
```
- Automatic backlink generation
- Cross-book concept search
- Visual concept network (planned)

### Smart Collections
Automatic organization based on:
- **Recently Read**: Books accessed in last 30 days
- **Currently Reading**: Books with 1-99% progress
- **Finished**: Books with 100% progress
- **Favorites**: 5-star rated books

### TTS Voice Options
Extensive selection organized by language:
- **American English**: Heart, Sky, Nicole, Sarah, Adam, Michael, Eric, V0 variants
- **British English**: Emma, Lily, Alice, Daniel, George, Lewis, V0 variants
- **Spanish**: Dora, Alex, Santa
- **French**: Siwis
- **Italian, Japanese, Chinese, Hindi, Portuguese**: Multiple options

## 🔐 Security

- **Input Validation**: All file uploads validated by type and size
- **Content Security**: XSS protection via React's built-in escaping
- **Authentication**: Clerk-managed secure sessions
- **File Security**: Sanitized filenames and paths
- **HTTPS**: Required for production deployment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Standards
- TypeScript strict mode compliance
- ESLint and Prettier formatting
- Meaningful commit messages
- Component documentation
- Test coverage for critical paths

## 📈 Performance

- **Code Splitting**: Route-based lazy loading
- **Virtual Scrolling**: Efficient rendering of large libraries (planned)
- **Image Optimization**: Lazy loading with intersection observer
- **Debounced Operations**: Search and save optimizations
- **Web Workers**: Background sentence indexing for TTS
- **Pagination**: Server-side pagination for large collections

## 🎯 Roadmap

- [ ] Cloud synchronization across devices
- [ ] Collaborative annotations and sharing
- [ ] AI-powered reading recommendations
- [ ] Advanced PDF annotations (drawings, shapes)
- [ ] EPUB3 enhanced features (fixed layout, media overlays)
- [ ] Library service integration (OverDrive, Libby)
- [ ] Export to Obsidian/Notion
- [ ] Reading statistics dashboard
- [ ] Mobile apps (React Native)
- [ ] Browser extension for web article import
- [ ] Virtual scrolling for large libraries
- [ ] Drag-and-drop collection organization

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [ePub.js](https://github.com/futurepress/epub.js) - EPUB rendering
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering
- [Clerk](https://clerk.dev) - Authentication
- [Tailwind CSS](https://tailwindcss.com) - Styling framework
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Heroicons](https://heroicons.com) - Icons
- [Zotero](https://www.zotero.org) - Metadata services
- [Open Library](https://openlibrary.org) - Book metadata
- [Kokoro TTS](https://huggingface.co/hexgrad/Kokoro-82M) - Text-to-speech

## 📞 Support

Open an issue on the Github Repo.

---

**Nostos** - *Your Intellectual Homecoming*

Built with ❤️ for readers, researchers, and lifelong learners.
