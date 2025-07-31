// Evaluates LLM test set outputs for navigation accuracy
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type ParsedCommand,
  calculateMinorMistakeThreshold,
  countMajorNavigationMistakes,
  countMinorNavigationMistakes,
  filterContinueCommands,
  isNavigationExactlyCorrect,
  isNavigationMostlyCorrect,
  parseNavigationCommands,
} from "./helpers/eval.js";
import {
  BASE_MODEL_PRICING,
  SUFFIXED_MODEL_PRICING,
  calculateCost,
} from "./run-llm-on-test-set.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const llmOutputsDir = join(__dirname, "..", "data", "llm-outputs");
if (!existsSync(llmOutputsDir)) {
  console.error(`ERROR: Directory not found: ${llmOutputsDir}`);
  process.exit(1);
}

const jsonlFiles = readdirSync(llmOutputsDir).filter((file) => file.endsWith(".jsonl"));
if (jsonlFiles.length === 0) {
  console.error(`ERROR: No .jsonl files found in ${llmOutputsDir}`);
  process.exit(1);
}

console.log(`Found ${jsonlFiles.length} files to evaluate:`);
jsonlFiles.forEach((file) => console.log(`  - ${file}`));
console.log();

// Helper function to get cost per million output tokens for a model
function getCostPerMillionOutputTokens(model: string): number {
  const cleanedModelName = model.replace(/[^a-zA-Z0-9]/g, "");
  // Check suffixed models first (more specific matches)
  const suffixedMatch = Array.from(SUFFIXED_MODEL_PRICING).find(([prefix]) =>
    cleanedModelName.startsWith(prefix.replace(/[^a-zA-Z0-9]/g, "")),
  );
  if (suffixedMatch) {
    return suffixedMatch[1].output;
  }

  // Check base models (less specific matches)
  const baseMatch = Array.from(BASE_MODEL_PRICING).find(([prefix]) =>
    cleanedModelName.startsWith(prefix.replace(/[^a-zA-Z0-9]/g, "")),
  );
  if (baseMatch) {
    return baseMatch[1].output;
  }

  return -1; // Unknown model
}

// Helper function to determine if a model is a thinking model
function isThinkingModel(model: string): boolean {
  const modelLower = model.toLowerCase();

  // Check for explicit thinking indicators
  if (modelLower.includes("--thinking")) {
    return true;
  }

  // Check for O-series models (o3, o4)
  if (modelLower.includes("o3-") || modelLower.includes("o4-")) {
    return true;
  }

  // Check for DeepSeek R1
  if (modelLower.includes("deepseek-r1")) {
    return true;
  }

  // Check for Grok models
  if (modelLower.includes("grok-4")) {
    return true;
  }

  // Check for Gemini models (all considered thinking)
  if (modelLower.includes("gemini")) {
    return true;
  }

  return false;
}

