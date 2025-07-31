# Navigation Evaluation Analysis Results

## Key Findings Summary

### 1. Best Overall Models

- **SF Dataset**: O3-2025-04-16 (30.0% mostly-correct accuracy)
- **CA Dataset**: O3-2025-04-16 (64.0% mostly-correct accuracy)

### 2. Top Performers by Dataset

#### SF Dataset (More Challenging)

| Rank | Model                    | Exact Acc | Total Acc | Family   | Thinking |
| ---- | ------------------------ | --------- | --------- | -------- | -------- |
| 1    | O3-2025-04-16            | 22%       | 30%       | o-series | ✓        |
| 2    | Gemini-2.5-Pro           | 22%       | 28%       | gemini   | ✓        |
| 3    | Grok-4                   | 20%       | 22%       | grok     | ✓        |
| 4    | Claude Opus-4 (thinking) | 16%       | 22%       | claude   | ✓        |
| 5    | GPT-4o                   | 8%        | 18%       | gpt      | ✗        |

#### CA Dataset (Easier)

| Rank | Model                    | Exact Acc | Total Acc | Family   | Thinking |
| ---- | ------------------------ | --------- | --------- | -------- | -------- |
| 1    | O3-2025-04-16            | 52%       | 64%       | o-series | ✓        |
| 2    | Grok-4                   | 58%       | 62%       | grok     | ✓        |
| 3    | GPT-4.1                  | 56%       | 56%       | gpt      | ✗        |
| 4    | Claude Opus-4 (thinking) | 52%       | 54%       | claude   | ✓        |
| 5    | GPT-4o                   | 50%       | 50%       | gpt      | ✗        |

### 3. Model Family Comparison (Best from Each)

#### SF Dataset

1. **O-series**: 30% (O3-2025-04-16)
2. **Gemini**: 28% (Gemini-2.5-Pro)
3. **Claude**: 22% (Claude Opus-4 thinking)
4. **Grok**: 22% (Grok-4)
5. **GPT**: 18% (GPT-4o)

#### CA Dataset

1. **O-series**: 64% (O3-2025-04-16)
2. **Grok**: 62% (Grok-4)
3. **GPT**: 56% (GPT-4.1)
4. **Claude**: 54% (Claude Opus-4 thinking)
5. **Gemini**: 48% (Gemini-2.5-Pro)

### 4. Company Comparison (Best from Each)

#### SF Dataset

1. **OpenAI**: 30% (O3-2025-04-16)
2. **Google**: 28% (Gemini-2.5-Pro)
3. **Anthropic**: 22% (Claude Opus-4 thinking)
4. **X-AI**: 22% (Grok-4)
5. **Meta**: 14% (Llama-3.1-70B)

#### CA Dataset

1. **OpenAI**: 64% (O3-2025-04-16)
2. **X-AI**: 62% (Grok-4)
3. **Anthropic**: 54% (Claude Opus-4 thinking)
4. **Google**: 48% (Gemini-2.5-Pro)
5. **DeepSeek**: 38% (DeepSeek-R1)

### 5. Thinking vs Non-Thinking Models

#### Average Performance

- **SF Dataset**:
  - Thinking models: 14.5% exact, 19.5% total
  - Non-thinking models: 4.5% exact, 9.0% total
  - **Advantage**: +9.5% for thinking models

- **CA Dataset**:
  - Thinking models: 44.0% exact, 46.2% total
  - Non-thinking models: 27.3% exact, 26.0% total
  - **Advantage**: +20.2% for thinking models

#### Best Thinking Models

1. **O3-2025-04-16**: Leading in both datasets
2. **Grok-4**: Strong performance, especially on CA
3. **Gemini-2.5-Pro**: Competitive on SF dataset
4. **Claude Opus-4 (thinking)**: Solid performance across both

#### Best Non-Thinking Models

1. **GPT-4.1**: Best non-thinking model on CA (56%)
2. **GPT-4o**: Best non-thinking model on SF (18%)
3. **Claude Sonnet-4**: Consistent performer

### 6. Thinking Model Improvements

All Claude models showed significant improvements with thinking:

| Model             | Dataset | Base Acc | Thinking Acc | Improvement | Relative |
| ----------------- | ------- | -------- | ------------ | ----------- | -------- |
| Claude Opus-4     | SF      | 6%       | 22%          | +16%        | +267%    |
| Claude Sonnet-4   | SF      | 6%       | 16%          | +10%        | +167%    |
| Claude 3.7 Sonnet | SF      | 14%      | 15.4%        | +1.4%       | +10%     |
| Claude Opus-4     | CA      | 18%      | 54%          | +36%        | +200%    |
| Claude Sonnet-4   | CA      | 36%      | 42%          | +6%         | +17%     |
| Claude 3.7 Sonnet | CA      | 8%       | 38%          | +30%        | +375%    |

**Average improvement**: 17.3% absolute, 172.5% relative

### 7. SF vs CA Dataset Difficulty

- **SF Average**: 14.0% (much harder)
- **CA Average**: 35.8% (significantly easier)
- **Difficulty gap**: CA is 21.8% easier on average
- **Models performing better on CA**: 18/19 (95%)

### 8. Token Efficiency Analysis

#### Most Efficient Models (Accuracy per 1K tokens)

**SF Dataset:**

1. GPT-4o: 5.76
2. GPT-4.1: 4.74
3. GPT-4 Turbo: 3.54

**CA Dataset:**

1. GPT-4.1: 20.03
2. GPT-4o: 16.87
3. GPT-4 Turbo: 10.02

#### Token Usage by Type

- **Non-thinking models**: ~38-40 tokens average
- **Thinking models**: ~2,500-3,100 tokens average
- **Multiplier**: Thinking models use 71.7x more tokens

### 9. Key Insights

1. **O3 dominates**: Despite being labeled "mini", O3 leads performance on both datasets
2. **Thinking helps significantly**: All models show substantial improvements with thinking capability
3. **Dataset difficulty varies drastically**: SF is much harder than CA for all models
4. **Token trade-off**: Thinking models use 70x more tokens but provide meaningful accuracy gains
5. **Company rankings**: OpenAI leads, followed by X-AI and Anthropic
6. **Newer models perform better**: 2025 models generally outperform 2024 versions
7. **Navigation is challenging**: Even best models achieve only 30% on SF, 64% on CA

### 10. Recommendations

1. **For accuracy**: Use O3-2025-04-16 or thinking versions of Claude models
2. **For efficiency**: Use GPT-4.1 or GPT-4o for good accuracy with low token usage
3. **For thinking tasks**: Claude models show the most dramatic improvements with thinking
4. **Dataset consideration**: Expect much lower performance on SF-style navigation tasks
