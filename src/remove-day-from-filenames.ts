import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to remove the day component from JSONL filenames in data/
 * Converts: TESTSETNAME_MODELSNAPSHOT_YYYY-MM-DD.jsonl
 * To:       TESTSETNAME_MODELSNAPSHOT_YYYY-MM.jsonl
 */

function isValidDatePattern(filename: string): boolean {
  // Match pattern: *_YYYY-MM-DD.jsonl
  const pattern = /^(.+)_(\d{4}-\d{2}-\d{2})\.jsonl$/;
  return pattern.test(filename);
}

function removeDayFromFilename(filename: string): string {
  // Extract the date part and remove the day component
  const pattern = /^(.+)_(\d{4}-\d{2})-\d{2}\.jsonl$/;
  const match = filename.match(pattern);

  if (match) {
    const [, prefix, yearMonth] = match;
    return `${prefix}_${yearMonth}.jsonl`;
  }

  return filename; // Return original if pattern doesn't match
}

function processDirectory(dirPath: string): void {
  console.log(`Processing directory: ${dirPath}`);

  if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    return;
  }

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  let renamedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    if (item.isDirectory()) {
      // Recursively process subdirectories
      const subDirPath = path.join(dirPath, item.name);
      processDirectory(subDirPath);
    } else if (item.isFile()) {
      const filename = item.name;
      const fullPath = path.join(dirPath, filename);

      // Skip non-JSONL files
      if (!filename.endsWith(".jsonl")) {
        continue;
      }

      // Skip files that don't match the date pattern
      if (!isValidDatePattern(filename)) {
        console.log(`  Skipping (no date pattern): ${filename}`);
        skippedCount++;
        continue;
      }

      const newFilename = removeDayFromFilename(filename);

      // Skip if no change needed
      if (newFilename === filename) {
        console.log(`  Skipping (no change needed): ${filename}`);
        skippedCount++;
        continue;
      }

      const newFullPath = path.join(dirPath, newFilename);

      // Check if target file already exists
      if (fs.existsSync(newFullPath)) {
        console.warn(
          `  Warning: Target file already exists, skipping: ${filename} -> ${newFilename}`,
        );
        skippedCount++;
        continue;
      }

      try {
        fs.renameSync(fullPath, newFullPath);
        console.log(`  Renamed: ${filename} -> ${newFilename}`);
        renamedCount++;
      } catch (error) {
        console.error(`  Error renaming ${filename}:`, error);
        skippedCount++;
      }
    }
  }

  if (renamedCount > 0 || skippedCount > 0) {
    console.log(
      `  Summary for ${path.basename(dirPath)}: ${renamedCount} renamed, ${skippedCount} skipped`,
    );
  }
}

function main(): void {
  const dataDir = path.join(__dirname, "..", "data");

  console.log("🔄 Starting filename cleanup...");
  console.log(`Target directory: ${dataDir}`);
  console.log(
    "Pattern: TESTSETNAME_MODELSNAPSHOT_YYYY-MM-DD.jsonl -> TESTSETNAME_MODELSNAPSHOT_YYYY-MM.jsonl",
  );
  console.log();

  processDirectory(dataDir);

  console.log();
  console.log("✅ Filename cleanup complete!");
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
