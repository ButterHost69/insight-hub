import json
import time
import argparse
import numpy as np
from dataclasses import dataclass, field

from qdrant_client import QdrantClient
from fastembed import TextEmbedding

from config import BenchmarkConfig, save_result


@dataclass
class RetrievalResult:
    question: str
    retrieved_ids: list[str]
    relevant_ids: list[str]
    scores: list[float]
    latency_ms: float


def recall_at_k(retrieved: list[str], relevant: list[str], k: int) -> float:
    if not relevant:
        return 0.0
    retrieved_set = set(retrieved[:k])
    return len(retrieved_set & set(relevant)) / len(relevant)


def precision_at_k(retrieved: list[str], relevant: list[str], k: int) -> float:
    if k == 0:
        return 0.0
    retrieved_set = set(retrieved[:k])
    return len(retrieved_set & set(relevant)) / k


def mrr(retrieved: list[str], relevant: list[str]) -> float:
    for i, doc_id in enumerate(retrieved, 1):
        if doc_id in relevant:
            return 1.0 / i
    return 0.0


def ndcg_at_k(retrieved: list[str], relevant: list[str], k: int) -> float:
    dcg = 0.0
    for i, doc_id in enumerate(retrieved[:k], 1):
        if doc_id in relevant:
            dcg += 1.0 / np.log2(i + 1)

    ideal_dcg = 0.0
    for i in range(1, min(len(relevant), k) + 1):
        ideal_dcg += 1.0 / np.log2(i + 1)

    return dcg / ideal_dcg if ideal_dcg > 0 else 0.0


def hit_rate_at_k(retrieved: list[str], relevant: list[str], k: int) -> float:
    return 1.0 if set(retrieved[:k]) & set(relevant) else 0.0


def run_retrieval_benchmark(
    config: BenchmarkConfig,
    k_values: list[int] | None = None,
    max_questions: int | None = None,
) -> dict:
    if k_values is None:
        k_values = [1, 3, 5, 10]

    with open(config.eval_dataset_path) as f:
        dataset = json.load(f)

    questions = dataset["questions"]
    if max_questions:
        questions = questions[:max_questions]

    print(f"Loaded {len(questions)} evaluation questions")
    print(f"Evaluating retrieval at k={k_values}")

    client = QdrantClient(url=config.qdrant_url)
    collection_info = client.get_collection(config.qdrant_collection)
    print(f"Qdrant collection '{config.qdrant_collection}' has {collection_info.points_count} points")

    print(f"Loading embedding model: {config.embedding_model_name}")
    embedding_model = TextEmbedding(model_name=config.embedding_model_name)

    results: list[RetrievalResult] = []
    for i, q in enumerate(questions):
        question_text = q["question"]
        relevant_ids = q["relevant_doc_ids"]

        start = time.perf_counter()
        query_vector = np.asarray(next(iter(embedding_model.embed(question_text)))).tolist()
        embed_time = time.perf_counter() - start

        max_k = max(k_values)
        start = time.perf_counter()
        search_results = client.query_points(
            collection_name=config.qdrant_collection,
            query=query_vector,
            limit=max_k,
        )
        search_time = time.perf_counter() - start

        retrieved_ids = [str(point.id) for point in search_results.points]
        scores = [point.score for point in search_results.points]

        total_latency_ms = (embed_time + search_time) * 1000

        results.append(RetrievalResult(
            question=question_text,
            retrieved_ids=retrieved_ids,
            relevant_ids=relevant_ids,
            scores=scores,
            latency_ms=total_latency_ms,
        ))

        if (i + 1) % 10 == 0 or i == len(questions) - 1:
            print(f"  Processed {i + 1}/{len(questions)} questions")

    metrics: dict = {}
    per_k_metrics: dict[int, dict] = {}

    for k in k_values:
        recalls = [recall_at_k(r.retrieved_ids, r.relevant_ids, k) for r in results]
        precisions = [precision_at_k(r.retrieved_ids, r.relevant_ids, k) for r in results]
        mrrs_list = [mrr(r.retrieved_ids[:k], r.relevant_ids) for r in results]
        ndcgs = [ndcg_at_k(r.retrieved_ids, r.relevant_ids, k) for r in results]
        hits = [hit_rate_at_k(r.retrieved_ids, r.relevant_ids, k) for r in results]

        per_k_metrics[k] = {
            "recall": round(float(np.mean(recalls)), 4),
            "precision": round(float(np.mean(precisions)), 4),
            "mrr": round(float(np.mean(mrrs_list)), 4),
            "ndcg": round(float(np.mean(ndcgs)), 4),
            "hit_rate": round(float(np.mean(hits)), 4),
        }

    latencies = [r.latency_ms for r in results]

    output = {
        "benchmark_type": "retrieval",
        "metadata": dataset.get("metadata", {}),
        "config": {
            "embedding_model": config.embedding_model_name,
            "collection": config.qdrant_collection,
            "k_values": k_values,
            "num_questions": len(questions),
        },
        "metrics_by_k": per_k_metrics,
        "latency": {
            "mean_ms": round(float(np.mean(latencies)), 2),
            "p50_ms": round(float(np.percentile(latencies, 50)), 2),
            "p95_ms": round(float(np.percentile(latencies, 95)), 2),
            "p99_ms": round(float(np.percentile(latencies, 99)), 2),
            "min_ms": round(float(np.min(latencies)), 2),
            "max_ms": round(float(np.max(latencies)), 2),
        },
        "per_question_results": [
            {
                "question": r.question,
                "retrieved_ids": r.retrieved_ids,
                "relevant_ids": r.relevant_ids,
                "scores": r.scores,
                "latency_ms": r.latency_ms,
            }
            for r in results
        ],
    }

    filepath = save_result("retrieval_benchmark.json", output, config)
    print(f"\n{'='*60}")
    print(f"RETRIEVAL BENCHMARK RESULTS")
    print(f"{'='*60}")
    for k, m in per_k_metrics.items():
        print(f"\n  k={k}:")
        print(f"    Recall@{k}:    {m['recall']}")
        print(f"    Precision@{k}: {m['precision']}")
        print(f"    MRR@{k}:       {m['mrr']}")
        print(f"    NDCG@{k}:      {m['ndcg']}")
        print(f"    HitRate@{k}:   {m['hit_rate']}")
    print(f"\n  Latency (mean):  {output['latency']['mean_ms']}ms")
    print(f"  Latency (p95):   {output['latency']['p95_ms']}ms")
    print(f"\n  Results saved to: {filepath}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run retrieval benchmark")
    parser.add_argument("--k-values", type=int, nargs="+", default=[1, 3, 5, 10])
    parser.add_argument("--max-questions", type=int, default=None)
    args = parser.parse_args()

    config = BenchmarkConfig.from_env()
    run_retrieval_benchmark(config, k_values=args.k_values, max_questions=args.max_questions)