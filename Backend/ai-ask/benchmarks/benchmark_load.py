import json
import time
import argparse
import threading
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import requests

from config import BenchmarkConfig, save_result


@dataclass
class RequestResult:
    question: str
    status_code: int
    latency_ms: float
    success: bool
    error: str | None = None


def make_ask_request(question: str, backend_url: str, timeout: int = 60) -> RequestResult:
    start = time.perf_counter()
    try:
        response = requests.get(
            f"{backend_url}/askAI",
            params={"prompt": question},
            timeout=timeout,
        )
        latency_ms = (time.perf_counter() - start) * 1000

        if response.status_code == 200:
            data = response.json()
            return RequestResult(
                question=question,
                status_code=response.status_code,
                latency_ms=latency_ms,
                success=True,
            )
        else:
            return RequestResult(
                question=question,
                status_code=response.status_code,
                latency_ms=latency_ms,
                success=False,
                error=f"HTTP {response.status_code}: {response.text[:200]}",
            )
    except requests.exceptions.Timeout:
        latency_ms = (time.perf_counter() - start) * 1000
        return RequestResult(
            question=question,
            status_code=0,
            latency_ms=latency_ms,
            success=False,
            error="Request timed out",
        )
    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        return RequestResult(
            question=question,
            status_code=0,
            latency_ms=latency_ms,
            success=False,
            error=str(e),
        )


def run_load_benchmark(
    config: BenchmarkConfig,
    num_concurrent: int = 10,
    num_requests: int = 50,
    timeout: int = 60,
    ramp_up: bool = False,
) -> dict:
    with open(config.eval_dataset_path) as f:
        dataset = json.load(f)

    questions = [q["question"] for q in dataset["questions"]]
    if not questions:
        print("Error: No questions found in eval dataset")
        return {}

    print(f"Load benchmark configuration:")
    print(f"  Concurrent users:  {num_concurrent}")
    print(f"  Total requests:    {num_requests}")
    print(f"  Timeout per req:   {timeout}s")
    print(f"  Backend URL:       {config.backend_url}")
    print(f"  Questions pool:    {len(questions)}")

    import random
    request_questions = [random.choice(questions) for _ in range(num_requests)]

    results: list[RequestResult] = []
    lock = threading.Lock()

    print(f"\nSending {num_requests} requests with {num_concurrent} concurrent workers...")

    wall_start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
        futures = {}
        for i, question in enumerate(request_questions):
            future = executor.submit(make_ask_request, question, config.backend_url, timeout)
            futures[future] = i

            if ramp_up and i > 0 and i % max(1, num_requests // num_concurrent) == 0:
                time.sleep(0.5)

        for future in as_completed(futures):
            result = future.result()
            with lock:
                results.append(result)

            idx = len(results)
            if idx % 10 == 0 or idx == num_requests:
                print(f"  Completed {idx}/{num_requests} requests")

    wall_time = time.perf_counter() - wall_start

    successful = [r for r in results if r.success]
    failed = [r for r in results if not r.success]

    latencies = [r.latency_ms for r in results]
    success_latencies = [r.latency_ms for r in successful]

    output = {
        "benchmark_type": "load",
        "config": {
            "num_concurrent": num_concurrent,
            "num_requests": num_requests,
            "timeout": timeout,
            "backend_url": config.backend_url,
            "ramp_up": ramp_up,
        },
        "summary": {
            "total_requests": num_requests,
            "successful": len(successful),
            "failed": len(failed),
            "success_rate": round(len(successful) / num_requests, 4) if num_requests > 0 else 0,
            "wall_time_s": round(wall_time, 2),
            "requests_per_second": round(num_requests / wall_time, 2) if wall_time > 0 else 0,
        },
        "latency_all": {
            "mean_ms": round(statistics.mean(latencies), 2) if latencies else 0,
            "median_ms": round(statistics.median(latencies), 2) if latencies else 0,
            "p90_ms": round(sorted(latencies)[int(len(latencies) * 0.9)], 2) if len(latencies) > 10 else 0,
            "p95_ms": round(sorted(latencies)[int(len(latencies) * 0.95)], 2) if len(latencies) > 20 else 0,
            "p99_ms": round(sorted(latencies)[int(len(latencies) * 0.99)], 2) if len(latencies) > 100 else 0,
            "min_ms": round(min(latencies), 2) if latencies else 0,
            "max_ms": round(max(latencies), 2) if latencies else 0,
            "stdev_ms": round(statistics.stdev(latencies), 2) if len(latencies) > 1 else 0,
        },
        "latency_successful": {
            "mean_ms": round(statistics.mean(success_latencies), 2) if success_latencies else 0,
            "median_ms": round(statistics.median(success_latencies), 2) if success_latencies else 0,
            "p95_ms": round(sorted(success_latencies)[int(len(success_latencies) * 0.95)], 2) if len(success_latencies) > 20 else 0,
            "min_ms": round(min(success_latencies), 2) if success_latencies else 0,
            "max_ms": round(max(success_latencies), 2) if success_latencies else 0,
        } if success_latencies else {},
        "errors": [
            {"question": r.question[:50], "status_code": r.status_code, "error": r.error}
            for r in failed[:20]
        ],
    }

    filepath = save_result("load_benchmark.json", output, config)
    print(f"\n{'='*60}")
    print(f"LOAD BENCHMARK RESULTS")
    print(f"{'='*60}")
    print(f"  Total requests:       {num_requests}")
    print(f"  Successful:           {len(successful)}/{num_requests} ({output['summary']['success_rate']*100:.1f}%)")
    print(f"  Failed:               {len(failed)}/{num_requests}")
    print(f"  Wall time:            {wall_time:.2f}s")
    print(f"  Throughput:           {output['summary']['requests_per_second']} req/s")
    print(f"  Latency (all, mean):  {output['latency_all']['mean_ms']:.2f}ms")
    print(f"  Latency (all, p95):    {output['latency_all'].get('p95_ms', 'N/A')}ms")
    if success_latencies:
        print(f"  Latency (success, mean): {output['latency_successful']['mean_ms']:.2f}ms")
    if failed:
        print(f"  Sample errors:")
        for err in output["errors"][:5]:
            print(f"    [{err['status_code']}] {err['error'][:80]}")
    print(f"\n  Results saved to: {filepath}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run load benchmark against /askAI endpoint")
    parser.add_argument("--concurrent", type=int, default=10, help="Number of concurrent users")
    parser.add_argument("--requests", type=int, default=50, help="Total number of requests")
    parser.add_argument("--timeout", type=int, default=60, help="Request timeout in seconds")
    parser.add_argument("--ramp-up", action="store_true", help="Ramp up requests gradually")
    args = parser.parse_args()

    config = BenchmarkConfig.from_env()
    run_load_benchmark(
        config,
        num_concurrent=args.concurrent,
        num_requests=args.requests,
        timeout=args.timeout,
        ramp_up=args.ramp_up,
    )