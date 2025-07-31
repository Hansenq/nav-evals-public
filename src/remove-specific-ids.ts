import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IDs to remove from JSONL files
const IDS_TO_REMOVE = [
  "sf-washingtonsquarepark-ghiradellisquare",
  "sf-ghiradellisquare-washingtonsquarepark",
];

interface JsonlEntry {
  id: string;
  [key: string]: any;
}

/**
 * Process a single JSONL file and remove lines with specified IDs
 */
function processJsonlFile(filePath: string): void {
  console.log(`Processing: ${path.basename(filePath)}`);

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");

    const filteredLines = lines.filter((line) => {
      if (!line.trim()) return false;

      try {
        const entry: JsonlEntry = JSON.parse(line);
        const shouldRemove = IDS_TO_REMOVE.includes(entry.id);

        if (shouldRemove) {
          console.log(`  Removing line with ID: ${entry.id}`);
        }

        return !shouldRemove;
      } catch (error) {
        console.warn(
          `  Warning: Could not parse line in ${filePath}: ${line.substring(0, 100)}...`,
        );
        return true; // Keep unparseable lines
      }
    });

    const originalCount = lines.length;
    const filteredCount = filteredLines.length;
    const removedCount = originalCount - filteredCount;

    if (removedCount > 0) {
      const newContent = filteredLines.join("\n") + "\n";
      fs.writeFileSync(filePath, newContent, "utf-8");
      console.log(
        `  Removed ${removedCount} lines (${originalCount} → ${filteredCount})`,
      );
    } else {
      console.log(`  No lines removed (${originalCount} lines total)`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

/**
 * Find all JSONL files in the specified directory
 */
function findJsonlFiles(directory: string): string[] {
  const files = fs.readdirSync(directory);
  return files
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => path.join(directory, file));
}

/**
 * Main function to process all JSONL files
 */
function main(): void {
  const llmOutputsDir = path.join(__dirname, "..", "data", "llm-outputs");

  if (!fs.existsSync(llmOutputsDir)) {
    console.error(`Directory not found: ${llmOutputsDir}`);
    process.exit(1);
  }

  console.log(`Scanning for JSONL files in: ${llmOutputsDir}`);
  const jsonlFiles = findJsonlFiles(llmOutputsDir);

  if (jsonlFiles.length === 0) {
    console.log("No JSONL files found.");
    return;
  }

  console.log(`Found ${jsonlFiles.length} JSONL files`);
  console.log(`IDs to remove: ${IDS_TO_REMOVE.join(", ")}`);
  console.log("");

  let totalRemovedLines = 0;

  jsonlFiles.forEach((filePath) => {
    const beforeContent = fs.readFileSync(filePath, "utf-8");
    const beforeLines = beforeContent.trim().split("\n").length;

    processJsonlFile(filePath);

    const afterContent = fs.readFileSync(filePath, "utf-8");
    const afterLines = afterContent.trim().split("\n").length;

    totalRemovedLines += beforeLines - afterLines;
  });

  console.log("");
  console.log(`✅ Processing complete! Total lines removed: ${totalRemovedLines}`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
