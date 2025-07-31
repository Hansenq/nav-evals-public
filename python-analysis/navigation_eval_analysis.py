#!/usr/bin/env python
# coding: utf-8

# # Navigation Evaluation Analysis
# 
# Comprehensive analysis of model performance on SF and CA navigation datasets.

# In[ ]:


import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from collections import defaultdict

# Set style
plt.style.use('seaborn-v0_8')
sns.set_palette("husl")
plt.rcParams['figure.figsize'] = (12, 8)


# In[ ]:


# Load the main evaluation results
with open('/Users/hansenq/Documents/CS/nav-evals/data/eval-outputs/eval-results.json', 'r') as f:
    eval_data = json.load(f)

# Add thinking model results manually (extracted from output files)
thinking_results = {
    'sf': {
        'claude-3-7-sonnet-20250219--thinking': {
            'totalSamples': 26, 'exactlyCorrect': 2, 'mostlyCorrect': 2,
            'exactAccuracy': 0.077, 'mostlyAccuracy': 0.077, 'totalAccuracy': 0.154
        },
        'claude-opus-4-20250514--thinking': {
            'totalSamples': 50, 'exactlyCorrect': 8, 'mostlyCorrect': 3,
            'exactAccuracy': 0.16, 'mostlyAccuracy': 0.06, 'totalAccuracy': 0.22
        },
        'claude-sonnet-4-20250514--thinking': {
            'totalSamples': 50, 'exactlyCorrect': 4, 'mostlyCorrect': 4,
            'exactAccuracy': 0.08, 'mostlyAccuracy': 0.08, 'totalAccuracy': 0.16
        }
    },
    'ca': {
        'claude-3-7-sonnet-20250219--thinking': {
            'totalSamples': 50, 'exactlyCorrect': 19, 'mostlyCorrect': 0,
            'exactAccuracy': 0.38, 'mostlyAccuracy': 0.0, 'totalAccuracy': 0.38
        },
        'claude-opus-4-20250514--thinking': {
            'totalSamples': 50, 'exactlyCorrect': 26, 'mostlyCorrect': 1,
            'exactAccuracy': 0.52, 'mostlyAccuracy': 0.02, 'totalAccuracy': 0.54
        },
        'claude-sonnet-4-20250514--thinking': {
            'totalSamples': 50, 'exactlyCorrect': 21, 'mostlyCorrect': 0,
            'exactAccuracy': 0.42, 'mostlyAccuracy': 0.0, 'totalAccuracy': 0.42
        }
    }
}

# Merge thinking results into main data
for dataset in ['sf', 'ca']:
    eval_data[dataset].update(thinking_results[dataset])

print(f"Loaded data for {len(eval_data['sf'])} SF models and {len(eval_data['ca'])} CA models")


# In[ ]:


# Define model categorization
def categorize_model(model_name):
    """Categorize models by family, company, and thinking capability"""
    model_name = model_name.lower()

    # Determine if thinking model
    is_thinking = any([
        '--thinking' in model_name,
        model_name.startswith('o3') or model_name.startswith('o4'),
        'deepseek-r1' in model_name,
        'grok' in model_name,
        'gemini' in model_name  # Added gemini as thinking model
    ])

    # Determine family
    if 'o3' in model_name or 'o4' in model_name:
        family = 'o-series'
    elif 'gpt' in model_name:
        family = 'gpt'
    elif 'claude' in model_name:
        family = 'claude'
    elif 'grok' in model_name:
        family = 'grok'
    elif 'deepseek' in model_name:
        family = 'deepseek'
    elif 'gemini' in model_name:
        family = 'gemini'
    elif 'llama' in model_name:
        family = 'llama'
    elif 'kimi' in model_name:
        family = 'kimi'
    else:
        family = 'other'

    # Determine company
    if any(x in model_name for x in ['gpt', 'o3', 'o4']):
        company = 'openai'
    elif 'claude' in model_name:
        company = 'anthropic'
    elif 'gemini' in model_name:
        company = 'google'
    elif 'grok' in model_name:
        company = 'x-ai'
    elif 'deepseek' in model_name:
        company = 'deepseek'
    elif 'kimi' in model_name:
        company = 'moonshot'
    elif 'llama' in model_name:
        company = 'meta'
    else:
        company = 'other'

    return family, company, is_thinking