// Helper function to calculate median
function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function processFile(resultsFile: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Processing: ${basename(resultsFile)}`);
  console.log(`${"=".repeat(80)}`);

  let rows = [];
  try {
    rows = readFileSync(resultsFile, "utf8")
      .trim()
      .split("\n")
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          console.error(
            `ERROR: Invalid JSON on line ${i + 1} in ${basename(resultsFile)}\nEach line must be a JSON object like: {\n  \"id\": string,\n  \"prompt\": string,\n  \"answer\": string,\n  \"modelAnswer\": string\n}`,
          );
          process.exit(1);
        }
      });
  } catch (e) {
    console.error(`ERROR: Failed to read or parse file ${basename(resultsFile)}: ${e}`);
    process.exit(1);
  }

  // Function to write evaluation results to JSON file
  function writeEvalResults(
    testSetName: string,
    modelName: string,
    totalSamples: number,
    exactlyCorrect: number,
    mostlyCorrect: number,
    outputTokenCounts: number[],
    outDir: string,
  ) {
    const evalResultsPath = join(outDir, "eval-results.json");

    let evalData: Record<string, Record<string, Record<string, number | boolean>>> = {};

    // Read existing data if file exists
    if (existsSync(evalResultsPath)) {
      try {
        const existingData = readFileSync(evalResultsPath, "utf8");
        evalData = JSON.parse(existingData);
      } catch (e) {
        console.warn(
          "Warning: Could not read existing eval results file, starting fresh",
        );
      }
    }

    // Initialize test set if it doesn't exist
    if (!evalData[testSetName]) {
      evalData[testSetName] = {};
    }

    // Calculate token statistics
    const avgOutputTokens =
      outputTokenCounts.length > 0
        ? outputTokenCounts.reduce((sum, count) => sum + count, 0) /
          outputTokenCounts.length
        : 0;
    const medianOutputTokens = calculateMedian(outputTokenCounts);
    const costPerMillionOutputTokens = getCostPerMillionOutputTokens(modelName);

    // Update results for this model
    evalData[testSetName][modelName] = {
      totalSamples,
      exactlyCorrect,
      mostlyCorrect,
      exactAccuracy: exactlyCorrect / totalSamples,
      mostlyAccuracy: mostlyCorrect / totalSamples,
      totalAcceptable: exactlyCorrect + mostlyCorrect,
      totalAccuracy: (exactlyCorrect + mostlyCorrect) / totalSamples,
      avgOutputTokens: Math.round(avgOutputTokens * 100) / 100, // Round to 2 decimal places
      medianOutputTokens: Math.round(medianOutputTokens * 100) / 100,
      costPerMillionOutputTokens,
      thinking: isThinkingModel(modelName),
    };

    // Write updated data back to file
    writeFileSync(evalResultsPath, JSON.stringify(evalData, null, 2));
    console.log(`📊 Eval results updated in: ${evalResultsPath}`);
  }

  let exactlyCorrect = 0;
  let mostlyCorrect = 0;
  let outputChunks: string[] = [];
  let modelName = "unknown";
  const outputTokenCounts: number[] = [];

  if (rows.length > 0 && typeof rows[0].model === "string") {
    modelName = rows[0].model.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Check if this is a thinking model based on filename
    const filename = basename(resultsFile);
    if (filename.includes("--thinking")) {
      modelName += "--thinking";
    }
  }

  rows.forEach((row) => {
    const { id, prompt, answer, modelAnswer, tokens } = row;

    // Extract output token count if available
    if (tokens && typeof tokens.output === "number") {
      outputTokenCounts.push(tokens.output);
    }
    const expected = parseNavigationCommands(answer);
    const actual = parseNavigationCommands(modelAnswer);

    const isExactlyCorrect = isNavigationExactlyCorrect(expected, actual);
    const isMostlyCorrect =
      !isExactlyCorrect && isNavigationMostlyCorrect(expected, actual);

    if (isExactlyCorrect) {
      exactlyCorrect++;
    } else if (isMostlyCorrect) {
      mostlyCorrect++;
    }

    // Create detailed output - show original commands for display
    const expFiltered = filterContinueCommands(expected);
    const actFiltered = filterContinueCommands(actual);
    const minorMistakes = countMinorNavigationMistakes(expFiltered, actFiltered);
    const majorMistakes = countMajorNavigationMistakes(expected, actual);
    const allowedMinorMistakes = calculateMinorMistakeThreshold(expected, actual);

    let status = "";
    let details = "";

    if (isExactlyCorrect) {
      status = "✅ Exactly Correct";
      details = "Perfect match";
    } else if (isMostlyCorrect) {
      status = "🟡 Mostly Correct";
      details = `${minorMistakes}/${allowedMinorMistakes} minor mistakes (within threshold)`;
    } else {
      status = "❌ Incorrect";
      if (majorMistakes > 0) {
        details = `${majorMistakes} major mistake(s), ${minorMistakes} minor mistake(s) (${allowedMinorMistakes} allowed)`;
      } else {
        details = `${minorMistakes}/${allowedMinorMistakes} minor mistakes (exceeds threshold)`;
      }
    }

    // Display original commands (including continue commands) for user visibility
    let chunk = `ID: ${id} - ${status} (${details})\n  expected: ${expected.map((c) => c.original).join(" | ")}\n  got     : ${actual.map((c) => c.original).join(" | ")}`;

    outputChunks.push(chunk);
  });

  const totalAcceptable = exactlyCorrect + mostlyCorrect;
  const summary = `\nExactly Correct: ${((exactlyCorrect / rows.length) * 100).toFixed(1)}% (${exactlyCorrect}/${rows.length})\nMostly Correct: ${((mostlyCorrect / rows.length) * 100).toFixed(1)}% (${mostlyCorrect}/${rows.length})\nTotal Acceptable: ${((totalAcceptable / rows.length) * 100).toFixed(1)}% (${totalAcceptable}/${rows.length})`;
  outputChunks.push(summary);
  const prettyOutput = outputChunks.join("\n\n");
  console.log(prettyOutput);

  const outDir = join(__dirname, "..", "data", "eval-outputs");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const inputBase = basename(resultsFile);
  const outPath = join(outDir, inputBase.replace(/\.jsonl$/, ".txt"));
  writeFileSync(outPath, prettyOutput);
  console.log(`\nEval results saved ➜ ${outPath}`);

  // Extract test set name from the input file name (e.g., "sf_gpt-4o_2025-01-01-12.jsonl" -> "sf")
  const testSetName = inputBase.split("_")[0] || "unknown";

  // Write evaluation results to JSON file for analysis
  writeEvalResults(
    testSetName,
    modelName,
    rows.length,
    exactlyCorrect,
    mostlyCorrect,
    outputTokenCounts,
    outDir,
  );
}

// Process all files
for (const filename of jsonlFiles) {
  const filepath = join(llmOutputsDir, filename);
  processFile(filepath);
}
