// src/run-llm-on-test-set.ts
import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenAI } from "openai";

dotenv.config();

// OpenAI pricing (as of July 2024) - prices per 1M tokens
// Models with suffixes (mini, nano, turbo variants)
export const SUFFIXED_MODEL_PRICING = new Map([
  ["gpt-4.1-mini", { input: 0.4, output: 1.6 }],
  ["gpt-4.1-nano", { input: 0.1, output: 0.4 }],
  ["gpt-4o-mini", { input: 0.15, output: 0.6 }],
  ["o4-mini", { input: 1.1, output: 4.4 }],
  ["gpt-4-turbo", { input: 10.0, output: 30.0 }],
]);

// Base models (without suffixes)
export const BASE_MODEL_PRICING = new Map([
  ["gpt-4.1", { input: 2.0, output: 8.0 }],
  ["gpt-4o", { input: 2.5, output: 10.0 }],
  ["o3", { input: 2.0, output: 8.0 }],
  ["gpt-4", { input: 30.0, output: 60.0 }],
  ["claude-3-5-haiku", { input: 0.8, output: 4.0 }],
  ["claude-3-5-sonnet", { input: 3.0, output: 15.0 }],
  ["claude-3-7-sonnet", { input: 3.0, output: 15.0 }],
  ["claude-sonnet-4", { input: 3.0, output: 15.0 }],
  ["claude-opus-4", { input: 15.0, output: 75.0 }],
  ["deepseek/deepseek-r1-0528", { input: 0.272, output: 0.272 }],
  ["deepseek/deepseek-chat-v3-0324", { input: 0.25, output: 0.85 }],
  ["moonshotai/kimi-k2", { input: 0.13, output: 0.13 }],
  ["meta-llama/llama-3.1-70b-instruct", { input: 0.1, output: 0.28 }],
  ["x-ai/grok-4", { input: 3, output: 15 }],
  ["x-ai/grok-3", { input: 3, output: 15 }],
  ["google/gemini-2.5-pro", { input: 1.25, output: 10 }],
]);