# Test the categorization
test_models = ['o3-2025-04-16', 'claude-opus-4-20250514--thinking', 'grok-4', 'gemini-2_5-pro']
for model in test_models:
    family, company, thinking = categorize_model(model)
    print(f"{model}: {family}, {company}, thinking={thinking}")


# ## 1. Best Model Snapshots Overall

# In[ ]:


# Create comprehensive results dataframe
results = []
for dataset in ['sf', 'ca']:
    for model, data in eval_data[dataset].items():
        family, company, is_thinking = categorize_model(model)
        results.append({
            'model': model,
            'dataset': dataset,
            'family': family,
            'company': company,
            'is_thinking': is_thinking,
            'exact_accuracy': data['exactAccuracy'],
            'mostly_accuracy': data['mostlyAccuracy'],
            'total_accuracy': data.get('totalAccuracy', data['exactAccuracy'] + data['mostlyAccuracy']),
            'total_samples': data['totalSamples']
        })

df = pd.DataFrame(results)

# Top performers for each dataset and metric
print("=== TOP 10 MODELS BY EXACT ACCURACY ===")
print("\nSF Dataset:")
sf_exact = df[df['dataset'] == 'sf'].nlargest(10, 'exact_accuracy')[['model', 'exact_accuracy', 'family', 'is_thinking']]
print(sf_exact.to_string(index=False))

print("\nCA Dataset:")
ca_exact = df[df['dataset'] == 'ca'].nlargest(10, 'exact_accuracy')[['model', 'exact_accuracy', 'family', 'is_thinking']]
print(ca_exact.to_string(index=False))

print("\n=== TOP 10 MODELS BY MOSTLY-CORRECT ACCURACY ===")
print("\nSF Dataset:")
sf_mostly = df[df['dataset'] == 'sf'].nlargest(10, 'total_accuracy')[['model', 'total_accuracy', 'mostly_accuracy', 'family', 'is_thinking']]
print(sf_mostly.to_string(index=False))

print("\nCA Dataset:")
ca_mostly = df[df['dataset'] == 'ca'].nlargest(10, 'total_accuracy')[['model', 'total_accuracy', 'mostly_accuracy', 'family', 'is_thinking']]
print(ca_mostly.to_string(index=False))


# ## 2. Model Family Comparison

# In[ ]:


# Get best result from each family
family_best = df.loc[df.groupby(['dataset', 'family'])['total_accuracy'].idxmax()].reset_index(drop=True)

print("=== BEST RESULT FROM EACH MODEL FAMILY ===")
for dataset in ['sf', 'ca']:
    print(f"\n{dataset.upper()} Dataset:")
    dataset_family = family_best[family_best['dataset'] == dataset].sort_values('total_accuracy', ascending=False)
    print(dataset_family[['family', 'model', 'exact_accuracy', 'total_accuracy']].to_string(index=False))

# Visualize family comparison
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

for i, dataset in enumerate(['sf', 'ca']):
    data = family_best[family_best['dataset'] == dataset].sort_values('total_accuracy', ascending=True)
    axes[i].barh(data['family'], data['total_accuracy'])
    axes[i].set_title(f'{dataset.upper()} Dataset - Best Family Performance')
    axes[i].set_xlabel('Total Accuracy (Mostly-Correct)')
    axes[i].grid(axis='x', alpha=0.3)

    # Add value labels
    for j, v in enumerate(data['total_accuracy']):
        axes[i].text(v + 0.01, j, f'{v:.3f}', va='center')

plt.tight_layout()
plt.show()


# ## 3. Thinking vs Non-Thinking Models

# In[ ]:


# Compare thinking vs non-thinking models
thinking_comparison = df.groupby(['dataset', 'is_thinking']).agg({
    'exact_accuracy': ['mean', 'max', 'std'],
    'total_accuracy': ['mean', 'max', 'std'],
    'model': 'count'
}).round(3)

