import json
import time
import argparse
import statistics
from dataclasses import dataclass

import numpy as np
import requests
from qdrant_client import QdrantClient
from fastembed import TextEmbedding

from config import BenchmarkConfig, save_result


@dataclass
class LatencyMeasurement:
    question: str
    embed_ms: float
    search_ms: float
    fetch_blogs_ms: float
    llm_ms: float | None
    total_ms: float


def percentile(data: list[float], p: float) -> float:
    sorted_data = sorted(data)
    idx = max(0, int(len(sorted_data) * p / 100) - 1)
    return sorted_data[min(idx, len(sorted_data) - 1)]


def run_latency_benchmark(
    config: BenchmarkConfig,
    num_iterations: int = 10,
    include_llm: bool = False,
    max_questions: int | None = None,
) -> dict:
    with open(config.eval_dataset_path) as f:
        dataset = json.load(f)

    questions = dataset["questions"]
    if max_questions:
        questions = questions[:max_questions]

    print(f"Loaded {len(questions)} evaluation questions")
    print(f"Running {num_iterations} iterations per question")
    print(f"LLM latency included: {include_llm}")

    print(f"Loading embedding model: {config.embedding_model_name}")
    embedding_model = TextEmbedding(model_name=config.embedding_model_name)

    print(f"Connecting to Qdrant at {config.qdrant_url}")
    qdrant_client = QdrantClient(url=config.qdrant_url)

    groq_client = None
    if include_llm:
        try:
            from groq import Groq
            groq_client = Groq(api_key=config.groq_api_key)
            print("Groq client initialized for LLM latency measurement")
        except Exception as e:
            print(f"Warning: Could not initialize Groq client: {e}")
            include_llm = False

    PROMPT_TEMPLATE = """Using the below provided Context answer the following question
<Context>
{blogs_body}
</Context>
<Question>
{question}
</Question>

Response:
"""

    measurements: list[LatencyMeasurement] = []

    warmup_question = questions[0]["question"]
    print("Warming up embedding model...")
    _ = next(iter(embedding_model.embed(warmup_question)))
    _ = qdrant_client.query_points(
        collection_name=config.qdrant_collection,
        query=np.zeros(768).tolist(),
        limit=1,
    )

    for q_idx, q in enumerate(questions):
        question_text = q["question"]

        for iteration in range(num_iterations):
            total_start = time.perf_counter()

            embed_start = time.perf_counter()
            query_vector = np.asarray(next(iter(embedding_model.embed(question_text)))).tolist()
            embed_ms = (time.perf_counter() - embed_start) * 1000

            search_start = time.perf_counter()
            search_results = qdrant_client.query_points(
                collection_name=config.qdrant_collection,
                query=query_vector,
                limit=3,
            )
            search_ms = (time.perf_counter() - search_start) * 1000

            retrieved_ids = [str(point.id) for point in search_results.points]

            fetch_start = time.perf_counter()
            try:
                blog_response = requests.get(
                    f"{config.backend_url}/blogs/embed-id",
                    json={"embed_ids": retrieved_ids},
                    timeout=10,
                )
                fetch_blogs_ms = (time.perf_counter() - fetch_start) * 1000
                blogs_data = blog_response.json().get("data", [])
            except Exception as e:
                fetch_blogs_ms = (time.perf_counter() - fetch_start) * 1000
                blogs_data = []
                print(f"  Warning: Blog fetch failed for q#{q_idx} iter#{iteration}: {e}")

            llm_ms = None
            if include_llm and groq_client and blogs_data:
                context = ""
                for blog in blogs_data:
                    context += f"Blog Title: {blog.get('title', '')}\n-------------\nBlog Body:\n{blog.get('blog_content', '')}\n-------------"

                prompt = PROMPT_TEMPLATE.format(blogs_body=context, question=question_text)

                llm_start = time.perf_counter()
                try:
                    completion = groq_client.chat.completions.create(
                        model="openai/gpt-oss-120b",
                        messages=[{"role": "user", "content": prompt}],
                        temperature=1,
                        max_completion_tokens=8192,
                        top_p=1,
                        reasoning_effort="low",
                        stream=True,
                    )
                    response_text = ""
                    for chunk in completion:
                        response_text += chunk.choices[0].delta.content or ""
                    llm_ms = (time.perf_counter() - llm_start) * 1000
                except Exception as e:
                    llm_ms = (time.perf_counter() - llm_start) * 1000
                    print(f"  Warning: LLM call failed for q#{q_idx} iter#{iteration}: {e}")

            total_ms = (time.perf_counter() - total_start) * 1000

            measurements.append(LatencyMeasurement(
                question=question_text,
                embed_ms=embed_ms,
                search_ms=search_ms,
                fetch_blogs_ms=fetch_blogs_ms,
                llm_ms=llm_ms,
                total_ms=total_ms,
            ))

    def stats(field: str) -> dict:
        values = [getattr(m, field) for m in measurements if getattr(m, field) is not None]
        if not values:
            return {}
        return {
            "mean": round(float(np.mean(values)), 2),
            "median": round(float(np.median(values)), 2),
            "p50": round(percentile(values, 50), 2),
            "p90": round(percentile(values, 90), 2),
            "p95": round(percentile(values, 95), 2),
            "p99": round(percentile(values, 99), 2),
            "min": round(float(min(values)), 2),
            "max": round(float(max(values)), 2),
            "stdev": round(float(np.std(values)), 2),
        }

    output = {
        "benchmark_type": "latency",
        "config": {
            "embedding_model": config.embedding_model_name,
            "collection": config.qdrant_collection,
            "num_questions": len(questions),
            "num_iterations": num_iterations,
            "include_llm": include_llm,
        },
        "summary": {
            "embed_ms": stats("embed_ms"),
            "search_ms": stats("search_ms"),
            "fetch_blogs_ms": stats("fetch_blogs_ms"),
            "total_ms": stats("total_ms"),
            **({"llm_ms": stats("llm_ms")} if include_llm else {}),
        },
        "measurements": [
            {
                "question": m.question,
                "embed_ms": round(m.embed_ms, 2),
                "search_ms": round(m.search_ms, 2),
                "fetch_blogs_ms": round(m.fetch_blogs_ms, 2),
                "llm_ms": round(m.llm_ms, 2) if m.llm_ms else None,
                "total_ms": round(m.total_ms, 2),
            }
            for m in measurements
        ],
    }

    filepath = save_result("latency_benchmark.json", output, config)
    print(f"\n{'='*60}")
    print(f"LATENCY BENCHMARK RESULTS")
    print(f"{'='*60}")
    print(f"  Embedding (mean):     {output['summary']['embed_ms']['mean']:.2f}ms")
    print(f"  Qdrant search (mean): {output['summary']['search_ms']['mean']:.2f}ms")
    print(f"  Blog fetch (mean):    {output['summary']['fetch_blogs_ms']['mean']:.2f}ms")
    if include_llm and output["summary"].get("llm_ms"):
        print(f"  LLM generation (mean): {output['summary']['llm_ms']['mean']:.2f}ms")
    print(f"  Total (mean):         {output['summary']['total_ms']['mean']:.2f}ms")
    print(f"  Total (p95):          {output['summary']['total_ms']['p95']:.2f}ms")
    print(f"\n  Results saved to: {filepath}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run latency benchmark")
    parser.add_argument("--iterations", type=int, default=10, help="Iterations per question")
    parser.add_argument("--include-llm", action="store_true", help="Include LLM call latency")
    parser.add_argument("--max-questions", type=int, default=None, help="Max questions to benchmark")
    args = parser.parse_args()

    config = BenchmarkConfig.from_env()
    run_latency_benchmark(config, num_iterations=args.iterations, include_llm=args.include_llm, max_questions=args.max_questions)