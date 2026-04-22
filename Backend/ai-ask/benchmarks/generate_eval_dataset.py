import json
import argparse
from datetime import datetime

from qdrant_client import QdrantClient
from fastembed import TextEmbedding

from config import BenchmarkConfig


def generate_dataset(config: BenchmarkConfig, num_questions_per_doc: int = 2, output_path: str | None = None):
    client = QdrantClient(url=config.qdrant_url)

    if not client.collection_exists(config.qdrant_collection):
        print(f"Collection '{config.qdrant_collection}' does not exist in Qdrant.")
        return

    collection_info = client.get_collection(config.qdrant_collection)
    total_points = collection_info.points_count
    print(f"Collection has {total_points} documents")

    print("Loading embedding model...")
    embedding_model = TextEmbedding(model_name=config.embedding_model_name)

    points, _ = client.scroll(
        collection_name=config.qdrant_collection,
        limit=total_points,
        with_payload=True,
    )

    questions = []
    print(f"Generating questions for {len(points)} documents...")

    for point in points:
        payload = point.payload or {}
        text = payload.get("text", "")
        if not text:
            continue

        snippet = text[:200] if len(text) > 200 else text

        for i in range(num_questions_per_doc):
            if i == 0:
                q = f"What is discussed in the blog about: {snippet[:80]}?"
            else:
                q = f"Can you summarize the key points from: {snippet[:80]}?"

            questions.append({
                "question": q,
                "relevant_doc_ids": [str(point.id)],
                "relevant_doc_titles": [],
                "ground_truth_answer": text[:500] if len(text) > 500 else text,
                "difficulty": "medium",
            })

    dataset = {
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "embedding_model": config.embedding_model_name,
            "collection": config.qdrant_collection,
            "description": f"Auto-generated dataset from {len(points)} Qdrant documents with {num_questions_per_doc} questions each",
        },
        "questions": questions,
    }

    out = output_path or str(config.eval_dataset_path)
    with open(out, "w") as f:
        json.dump(dataset, f, indent=2, default=str)

    print(f"Generated {len(questions)} questions, saved to {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate eval dataset from Qdrant documents")
    parser.add_argument("--output", type=str, default=None, help="Output file path")
    parser.add_argument("--questions-per-doc", type=int, default=2, help="Questions per document")
    args = parser.parse_args()

    config = BenchmarkConfig.from_env()
    generate_dataset(config, num_questions_per_doc=args.questions_per_doc, output_path=args.output)