print("=== THINKING vs NON-THINKING MODEL COMPARISON ===")
print(thinking_comparison)

# Best thinking and non-thinking models
print("\n=== BEST THINKING MODELS ===")
thinking_models = df[df['is_thinking'] == True]
for dataset in ['sf', 'ca']:
    best_thinking = thinking_models[thinking_models['dataset'] == dataset].nlargest(3, 'total_accuracy')
    print(f"\n{dataset.upper()} Dataset:")
    print(best_thinking[['model', 'exact_accuracy', 'total_accuracy', 'family']].to_string(index=False))

print("\n=== BEST NON-THINKING MODELS ===")
non_thinking_models = df[df['is_thinking'] == False]
for dataset in ['sf', 'ca']:
    best_non_thinking = non_thinking_models[non_thinking_models['dataset'] == dataset].nlargest(3, 'total_accuracy')
    print(f"\n{dataset.upper()} Dataset:")
    print(best_non_thinking[['model', 'exact_accuracy', 'total_accuracy', 'family']].to_string(index=False))

# Visualize thinking vs non-thinking
fig, axes = plt.subplots(2, 2, figsize=(16, 12))

metrics = [('exact_accuracy', 'Exact Accuracy'), ('total_accuracy', 'Total Accuracy (Mostly-Correct)')]
datasets = ['sf', 'ca']

for i, (metric, title) in enumerate(metrics):
    for j, dataset in enumerate(datasets):
        data = df[df['dataset'] == dataset]

        thinking_data = data[data['is_thinking'] == True][metric]
        non_thinking_data = data[data['is_thinking'] == False][metric]

        axes[i,j].boxplot([thinking_data, non_thinking_data], 
                         labels=['Thinking', 'Non-Thinking'])
        axes[i,j].set_title(f'{dataset.upper()} Dataset - {title}')
        axes[i,j].set_ylabel('Accuracy')
        axes[i,j].grid(alpha=0.3)

plt.tight_layout()
plt.show()


# ## 4. Thinking Improvement Impact

# In[ ]:


# Calculate thinking improvement for models that have both versions
thinking_improvements = []

# Find models with both thinking and non-thinking versions
for dataset in ['sf', 'ca']:
    models_in_dataset = set(df[df['dataset'] == dataset]['model'].str.replace('--thinking', ''))

    for base_model in models_in_dataset:
        thinking_version = base_model + '--thinking'

        # Check if both versions exist
        base_data = df[(df['dataset'] == dataset) & (df['model'] == base_model)]
        thinking_data = df[(df['dataset'] == dataset) & (df['model'] == thinking_version)]

        if not base_data.empty and not thinking_data.empty:
            base_acc = base_data.iloc[0]['total_accuracy']
            thinking_acc = thinking_data.iloc[0]['total_accuracy']
            improvement = thinking_acc - base_acc

            thinking_improvements.append({
                'dataset': dataset,
                'base_model': base_model,
                'base_accuracy': base_acc,
                'thinking_accuracy': thinking_acc,
                'improvement': improvement,
                'relative_improvement': improvement / base_acc if base_acc > 0 else 0
            })

improvement_df = pd.DataFrame(thinking_improvements)

if not improvement_df.empty:
    print("=== THINKING MODEL IMPROVEMENTS ===")
    print(improvement_df.round(3).to_string(index=False))

    # Summary statistics
    print("\n=== IMPROVEMENT SUMMARY ===")
    print(f"Average absolute improvement: {improvement_df['improvement'].mean():.3f}")
    print(f"Average relative improvement: {improvement_df['relative_improvement'].mean():.1%}")
    print(f"Models improved: {(improvement_df['improvement'] > 0).sum()}/{len(improvement_df)}")

    # Visualize improvements
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))

    for i, dataset in enumerate(['sf', 'ca']):
        data = improvement_df[improvement_df['dataset'] == dataset]
        if not data.empty:
            x_pos = range(len(data))
            axes[i].bar(x_pos, data['improvement'], 
                       color=['green' if x > 0 else 'red' for x in data['improvement']])
            axes[i].set_title(f'{dataset.upper()} Dataset - Thinking Model Improvements')
            axes[i].set_xlabel('Models')
            axes[i].set_ylabel('Accuracy Improvement')
            axes[i].set_xticks(x_pos)
            axes[i].set_xticklabels([m.replace('claude-', '') for m in data['base_model']], rotation=45)
            axes[i].axhline(y=0, color='black', linestyle='-', alpha=0.3)
            axes[i].grid(axis='y', alpha=0.3)

    plt.tight_layout()
    plt.show()
