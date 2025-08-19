// fix-all-themes.js
// Save this in your project root directory (next to package.json)
// No dependencies needed - uses only Node.js built-in modules

const fs = require("fs");
const path = require("path");

// Configuration
const COMPONENTS_DIR = path.join(__dirname, "src", "components");
const DRY_RUN = false; // Set to true to see what would change without modifying files

// Define all replacements
const REPLACEMENTS = [
  // Text colors
  { from: /\btext-gray-900\b/g, to: "theme-text-primary" },
  { from: /\btext-gray-800\b/g, to: "theme-text-primary" },
  { from: /\btext-gray-700\b/g, to: "theme-text-secondary" },
  { from: /\btext-gray-600\b/g, to: "theme-text-secondary" },
  { from: /\btext-gray-500\b/g, to: "theme-text-secondary" },
  { from: /\btext-gray-400\b/g, to: "theme-text-muted" },
  { from: /\btext-gray-300\b/g, to: "theme-text-muted" },
  { from: /\btext-slate-900\b/g, to: "theme-text-primary" },
  { from: /\btext-slate-700\b/g, to: "theme-text-secondary" },
  { from: /\btext-slate-500\b/g, to: "theme-text-muted" },
  { from: /\btext-slate-400\b/g, to: "theme-text-muted" },
  { from: /\btext-slate-300\b/g, to: "theme-text-muted" },
  { from: /\btext-slate-200\b/g, to: "theme-text-muted" },

  // Backgrounds
  { from: /\bbg-white\b/g, to: "theme-bg-primary" },
  { from: /\bbg-gray-50\b/g, to: "theme-bg-primary" },
  { from: /\bbg-gray-100\b/g, to: "theme-bg-secondary" },
  { from: /\bbg-gray-200\b/g, to: "theme-bg-tertiary" },
  { from: /\bbg-slate-50\b/g, to: "theme-bg-primary" },
  { from: /\bbg-slate-100\b/g, to: "theme-bg-secondary" },
  { from: /\bbg-slate-200\b/g, to: "theme-bg-tertiary" },

  // Borders
  { from: /\bborder-gray-300\b/g, to: "theme-border" },
  { from: /\bborder-gray-200\b/g, to: "theme-border" },
  { from: /\bborder-gray-100\b/g, to: "theme-border" },
  { from: /\bborder-slate-300\b/g, to: "theme-border" },
  { from: /\bborder-slate-200\b/g, to: "theme-border" },
  { from: /\bborder-slate-100\b/g, to: "theme-border" },
  { from: /\bdivide-gray-200\b/g, to: "theme-border" },
  { from: /\bdivide-slate-200\b/g, to: "theme-border" },

  // Combined patterns (order matters - do these before individual replacements)
  { from: /\bbg-slate-900\s+text-white\b/g, to: "theme-btn-primary" },
  { from: /\bbg-slate-800\s+text-white\b/g, to: "theme-btn-primary" },
  { from: /\bbg-slate-700\s+text-white\b/g, to: "view-toggle-active" },
  {
    from: /\bbg-gray-100\s+text-gray-700\b/g,
    to: "theme-bg-secondary theme-text-secondary",
  },

  // Individual button backgrounds
  { from: /\bbg-slate-900\b/g, to: "theme-btn-primary" },
  { from: /\bbg-slate-800\b/g, to: "theme-btn-primary" },

  // Hover state fixes (add backslash escape)
  { from: /\bhover:theme-bg-primary\b/g, to: "hover\\:theme-bg-primary" },
  { from: /\bhover:theme-bg-secondary\b/g, to: "hover\\:theme-bg-secondary" },
  { from: /\bhover:theme-bg-tertiary\b/g, to: "hover\\:theme-bg-tertiary" },
  { from: /\bhover:theme-text-primary\b/g, to: "hover\\:theme-text-primary" },
  {
    from: /\bhover:theme-text-secondary\b/g,
    to: "hover\\:theme-text-secondary",
  },
  { from: /\bhover:theme-text-muted\b/g, to: "hover\\:theme-text-muted" },
  { from: /\bhover:theme-border-hover\b/g, to: "hover\\:theme-border-hover" },

  // Hardcoded hovers
  { from: /\bhover:bg-gray-200\b/g, to: "hover\\:theme-bg-tertiary" },
  { from: /\bhover:bg-gray-100\b/g, to: "hover\\:theme-bg-secondary" },
  { from: /\bhover:bg-slate-800\b/g, to: "hover\\:theme-bg-tertiary" },
  { from: /\bhover:bg-slate-200\b/g, to: "hover\\:theme-bg-secondary" },
  { from: /\bhover:text-gray-900\b/g, to: "hover\\:theme-text-primary" },
  { from: /\bhover:text-gray-700\b/g, to: "hover\\:theme-text-secondary" },
  { from: /\bhover:border-gray-300\b/g, to: "hover\\:theme-border-hover" },

  // Active states
  { from: /\bactive:theme-bg-tertiary\b/g, to: "active\\:theme-bg-tertiary" },
  { from: /\bactive:bg-slate-200\b/g, to: "active\\:theme-bg-tertiary" },

  // Focus states
  { from: /\bfocus:ring-slate-500\b/g, to: "focus:ring-blue-500" },
  { from: /\bfocus:border-slate-500\b/g, to: "focus:border-blue-500" },

  // Placeholders
  { from: /\bplaceholder-slate-400\b/g, to: "placeholder:theme-text-muted" },
  { from: /\bplaceholder-gray-400\b/g, to: "placeholder:theme-text-muted" },

  // Disabled states
  { from: /\bdisabled:bg-gray-400\b/g, to: "disabled:opacity-50" },
];

