## Load Dataset: load_dataset.py
```cd Backend/ai-ask```
- First time: register a test user + load all blogs \
```python -m benchmarks.load_dataset --register```

- If user already exists: just log in \
```python -m benchmarks.load_dataset --email benchmarker@insighthub.test --password Bench@1234```

- If blogs already exist, skip creation and just resolve embed IDs \
```python -m benchmarks.load_dataset --skip-create --email benchmarker@insighthub.test --password Bench@1234```

- Against a deployed instance \
```python -m benchmarks.load_dataset --backend-url https://your-app.com --register```


The default credentials are: benchmarker@insighthub.test / Bench@1234 (meets the password requirements: 8+ chars, 1 uppercase, 1 special char).

## Benchmark
### How to Run

```cd Backend/ai-ask```

Install benchmark deps: ```uv pip install -e ".[benchmark]"```

1. Generate eval dataset from your Qdrant data
```python -m benchmarks.generate_eval_dataset```

2. Or manually edit eval_dataset.json with your ground-truth Q&A pairs

3. Run all benchmarks
```python -m benchmarks.run_benchmarks```

### Run specific benchmarks

- retrieval + latency only: ```python -m benchmarks.run_benchmarks --skip-load --skip-generation  ```
-  quick test with LLM: ```python -m benchmarks.run_benchmarks --max-questions 5 --include-llm ```
- heavy load test: ```python -m benchmarks.run_benchmarks --concurrent 10 --requests 100 ```

### Each individual benchmark can also be run standalone:
- ```python -m benchmarks.benchmark_retrieval --k-values 1 3 5 10```
- ```python -m benchmarks.benchmark_latency --iterations 10 --include-llm```
- ```python -m benchmarks.benchmark_generation --max-questions 5```
- ```python -m benchmarks.benchmark_load --concurrent 5 --requests 20```


Results are saved to benchmarks/results/ as JSON files.