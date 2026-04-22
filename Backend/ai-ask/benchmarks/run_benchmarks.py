import argparse
import json
import sys
from datetime import datetime

from config import BenchmarkConfig, ensure_results_dir


def run_all(config: BenchmarkConfig, args: argparse.Namespace):
    from benchmark_retrieval import run_retrieval_benchmark
    from benchmark_latency import run_latency_benchmark
    from benchmark_generation import run_generation_benchmark
    from benchmark_load import run_load_benchmark

    results_dir = ensure_results_dir(config)
    print(f"Results will be saved to: {results_dir}")
    print(f"Eval dataset: {config.eval_dataset_path}")
    print()

    print(config)
    print()


    all_results = {}

    if args.skip_retrieval:
        print("Skipping retrieval benchmark (--skip-retrieval)")
    else:
        print("=" * 60)
        print("RUNNING: RETRIEVAL BENCHMARK")
        print("=" * 60)
        all_results["retrieval"] = run_retrieval_benchmark(
            config,
            k_values=args.k_values,
            max_questions=args.max_questions,
        )
        print()

    if args.skip_latency:
        print("Skipping latency benchmark (--skip-latency)")
    else:
        print("=" * 60)
        print("RUNNING: LATENCY BENCHMARK")
        print("=" * 60)
        all_results["latency"] = run_latency_benchmark(
            config,
            num_iterations=args.iterations,
            include_llm=args.include_llm,
            max_questions=args.max_questions,
        )
        print()

    if args.skip_generation:
        print("Skipping generation benchmark (--skip-generation)")
    else:
        print("=" * 60)
        print("RUNNING: GENERATION BENCHMARK")
        print("=" * 60)
        all_results["generation"] = run_generation_benchmark(
            config,
            max_questions=args.max_questions,
        )
        print()

    if args.skip_load:
        print("Skipping load benchmark (--skip-load)")
    else:
        print("=" * 60)
        print("RUNNING: LOAD BENCHMARK")
        print("=" * 60)
        all_results["load"] = run_load_benchmark(
            config,
            num_concurrent=args.concurrent,
            num_requests=args.requests,
            timeout=args.timeout,
            ramp_up=args.ramp_up,
        )
        print()

    combined = {
        "benchmark_run": {
            "timestamp": datetime.now().isoformat(),
            "config": {
                "embedding_model": config.embedding_model_name,
                "collection": config.qdrant_collection,
                "backend_url": config.backend_url,
                "llm_mode": config.llm_mode,
            },
        },
        "results": all_results,
    }

    combined_path = results_dir / "full_benchmark.json"
    with open(combined_path, "w") as f:
        json.dump(combined, f, indent=2, default=str)

    print("\n" + "=" * 60)
    print("BENCHMARK SUMMARY")
    print("=" * 60)

    if "retrieval" in all_results and all_results["retrieval"]:
        r = all_results["retrieval"]
        k_metrics = r.get("metrics_by_k", {})
        if k_metrics:
            last_k = max(k_metrics.keys())
            m = k_metrics[last_k]
            print(f"  Retrieval@{last_k}: Recall={m['recall']}, Precision={m['precision']}, MRR={m['mrr']}, NDCG={m['ndcg']}")

    if "latency" in all_results and all_results["latency"]:
        l = all_results["latency"]
        s = l.get("summary", {})
        if s:
            print(f"  Latency: Embed={s.get('embed_ms', {}).get('mean', 'N/A')}ms, Search={s.get('search_ms', {}).get('mean', 'N/A')}ms, Total={s.get('total_ms', {}).get('mean', 'N/A')}ms")

    if "generation" in all_results and all_results["generation"]:
        g = all_results["generation"]
        print(f"  Generation: Hit rate={g.get('retrieval_hit_rate', 'N/A')}")
        ragas = g.get("ragas_scores")
        if ragas:
            for metric, score in ragas.items():
                print(f"    {metric}: {score}")

    if "load" in all_results and all_results["load"]:
        ld = all_results["load"]
        summary = ld.get("summary", {})
        print(f"  Load: {summary.get('successful', 'N/A')}/{summary.get('total_requests', 'N/A')} success, {summary.get('requests_per_second', 'N/A')} req/s")

    print(f"\n  Full results saved to: {combined_path}")


def main():
    parser = argparse.ArgumentParser(
        description="RAG Pipeline Benchmark Suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run all benchmarks
  python -m benchmarks.run_benchmarks

  # Run only retrieval and latency
  python -m benchmarks.run_benchmarks --skip-generation --skip-load

  # Quick test with 5 questions
  python -m benchmarks.run_benchmarks --max-questions 5 --requests 10 --concurrent 3

  # Run with LLM latency
  python -m benchmarks.run_benchmarks --include-llm --max-questions 5
        """,
    )

    parser.add_argument("--max-questions", type=int, default=None,
                        help="Max questions from eval dataset (default: all)")
    parser.add_argument("--k-values", type=int, nargs="+", default=[1, 3, 5, 10],
                        help="K values for retrieval metrics")
    parser.add_argument("--iterations", type=int, default=5,
                        help="Iterations per question for latency benchmark")
    parser.add_argument("--include-llm", action="store_true",
                        help="Include LLM call in latency benchmark")
    parser.add_argument("--concurrent", type=int, default=5,
                        help="Concurrent users for load benchmark")
    parser.add_argument("--requests", type=int, default=20,
                        help="Total requests for load benchmark")
    parser.add_argument("--timeout", type=int, default=60,
                        help="Request timeout in seconds for load benchmark")
    parser.add_argument("--ramp-up", action="store_true",
                        help="Ramp up load gradually")

    parser.add_argument("--skip-retrieval", action="store_true", help="Skip retrieval benchmark")
    parser.add_argument("--skip-latency", action="store_true", help="Skip latency benchmark")
    parser.add_argument("--skip-generation", action="store_true", help="Skip generation benchmark")
    parser.add_argument("--skip-load", action="store_true", help="Skip load benchmark")

    args = parser.parse_args()

    config = BenchmarkConfig.from_env()

    if not config.eval_dataset_path.exists():
        print(f"Error: Eval dataset not found at {config.eval_dataset_path}")
        print("Run `python -m benchmarks.generate_eval_dataset` first, or create eval_dataset.json manually.")
        print("See eval_dataset.json for the expected format.")
        sys.exit(1)

    run_all(config, args)


if __name__ == "__main__":
    main()