else:
    print("No models found with both thinking and non-thinking versions")


# ## 5. Company Comparison

# In[ ]:


# Best result from each company
company_best = df.loc[df.groupby(['dataset', 'company'])['total_accuracy'].idxmax()].reset_index(drop=True)

print("=== BEST RESULT FROM EACH COMPANY ===")
for dataset in ['sf', 'ca']:
    print(f"\n{dataset.upper()} Dataset:")
    dataset_company = company_best[company_best['dataset'] == dataset].sort_values('total_accuracy', ascending=False)
    print(dataset_company[['company', 'model', 'exact_accuracy', 'total_accuracy']].to_string(index=False))

# Visualize company comparison
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

for i, dataset in enumerate(['sf', 'ca']):
    data = company_best[company_best['dataset'] == dataset].sort_values('total_accuracy', ascending=True)
    bars = axes[i].barh(data['company'], data['total_accuracy'])
    axes[i].set_title(f'{dataset.upper()} Dataset - Best Company Performance')
    axes[i].set_xlabel('Total Accuracy (Mostly-Correct)')
    axes[i].grid(axis='x', alpha=0.3)

    # Add value labels
    for j, v in enumerate(data['total_accuracy']):
        axes[i].text(v + 0.01, j, f'{v:.3f}', va='center')

plt.tight_layout()
plt.show()


# ## 6. SF vs CA Dataset Comparison

# In[ ]:


# Compare overall difficulty between datasets
dataset_stats = df.groupby('dataset').agg({
    'exact_accuracy': ['mean', 'median', 'std', 'max'],
    'total_accuracy': ['mean', 'median', 'std', 'max'],
    'model': 'count'
}).round(3)

print("=== SF vs CA DATASET DIFFICULTY COMPARISON ===")
print(dataset_stats)

# Models that appear in both datasets
sf_models = set(df[df['dataset'] == 'sf']['model'])
ca_models = set(df[df['dataset'] == 'ca']['model'])
common_models = sf_models.intersection(ca_models)

print(f"\nModels evaluated on both datasets: {len(common_models)}")

# Compare performance on common models
if common_models:
    comparison_data = []
    for model in common_models:
        sf_perf = df[(df['dataset'] == 'sf') & (df['model'] == model)].iloc[0]
        ca_perf = df[(df['dataset'] == 'ca') & (df['model'] == model)].iloc[0]

        comparison_data.append({
            'model': model,
            'sf_exact': sf_perf['exact_accuracy'],
            'ca_exact': ca_perf['exact_accuracy'],
            'sf_total': sf_perf['total_accuracy'],
            'ca_total': ca_perf['total_accuracy'],
            'exact_diff': ca_perf['exact_accuracy'] - sf_perf['exact_accuracy'],
            'total_diff': ca_perf['total_accuracy'] - sf_perf['total_accuracy']
        })

    comparison_df = pd.DataFrame(comparison_data)

    print("\n=== PERFORMANCE COMPARISON ON COMMON MODELS ===")
    print(comparison_df[['model', 'sf_total', 'ca_total', 'total_diff']].sort_values('total_diff', ascending=False).round(3).to_string(index=False))

    print(f"\nAverage CA advantage: {comparison_df['total_diff'].mean():.3f}")
    print(f"Models performing better on CA: {(comparison_df['total_diff'] > 0).sum()}/{len(comparison_df)}")

# Visualize dataset comparison
fig, axes = plt.subplots(2, 2, figsize=(16, 12))