// Function to calculate cost using startsWith matching
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number = 0,
): number {
  // Helper function to calculate cost from pricing
  const computeCost = (pricing: { input: number; output: number }) => {
    const cost =
      (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    return cost;
  };

  // Check suffixed models first (more specific matches)
  const suffixedMatch = Array.from(SUFFIXED_MODEL_PRICING).find(([prefix]) =>
    model.startsWith(prefix),
  );
  if (suffixedMatch) {
    return computeCost(suffixedMatch[1]);
  }

  // Check base models (less specific matches)
  const baseMatch = Array.from(BASE_MODEL_PRICING).find(([prefix]) =>
    model.startsWith(prefix),
  );
  if (baseMatch) {
    return computeCost(baseMatch[1]);
  }

  return -1; // Unknown model
}

const SYSTEM_PROMPT = `You are an expert navigator that provides the user with turn-by-turn directions between two locations. Provide the "main" path between two locations (generally the one with fewest turns and uses major roads).
You will be provided with a starting point, an ending point, the beginning street name and cardinal direction you should start on, and the ending street name.

Only provide the turn-by-turn directions in your response. These directions should be in the following format:
* each command is on a separate line
* the first command should be the starting street and direction you are provided
* each command has the word "right", "left", "continue", or "u-turn", followed by a comma
* if exiting a highway, include the exit name and right/left/continue needed to exit onto the ramp. Do not include exit numbers. If an exit name has multiple lines, include only the first line. If the next exit is another named highway, specify only the highway name with cardinal direction
* do not use "continue" if the previous street and the new street are the same
* each command then has the name of the street/road/highway the car should turn onto or continue onto
* for street names, use abbreviations for common street types (e.g. "St" for "Street", "Ave" for "Avenue", "Blvd" for "Boulevard", etc)
* for streets signed with multiple names (e.g. 19th Ave and CA-1), use the more "important" name (CA-1)
* for named highways, use the abbreviated name of the highway and the correct cardinal direction (e.g. "I-280 N", "CA-85 S")
* the last command should say "Destination", followed by a comma, followed by "straight", "right", or "left". When the ending street is a highway, specify right/left based on whether the destination is physically on the right or left of the highway (not if the exit ramp is on the right or left).

Example 1:
<user>
From Coit Tower, San Francisco, CA to Aquatic Park, San Francisco, CA
Begin: South, Telegraph Hill Blvd
End: Beach St
</user>
<assistant>
Begin: South, Telegraph Hill Blvd
Continue, Lombard St
Right, Columbus St
Left, Beach St
Destination, right
</assistant>

Example 2:
<user>
From San Francisco, CA to Cupertino, CA
Begin: South, US-101 S
End: I-280 S
</user>
<assistant>
Begin: South, US-101 S
Right, CA-85 S
Right, I-280 S
Destination, straight
</assistant>`;

async function main() {
  // __dirname is not available in ES module scope; recreate it from import.meta.url
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const openai = new OpenAI();
  const anthropic = new Anthropic({
    // Need to set a timeout greater than what Anthropic estimates a request to take,
    // otherwise it won't let us even try the request (even if the request takes
    // less time).
    timeout: 60 * 60 * 1_000, // 1 hour
  });

  // OpenRouter client for models not supported by OpenAI or Anthropic
  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_RETRIES = 3;

  type Sample = { id: string; prompt: string; answer: string };

  // Parse command line arguments
  const args = process.argv.slice(2);
  const thinkingIndex = args.indexOf("--thinking");
  const useThinking = thinkingIndex !== -1;

  // Remove --thinking from args to get model and test file
  const filteredArgs = args.filter((arg) => arg !== "--thinking");
  const modelName = filteredArgs[0];
  const testFile = filteredArgs[1];

  if (!modelName || !testFile) {
    console.error(
      "ERROR: Usage: npm run run-llm-on-test-set <model> <test-set-jsonl> [--thinking]",
    );
    console.error("Supported models:");
    console.error(
      "  - OpenAI models: gpt-4o, gpt-4-turbo, gpt-3.5-turbo, o1-preview, etc.",
    );
    console.error(
      "  - Anthropic models: claude-3-5-sonnet, claude-3-opus, claude-4-sonnet, etc.",
    );
    console.error(
      "  - OpenRouter models: Any model available on OpenRouter (e.g., meta-llama/llama-3.1-70b-instruct)",
    );
    process.exit(1);
  }

  // Helper function to determine if model is Claude
  function isClaudeModel(model: string): boolean {
    return model.startsWith("claude-");
  }

  // Helper function to determine if model is OpenAI
  function isOpenAIModel(model: string): boolean {
    return (
      model.startsWith("gpt-") ||
      model.startsWith("o1-") ||
      model.startsWith("o3-") ||
      model.startsWith("o4-")
    );
  }

  // Helper function to determine if model should use OpenRouter
  function isOpenRouterModel(model: string): boolean {
    return !isClaudeModel(model) && !isOpenAIModel(model);
  }

  // Validate API keys based on model type
  if (isClaudeModel(modelName) && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ERROR: ANTHROPIC_API_KEY environment variable is required for Claude models",
    );
    process.exit(1);
  }
  if (isOpenAIModel(modelName) && !process.env.OPENAI_API_KEY) {
    console.error(
      "ERROR: OPENAI_API_KEY environment variable is required for OpenAI models",
    );
    process.exit(1);
  }
  if (isOpenRouterModel(modelName) && !process.env.OPENROUTER_API_KEY) {
    console.error(
      "ERROR: OPENROUTER_API_KEY environment variable is required for OpenRouter models",
    );
    process.exit(1);
  }

  // Helper function to check if model supports thinking
  function supportsThinking(model: string): boolean {
    return (
      model.startsWith("claude-3-7-") ||
      model.startsWith("claude-sonnet-4-") ||
      model.startsWith("claude-opus-4-")
    );
  }

  // Validate thinking parameter usage
  if (useThinking && !supportsThinking(modelName)) {
    console.error(
      `ERROR: --thinking parameter is only supported for Claude 3.7 and Claude 4 models. Current model: ${modelName}`,
    );
    process.exit(1);
  }
  if (!fs.existsSync(testFile)) {
    console.error(`ERROR: File not found: ${testFile}`);
    process.exit(1);
  }
  let samples: Sample[] = [];
  try {
    samples = fs
      .readFileSync(testFile, "utf8")
      .trim()
      .split("\n")
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          console.error(
            `ERROR: Invalid JSON on line ${i + 1}\nEach line must be a JSON object like: {\n  \"id\": string,\n  \"prompt\": string,\n  \"answer\": string\n}`,
          );
          process.exit(1);
        }
      });
  } catch (e) {
    console.error(`ERROR: Failed to read or parse file: ${e}`);
    process.exit(1);
  }

  // Set up output file and resume logic
  const testSetName =
    testFile
      .split(/[\/\\]/)
      .pop()
      ?.replace(/\.jsonl$/, "") || "unknown";
  const safeModel = modelName.replace(/[^a-zA-Z0-9_-]/g, "");
  const modelWithThinking = useThinking ? `${safeModel}--thinking` : safeModel;
  const outDir = join(__dirname, "..", "data", "llm-outputs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Find existing output file or create new one with hour-precision timestamp
  function getFileTimestamp() {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  }

  const outputFileName = `${testSetName}_${modelWithThinking}_${getFileTimestamp()}.jsonl`;
  const outputPath = join(outDir, outputFileName);

  // Check for existing results to resume from
  const existingResults = new Set<string>();
  if (fs.existsSync(outputPath)) {
    try {
      const existingContent = fs.readFileSync(outputPath, "utf8").trim();
      if (existingContent) {
        existingContent.split("\n").forEach((line) => {
          try {
            const result = JSON.parse(line);
            existingResults.add(result.id);
          } catch (e) {
            // Skip malformed lines
          }
        });
      }
    } catch (e) {
      console.warn(`Warning: Could not read existing output file: ${e}`);
    }
  }
  console.log(`Running ${testSetName} on ${modelName}`);

  const samplesToProcess = samples.filter((s) => !existingResults.has(s.id));
  if (existingResults.size > 0) {
    console.log(
      `📁 Resuming from existing output file with ${existingResults.size} completed samples`,
    );
    console.log(`🔄 Processing ${samplesToProcess.length} remaining samples`);
  } else {
    console.log(`🚀 Starting fresh with ${samplesToProcess.length} samples`);
  }

  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalReasoningTokens = 0;
  let totalCost = 0;

  // Function to make LLM call with timeout and retries
  async function callLLMWithRetry(sample: Sample, retryCount = 0) {
    try {
      let timeoutId: NodeJS.Timeout;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS);
      });

      let completionPromise:
        | Promise<Anthropic.Messages.Message>
        | Promise<OpenAI.Chat.Completions.ChatCompletion>;

      if (isClaudeModel(modelName)) {
        // Use Anthropic API for Claude models
        const anthropicParams: Anthropic.Messages.MessageCreateParams = {
          model: modelName,
          // All 3.5 models don't support max_tokens more than 8192
          max_tokens: modelName.includes("3-5") ? 8192 : 12000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: sample.prompt }],
        };

        // Add thinking parameters if enabled
        if (useThinking && supportsThinking(modelName)) {
          (
            anthropicParams as Anthropic.Messages.MessageCreateParams & {
              thinking?: {
                type: "enabled";
                budget_tokens: number;
              };
            }
          ).thinking = {
            type: "enabled",
            budget_tokens: 11000,
          };
        }

        completionPromise = anthropic.messages.create(anthropicParams);
      } else if (isOpenAIModel(modelName)) {
        // Use OpenAI API for OpenAI models
        completionPromise = openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: sample.prompt },
          ],
          tools: [],
          tool_choice: "none",
          // gpt-4-0613 fails with a runtime error if reasoning_effort is even present
          ...(modelName.startsWith("o") ? { reasoning_effort: "high" } : {}),
        });
      } else {
        // Use OpenRouter API for other models
        completionPromise = openrouter.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: sample.prompt },
          ],
          tools: [],
          tool_choice: "none",
          // @ts-expect-error
          include_reasoning: true,
        });
      }

      const result = (await Promise.race([completionPromise, timeoutPromise])) as Awaited<
        typeof completionPromise
      >;

      // Clear the timeout since the completion finished first
      clearTimeout(timeoutId!);

      return result;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.log(
          `⚠️  Retry ${retryCount + 1}/${MAX_RETRIES} for ${sample.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return callLLMWithRetry(sample, retryCount + 1);
      } else {
        throw new Error(
          `Failed after ${MAX_RETRIES} retries: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  for (const s of samplesToProcess) {
    try {
      const completion = await callLLMWithRetry(s);

      let modelAnswer: string;
      let inputTokens: number;
      let outputTokens: number;
      let reasoningTokens: number;
      let sampleTotalTokens: number;
      let thinkingContent: string | undefined;

      if (isClaudeModel(modelName)) {
        // Handle Anthropic response format
        const anthropicCompletion = completion as Anthropic.Messages.Message;

        // Extract text content from content blocks
        const textContent = anthropicCompletion.content.find(
          (block) => block.type === "text",
        );
        if (textContent && textContent.type === "text") {
          modelAnswer = textContent.text?.trim() ?? "";
        } else {
          modelAnswer = "";
        }

        // Extract thinking content from thinking blocks
        const thinkingBlock = anthropicCompletion.content.find(
          (block) => block.type === "thinking",
        ) as Anthropic.Messages.ThinkingBlock | undefined;
        if (useThinking && thinkingBlock) {
          const thinking = thinkingBlock.thinking;
          thinkingContent = thinking?.trim();
        }

        inputTokens = anthropicCompletion.usage?.input_tokens || 0;
        outputTokens = anthropicCompletion.usage?.output_tokens || 0;
        // Claude doesn't provide separate reasoning token counts - thinking tokens are included in output_tokens
        reasoningTokens = -1;
        sampleTotalTokens = inputTokens + outputTokens;
      } else {
        // Handle OpenAI and OpenRouter response format (both use the same format)
        const openaiCompletion = completion as OpenAI.Chat.Completions.ChatCompletion;
        modelAnswer = openaiCompletion.choices[0].message.content?.trim() ?? "";
        const usage = openaiCompletion.usage;
        inputTokens = usage?.prompt_tokens || 0;
        outputTokens = usage?.completion_tokens || 0;
        reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;
        sampleTotalTokens = usage?.total_tokens || 0;

        if ("reasoning_content" in openaiCompletion.choices[0].message) {
          console.log(
            "reasoning_content",
            openaiCompletion.choices[0].message.reasoning_content,
          );
          // thinkingContent = openaiCompletion.choices[0].message
          //   .reasoning_content as string;
        }
      }

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalReasoningTokens += reasoningTokens;
      totalTokens += sampleTotalTokens;

      // Calculate cost for this sample
      const sampleCost = calculateCost(
        modelName,
        inputTokens,
        outputTokens,
        reasoningTokens,
      );
      totalCost += sampleCost;

      const result: any = {
        ...s,
        modelAnswer,
        model: modelName,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          reasoning: reasoningTokens,
          total: sampleTotalTokens,
        },
      };

      // Add thinking content to result if available
      if (thinkingContent) {
        result.reasoning = thinkingContent;
      }

      // Write result immediately to file
      fs.appendFileSync(outputPath, JSON.stringify(result) + "\n");

      // Display token breakdown for reasoning models
      const tokenDisplay =
        reasoningTokens > 0
          ? `${sampleTotalTokens} tokens (${inputTokens}i + ${reasoningTokens}r + ${outputTokens}o)`
          : `${sampleTotalTokens} tokens`;
      console.log(`✔ ${s.id} (${tokenDisplay}, $${sampleCost.toFixed(4)})`);

      // Display thinking content if available
      if (thinkingContent) {
        console.log(`💭 Thinking for ${s.id}:`);
        console.log(thinkingContent);
        console.log("---");
      }
    } catch (error) {
      console.error(
        `❌ Failed to process ${s.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      process.exit(1);
    }
  }

  console.log(`\n🎉 Completed processing all samples!`);
  console.log(`📁 Results saved to: ${outputPath}`);
  if (totalReasoningTokens > 0) {
    console.log(
      `📊 Total tokens used: ${totalTokens} (input: ${totalInputTokens}, reasoning: ${totalReasoningTokens}, output: ${totalOutputTokens})`,
    );
  } else {
    console.log(
      `📊 Total tokens used: ${totalTokens} (input: ${totalInputTokens}, output: ${totalOutputTokens})`,
    );
  }
  console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);

  if (samplesToProcess.length < samples.length) {
    console.log(
      `📈 This session processed ${samplesToProcess.length} samples (${existingResults.size} were already completed)`,
    );
  }
}

// Only run main() when this script is executed directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
