import json
import argparse
import time

import numpy as np
import requests
from qdrant_client import QdrantClient
from fastembed import TextEmbedding

from config import BenchmarkConfig, save_result


def run_generation_benchmark(
    config: BenchmarkConfig,
    max_questions: int | None = None,
) -> dict:
    with open(config.eval_dataset_path) as f:
        dataset = json.load(f)

    questions = dataset["questions"]
    if max_questions:
        questions = questions[:max_questions]

    print(f"Loaded {len(questions)} evaluation questions")

    print(f"Loading embedding model: {config.embedding_model_name}")
    embedding_model = TextEmbedding(model_name=config.embedding_model_name)

    print(f"Connecting to Qdrant at {config.qdrant_url}")
    qdrant_client = QdrantClient(url=config.qdrant_url)

    try:
        from groq import Groq
        groq_client = Groq(api_key=config.groq_api_key)
        print("Groq client initialized")
    except Exception as e:
        print(f"Error: Could not initialize Groq client: {e}")
        print("Cannot run generation benchmark without LLM. Exiting.")
        return {}

    PROMPT_TEMPLATE = """Using the below provided Context answer the following question
<Context>
{blogs_body}
</Context>
<Question>
{question}
</Question>

Response:
"""

    ragas_available = False
    try:
        from ragas import evaluate
        from ragas.dataset_schema import SingleTurnSample, EvaluationDataset
        from ragas.metrics import (
            faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        )
        ragas_available = True
        print("RAGAS library found - will run full evaluation")
    except ImportError:
        print("RAGAS library not found - will collect data only (install ragas for full evaluation)")

    results = []

    for i, q in enumerate(questions):
        question_text = q["question"]
        relevant_ids = q["relevant_doc_ids"]
        ground_truth = q["ground_truth_answer"]

        query_vector = np.asarray(next(iter(embedding_model.embed(question_text)))).tolist()

        search_start = time.perf_counter()
        search_results = qdrant_client.query_points(
            collection_name=config.qdrant_collection,
            query=query_vector,
            limit=3,
        )
        retrieval_time = time.perf_counter() - search_start

        retrieved_ids = [str(point.id) for point in search_results.points]
        retrieved_texts = [point.payload.get("text", "") for point in search_results.points]

        blog_ids = []
        blog_titles = []
        context_parts = []

        try:
            blog_response = requests.get(
                f"{config.backend_url}/blogs/embed-id",
                json={"embed_ids": retrieved_ids},
                timeout=10,
            )
            blogs_data = blog_response.json().get("data", [])
            for blog in blogs_data:
                blog_ids.append(blog.get("embed_id", blog.get("id", "")))
                blog_titles.append(blog.get("title", ""))
                context_parts.append(
                    f"Blog Title: {blog.get('title', '')}\n-------------\nBlog Body:\n{blog.get('blog_content', '')}\n-------------"
                )
        except Exception as e:
            print(f"  Warning: Blog fetch failed for question {i}: {e}")
            context_parts = retrieved_texts

        context = "\n".join(context_parts) if context_parts else "No context available"

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
                stream=False,
            )
            generated_answer = completion.choices[0].message.content or ""
            llm_time = time.perf_counter() - llm_start
        except Exception as e:
            print(f"  Warning: LLM call failed for question {i}: {e}")
            generated_answer = f"ERROR: {e}"
            llm_time = 0

        hit = any(rid in relevant_ids for rid in retrieved_ids)

        results.append({
            "question": question_text,
            "ground_truth": ground_truth,
            "generated_answer": generated_answer,
            "contexts": context_parts if isinstance(context_parts, list) else [context_parts],
            "retrieved_ids": retrieved_ids,
            "relevant_ids": relevant_ids,
            "retrieval_hit": hit,
            "retrieval_time_s": round(retrieval_time, 4),
            "llm_time_s": round(llm_time, 4),
        })

        if (i + 1) % 5 == 0 or i == len(questions) - 1:
            print(f"  Processed {i + 1}/{len(questions)} questions")

    ragas_scores = None
    if ragas_available and len(results) > 0:
        try:
            from ragas import evaluate
            from ragas.dataset_schema import SingleTurnSample, EvaluationDataset
            from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall

            samples = []
            for r in results:
                samples.append(SingleTurnSample(
                    user_input=r["question"],
                    response=r["generated_answer"],
                    reference=r["ground_truth"],
                    retrieved_contexts=r["contexts"] if isinstance(r["contexts"], list) else [r["contexts"]],
                ))

            eval_dataset = EvaluationDataset(samples=samples)

            print("\nRunning RAGAS evaluation (this may take a while)...")
            ragas_result = evaluate(
                dataset=eval_dataset,
                metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
            )

            ragas_scores = {}
            for metric_name, value in ragas_result.items():
                ragas_scores[metric_name] = float(value) if value is not None else None

            print(f"\n  RAGAS Scores:")
            for metric, score in ragas_scores.items():
                print(f"    {metric}: {score}")

        except Exception as e:
            print(f"  Warning: RAGAS evaluation failed: {e}")
            print(f"  Continuing with raw results only...")

    retrieval_hits = [r["retrieval_hit"] for r in results]
    output = {
        "benchmark_type": "generation",
        "config": {
            "embedding_model": config.embedding_model_name,
            "collection": config.qdrant_collection,
            "llm_model": "openai/gpt-oss-120b",
            "num_questions": len(questions),
        },
        "retrieval_hit_rate": round(sum(retrieval_hits) / len(retrieval_hits), 4) if retrieval_hits else 0,
        "ragas_scores": ragas_scores,
        "latency_summary": {
            "mean_retrieval_s": round(float(np.mean([r["retrieval_time_s"] for r in results])), 4),
            "mean_llm_s": round(float(np.mean([r["llm_time_s"] for r in results])), 4),
        },
        "per_question_results": results,
    }

    filepath = save_result("generation_benchmark.json", output, config)
    print(f"\n{'='*60}")
    print(f"GENERATION BENCHMARK RESULTS")
    print(f"{'='*60}")
    print(f"  Questions evaluated:   {len(questions)}")
    print(f"  Retrieval hit rate:    {output['retrieval_hit_rate']}")
    print(f"  Mean retrieval time:   {output['latency_summary']['mean_retrieval_s']}s")
    print(f"  Mean LLM time:         {output['latency_summary']['mean_llm_s']}s")
    if ragas_scores:
        print(f"  RAGAS Scores:")
        for metric, score in ragas_scores.items():
            print(f"    {metric}: {score}")
    else:
        print(f"  RAGAS: Not available (install ragas for generation quality metrics)")
    print(f"\n  Results saved to: {filepath}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run generation benchmark")
    parser.add_argument("--max-questions", type=int, default=None, help="Max questions to evaluate")
    args = parser.parse_args()

    config = BenchmarkConfig.from_env()
    run_generation_benchmark(config, max_questions=args.max_questions)