# Distribution comparison
sf_data = df[df['dataset'] == 'sf']['total_accuracy']
ca_data = df[df['dataset'] == 'ca']['total_accuracy']

axes[0,0].hist([sf_data, ca_data], bins=15, alpha=0.7, label=['SF', 'CA'])
axes[0,0].set_title('Accuracy Distribution Comparison')
axes[0,0].set_xlabel('Total Accuracy')
axes[0,0].set_ylabel('Count')
axes[0,0].legend()
axes[0,0].grid(alpha=0.3)

# Box plot comparison
axes[0,1].boxplot([sf_data, ca_data], labels=['SF', 'CA'])
axes[0,1].set_title('Accuracy Distribution Box Plot')
axes[0,1].set_ylabel('Total Accuracy')
axes[0,1].grid(alpha=0.3)

# Scatter plot for common models
if not comparison_df.empty:
    axes[1,0].scatter(comparison_df['sf_total'], comparison_df['ca_total'], alpha=0.7)
    axes[1,0].plot([0, 0.7], [0, 0.7], 'r--', alpha=0.5, label='Equal Performance')
    axes[1,0].set_xlabel('SF Accuracy')
    axes[1,0].set_ylabel('CA Accuracy')
    axes[1,0].set_title('SF vs CA Performance (Common Models)')
    axes[1,0].legend()
    axes[1,0].grid(alpha=0.3)

# Improvement/degradation from SF to CA
if not comparison_df.empty:
    axes[1,1].bar(range(len(comparison_df)), comparison_df['total_diff'],
                  color=['green' if x > 0 else 'red' for x in comparison_df['total_diff']])
    axes[1,1].set_title('CA vs SF Performance Difference')
    axes[1,1].set_xlabel('Models')
    axes[1,1].set_ylabel('CA - SF Accuracy')
    axes[1,1].axhline(y=0, color='black', linestyle='-', alpha=0.3)
    axes[1,1].grid(axis='y', alpha=0.3)

plt.tight_layout()
plt.show()


# ## 7. Additional Interesting Analysis

# In[ ]:


# Token usage analysis
print("=== TOKEN USAGE ANALYSIS ===")
token_data = []
for dataset in ['sf', 'ca']:
    for model, data in eval_data[dataset].items():
        if 'avgOutputTokens' in data:
            family, company, is_thinking = categorize_model(model)
            token_data.append({
                'model': model,
                'dataset': dataset,
                'family': family,
                'is_thinking': is_thinking,
                'avg_tokens': data['avgOutputTokens'],
                'total_accuracy': data.get('totalAccuracy', data['exactAccuracy'] + data['mostlyAccuracy'])
            })

token_df = pd.DataFrame(token_data)

if not token_df.empty:
    # Token usage by thinking models
    thinking_tokens = token_df.groupby(['dataset', 'is_thinking'])['avg_tokens'].agg(['mean', 'median', 'std']).round(1)
    print("\nAverage token usage by thinking capability:")
    print(thinking_tokens)

    # Efficiency: accuracy per token
    token_df['efficiency'] = token_df['total_accuracy'] / token_df['avg_tokens'] * 1000  # accuracy per 1k tokens

    print("\n=== MOST EFFICIENT MODELS (Accuracy per 1K tokens) ===")
    for dataset in ['sf', 'ca']:
        print(f"\n{dataset.upper()} Dataset:")
        efficient = token_df[token_df['dataset'] == dataset].nlargest(5, 'efficiency')
        print(efficient[['model', 'total_accuracy', 'avg_tokens', 'efficiency']].round(3).to_string(index=False))

# Model size/complexity analysis
print("\n\n=== MODEL COMPLEXITY ANALYSIS ===")
complexity_order = {
    'haiku': 1, 'mini': 2, 'sonnet': 3, 'gpt-4': 4, 'opus': 5, 
    'turbo': 4, 'o3': 6, 'o4': 7, 'grok': 5, 'gemini': 4
}

