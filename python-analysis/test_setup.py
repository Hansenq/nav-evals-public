#!/usr/bin/env python3
"""
Quick test to verify the Python environment is working correctly.
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px

print("✅ All imports successful!")
print(f"📊 Pandas version: {pd.__version__}")
print(f"📈 Matplotlib version: {plt.matplotlib.__version__}")
print(f"🎨 Seaborn version: {sns.__version__}")

# Test loading the data
try:
    with open('../data/eval-outputs/eval-results.json', 'r') as f:
        data = json.load(f)
    print(f"✅ Successfully loaded eval-results.json")
    print(f"📁 Found {len(data)} categories: {list(data.keys())}")
except Exception as e:
    print(f"❌ Error loading data: {e}")

print("\n🎉 Environment setup is working correctly!")
print("You can now run your Jupyter notebook in VS Code/Windsurf!")
