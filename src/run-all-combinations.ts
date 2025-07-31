// Script to run all combinations of test sets and LLM models
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test sets and models from README.md
const TEST_SETS = ["sf", "ca"];
const MODELS = [
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "gpt-4-0613",
  "gpt-4-turbo-2024-04-09",
  "gpt-4o-2024-11-20",
  "gpt-4.1-2025-04-14",
  "o3-2025-04-16",
  "o4-mini-2025-04-16",
  "deepseek/deepseek-chat-v3-0324",
  "deepseek/deepseek-r1-0528",
  "google/gemini-2.5-pro",
  "meta-llama/llama-3.1-70b-instruct",
  "moonshotai/kimi-k2",
  "x-ai/grok-4",
  "x-ai/grok-3",
];

// Models that support thinking mode
const THINKING_MODELS = [
  "claude-3-7-sonnet-20250219",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
];

const MAX_CONCURRENT = 4;

type Task = {
  testSet: string;
  model: string;
  useThinking: boolean;
  id: string;
};

type RunningTask = {
  task: Task;
  promise: Promise<void>;
  process: any;
};

class TaskRunner {
  private runningTasks: Set<RunningTask> = new Set();
  private completedTasks: Set<string> = new Set();
  private failedTasks: Set<string> = new Set();
  private cancelled = false;

  async runAllTasks(): Promise<void> {
    // Generate all task combinations
    const allTasks: Task[] = [];

    for (const testSet of TEST_SETS) {
      for (const model of MODELS) {
        // Add regular task
        allTasks.push({
          testSet,
          model,
          useThinking: false,
          id: `${testSet}_${model}`,
        });

        // Add thinking task if model supports it
        if (THINKING_MODELS.includes(model)) {
          allTasks.push({
            testSet,
            model,
            useThinking: true,
            id: `${testSet}_${model}_thinking`,
          });
        }
      }
    }

    console.log(
      `🚀 Starting ${allTasks.length} total tasks (${MAX_CONCURRENT} concurrent)`,
    );
    console.log(`📋 Test sets: ${TEST_SETS.join(", ")}`);
    console.log(
      `🤖 Models: ${MODELS.length} models${THINKING_MODELS.length > 0 ? ` (${THINKING_MODELS.length} with thinking mode)` : ""}`,
    );
    console.log();

    // Verify test set files exist
    for (const testSet of TEST_SETS) {
      const testFile = join(__dirname, "..", "data", "test-sets", `${testSet}.jsonl`);
      if (!existsSync(testFile)) {
        throw new Error(`Test set file not found: ${testFile}`);
      }
    }

    const taskQueue = [...allTasks];

    // Start initial batch of tasks
    while (this.runningTasks.size < MAX_CONCURRENT && taskQueue.length > 0) {
      const task = taskQueue.shift()!;
      await this.startTask(task);
    }

    // Process remaining tasks as others complete
    while (this.runningTasks.size > 0 || taskQueue.length > 0) {
      if (this.cancelled) {
        await this.cancelAllTasks();
        throw new Error("Tasks cancelled due to failure");
      }

      // Wait for at least one task to complete
      await Promise.race(Array.from(this.runningTasks).map((rt) => rt.promise));

      // Start new tasks up to MAX_CONCURRENT
      while (this.runningTasks.size < MAX_CONCURRENT && taskQueue.length > 0) {
        const task = taskQueue.shift()!;
        await this.startTask(task);
      }
    }

    if (this.failedTasks.size > 0) {
      console.error(`\n❌ ${this.failedTasks.size} tasks failed:`);
      for (const taskId of this.failedTasks) {
        console.error(`   - ${taskId}`);
      }
      throw new Error(`${this.failedTasks.size} tasks failed`);
    }

    console.log(`\n✅ All ${this.completedTasks.size} tasks completed successfully!`);

    // Now run the eval script
    console.log(`\n🔍 Running evaluation script...`);
    await this.runEvalScript();
    console.log(`✅ Evaluation completed!`);
  }

  private async startTask(task: Task): Promise<void> {
    const testFile = join(__dirname, "..", "data", "test-sets", `${task.testSet}.jsonl`);

    const args = [join(__dirname, "run-llm-on-test-set.ts"), task.model, testFile];

    if (task.useThinking) {
      args.push("--thinking");
    }

    console.log(`🔄 Starting: ${task.id}`);

    const childProcess = spawn("npx", ["tsx", ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: join(__dirname, ".."),
    });

    let stdout = "";
    let stderr = "";

    childProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const promise = new Promise<void>((resolve, reject) => {
      childProcess.on("close", (code) => {
        const runningTask = Array.from(this.runningTasks).find(
          (rt) => rt.process === childProcess,
        );
        if (runningTask) {
          this.runningTasks.delete(runningTask);
        }

        if (code === 0) {
          this.completedTasks.add(task.id);
          console.log(`✅ Completed: ${task.id}`);

          // Show last few lines of output for confirmation
          const outputLines = stdout.trim().split("\n");
          const lastLine = outputLines[outputLines.length - 1];
          if (
            lastLine &&
            (lastLine.includes("Results saved to") || lastLine.includes("Total cost"))
          ) {
            console.log(`   💾 ${lastLine}`);
          }

          resolve();
        } else {
          this.failedTasks.add(task.id);
          console.error(`❌ Failed: ${task.id} (exit code ${code})`);
          if (stderr) {
            console.error(`   Error: ${stderr.trim()}`);
          }

          // Cancel all other tasks on failure
          this.cancelled = true;
          reject(new Error(`Task ${task.id} failed with exit code ${code}`));
        }
      });

      childProcess.on("error", (error) => {
        const runningTask = Array.from(this.runningTasks).find(
          (rt) => rt.process === childProcess,
        );
        if (runningTask) {
          this.runningTasks.delete(runningTask);
        }

        this.failedTasks.add(task.id);
        console.error(`❌ Failed: ${task.id} (${error.message})`);

        // Cancel all other tasks on failure
        this.cancelled = true;
        reject(error);
      });
    });

    const runningTask: RunningTask = {
      task,
      promise,
      process: childProcess,
    };

    this.runningTasks.add(runningTask);
  }

  private async cancelAllTasks(): Promise<void> {
    console.log(`\n🛑 Cancelling ${this.runningTasks.size} running tasks...`);

    const cancelPromises = Array.from(this.runningTasks).map(async (runningTask) => {
      try {
        runningTask.process.kill("SIGTERM");

        // Give process 5 seconds to gracefully shut down
        const timeout = setTimeout(() => {
          runningTask.process.kill("SIGKILL");
        }, 5000);

        await runningTask.promise.catch(() => {}); // Ignore errors from cancelled tasks
        clearTimeout(timeout);
      } catch (error) {
        // Ignore errors during cancellation
      }
    });

    await Promise.all(cancelPromises);
    this.runningTasks.clear();
  }

  private async runEvalScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const evalProcess = spawn("npm", ["run", "eval-llm-test-set-outputs"], {
        stdio: "inherit",
        cwd: join(__dirname, ".."),
      });

      evalProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Eval script failed with exit code ${code}`));
        }
      });

      evalProcess.on("error", (error) => {
        reject(error);
      });
    });
  }
}

async function main() {
  const runner = new TaskRunner();

  try {
    await runner.runAllTasks();
    console.log(`\n🎉 All tasks completed successfully!`);
  } catch (error) {
    console.error(
      `\n💥 Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}

// Only run main() when this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