def get_complexity(model_name):
    model_lower = model_name.lower()
    for key, value in complexity_order.items():
        if key in model_lower:
            return value
    return 3  # default

df['complexity'] = df['model'].apply(get_complexity)
complexity_perf = df.groupby(['dataset', 'complexity']).agg({
    'total_accuracy': ['mean', 'max'],
    'model': 'count'
}).round(3)

print("Performance by model complexity:")
print(complexity_perf)

# Model release date analysis (approximate)
print("\n\n=== PERFORMANCE BY MODEL GENERATION ===")
def get_generation(model_name):
    if '2025' in model_name or 'o3' in model_name or 'o4' in model_name or 'grok-4' in model_name:
        return '2025'
    elif '2024' in model_name:
        return '2024'
    else:
        return 'older'

df['generation'] = df['model'].apply(get_generation)
generation_perf = df.groupby(['dataset', 'generation']).agg({
    'total_accuracy': ['mean', 'max', 'count'],
    'exact_accuracy': ['mean', 'max']
}).round(3)

print(generation_perf)


# ## Summary Insights

# In[ ]:


print("=== KEY INSIGHTS SUMMARY ===")
print()

# Best overall performers
sf_best = df[df['dataset'] == 'sf'].nlargest(1, 'total_accuracy').iloc[0]
ca_best = df[df['dataset'] == 'ca'].nlargest(1, 'total_accuracy').iloc[0]

print(f"1. BEST OVERALL MODELS:")
print(f"   SF Dataset: {sf_best['model']} ({sf_best['total_accuracy']:.1%})")
print(f"   CA Dataset: {ca_best['model']} ({ca_best['total_accuracy']:.1%})")

# Family winners
print(f"\n2. BEST MODEL FAMILIES:")
for dataset in ['sf', 'ca']:
    best_family = family_best[family_best['dataset'] == dataset].nlargest(1, 'total_accuracy').iloc[0]
    print(f"   {dataset.upper()}: {best_family['family']} ({best_family['total_accuracy']:.1%})")

# Company winners
print(f"\n3. BEST COMPANIES:")
for dataset in ['sf', 'ca']:
    best_company = company_best[company_best['dataset'] == dataset].nlargest(1, 'total_accuracy').iloc[0]
    print(f"   {dataset.upper()}: {best_company['company']} ({best_company['total_accuracy']:.1%})")

# Thinking advantage
print(f"\n4. THINKING MODEL ADVANTAGE:")
for dataset in ['sf', 'ca']:
    thinking_mean = df[(df['dataset'] == dataset) & (df['is_thinking'] == True)]['total_accuracy'].mean()
    non_thinking_mean = df[(df['dataset'] == dataset) & (df['is_thinking'] == False)]['total_accuracy'].mean()
    advantage = thinking_mean - non_thinking_mean
    print(f"   {dataset.upper()}: {advantage:+.1%} advantage for thinking models")

# Dataset difficulty
print(f"\n5. DATASET DIFFICULTY:")
sf_mean = df[df['dataset'] == 'sf']['total_accuracy'].mean()
ca_mean = df[df['dataset'] == 'ca']['total_accuracy'].mean()
print(f"   SF average: {sf_mean:.1%}")
print(f"   CA average: {ca_mean:.1%}")
print(f"   CA is {(ca_mean - sf_mean):.1%} easier on average")

print(f"\n6. INTERESTING FINDINGS:")
print(f"   • {len(df[df['is_thinking'] == True])} thinking models vs {len(df[df['is_thinking'] == False])} non-thinking models")
print(f"   • SF dataset is significantly more challenging than CA")
print(f"   • O-series models show strong performance despite being 'mini' versions")
print(f"   • Thinking capability provides measurable but variable improvements")

if not token_df.empty:
    thinking_avg_tokens = token_df[token_df['is_thinking'] == True]['avg_tokens'].mean()
    non_thinking_avg_tokens = token_df[token_df['is_thinking'] == False]['avg_tokens'].mean()
    print(f"   • Thinking models use {thinking_avg_tokens/non_thinking_avg_tokens:.1f}x more tokens on average")

