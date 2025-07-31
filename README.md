# Nav Evals

Evals for LLMs focused on turn-by-turn navigation. This is a private Github repo with the test sets; a public repo is available at https://github.com/hansenq/nav-evals-public.

## Running

Running these evals requires a three-step process:

1. Generate the test set
1. Run the test set on a specific LLM
1. Evaluate the results

### Generating the test set

Each test set is generated from a script:

1. `src/generate-sf-test-set.ts`
2. `src/generate-ca-test-set.ts`

Run it:

```bash
npm run generate-sf-test-set
npm run generate-ca-test-set
```

### Running the test set

Run the test set on a specific LLM. LLM model snapshots we have tested with are in `src/run-all-combinations.ts`, but we theoretically can run it with any OpenAI, Anthropic, or OpenRouter model.

```bash
npm run run-llm-on-test-set -- <model> <test-file> [--thinking]

# For example
npm run run-llm-on-test-set -- gpt-4.1-2025-04-14 data/test-sets/sf.jsonl
```

### Evaling the results

This command evaluates all files in `data/llm-outputs` and outputs the results to `data/eval-outputs/eval-results.json`.

```bash
npm run eval-llm-test-set-outputs
```