// Function to recursively find all TypeScript/JavaScript files
function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recurse into subdirectories, but skip node_modules
      if (file !== "node_modules" && file !== ".git") {
        findFiles(filePath, fileList);
      }
    } else if (file.match(/\.(tsx?|jsx?)$/)) {
      // Add TypeScript and JavaScript files
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Function to fix a single file
function fixFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const originalContent = content;
  const changes = [];

  // Apply replacements
  REPLACEMENTS.forEach(({ from, to }) => {
    const matches = content.match(from);
    if (matches) {
      content = content.replace(from, to);
      changes.push(`  ${matches.length}x: "${from.source || from}" → "${to}"`);
    }
  });

  // Check if file changed
  if (content !== originalContent) {
    if (!DRY_RUN) {
      // Create backup
      fs.writeFileSync(filePath + ".backup", originalContent, "utf8");
      // Write fixed content
      fs.writeFileSync(filePath, content, "utf8");
    }

    const relativePath = path.relative(process.cwd(), filePath);
    console.log(
      `\n✅ ${DRY_RUN ? "[DRY RUN] Would fix" : "Fixed"}: ${relativePath}`
    );
    changes.forEach((change) => console.log(change));
    return true;
  }

  return false;
}

// Main execution
console.log("🎨 Theme Fix Script");
console.log("==================");
console.log(
  `Mode: ${
    DRY_RUN
      ? "DRY RUN (no files will be changed)"
      : "LIVE (files will be modified)"
  }`
);
console.log(`\nSearching for files in: ${COMPONENTS_DIR}\n`);

try {
  // Find all component files
  const files = findFiles(COMPONENTS_DIR);
  console.log(`Found ${files.length} component files\n`);

  let fixedCount = 0;
  let totalChanges = 0;

  // Process each file
  files.forEach((file) => {
    if (fixFile(file)) {
      fixedCount++;
    }
  });

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`\n📊 Summary:`);
  console.log(`   Files checked: ${files.length}`);
  console.log(`   Files ${DRY_RUN ? "to fix" : "fixed"}: ${fixedCount}`);

  if (!DRY_RUN && fixedCount > 0) {
    console.log(`\n💾 Backup files created with .backup extension`);
    console.log(`   To restore: rename .backup files back to original`);
  }

  if (DRY_RUN && fixedCount > 0) {
    console.log(
      `\n💡 To apply these changes, set DRY_RUN = false and run again`
    );
  }

  console.log("\n✨ Theme fix process complete!");

  // Additional reminders
  console.log("\n⚠️  Don't forget to:");
  console.log("1. Update your index.css with the theme utility classes");
  console.log("2. Fix ThemeSelector.tsx manually (CSS variables in className)");
  console.log("3. Test all 4 themes to ensure everything works");
  console.log("4. Delete .backup files once you've verified the changes");
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
