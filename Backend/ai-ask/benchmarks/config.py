import os
import json
import re
from dataclasses import dataclass, field
from pathlib import Path


BENCHMARKS_DIR = Path(__file__).parent
EVAL_DATASET_PATH = BENCHMARKS_DIR / "eval_dataset.json"
RESULTS_DIR = BENCHMARKS_DIR / "results" / "optimize_getblogbyid"

_DOCKER_HOSTS = {"qdrant", "server", "redis"}


def _localize_url(url: str) -> str:
    return re.sub(
        rf'://({"|".join(_DOCKER_HOSTS)})(:|\b)',
        r'://localhost\2',
        url,
    )


@dataclass(frozen=True)
class BenchmarkConfig:
    qdrant_url: str
    qdrant_collection: str
    embedding_model_name: str
    backend_url: str
    groq_api_key: str
    llm_mode: str
    results_dir: Path = RESULTS_DIR
    eval_dataset_path: Path = EVAL_DATASET_PATH

    @staticmethod
    def from_env() -> "BenchmarkConfig":
        from dotenv import load_dotenv
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        env_paths = [
            project_root / ".env",
            Path(".env"),
            Path(__file__).resolve().parent.parent / ".env",
        ]
        for env_path in env_paths:
            if env_path.exists():
                load_dotenv(env_path)
                break
        load_dotenv()
        return BenchmarkConfig(
            qdrant_url=_localize_url(os.getenv("QDRANT_URL", "http://localhost:6333")),
            qdrant_collection=os.getenv("QDRANT_COLLECTION", "blog_posts"),
            embedding_model_name=os.getenv("EMBEDDING_MODEL_NAME", "nomic-ai/nomic-embed-text-v1.5"),
            backend_url=_localize_url(os.getenv("BACKEND_URL", "http://localhost:6969")),
            groq_api_key=os.getenv("GROQ_API", ""),
            llm_mode=os.getenv("AI_ASKMODE", "api"),
        )

    def __str__(self) -> str:
        return f"""Qdrant URL : {self.qdrant_url}
Qdrant Collection : {self.qdrant_collection}
Embedding Model : {self.embedding_model_name}
Backend URL: {self.backend_url}
GroqAPI: {self.groq_api_key}
LLM Mode: {self.llm_mode}
"""


def ensure_results_dir(config: BenchmarkConfig) -> Path:
    config.results_dir.mkdir(parents=True, exist_ok=True)
    return config.results_dir


def save_result(filename: str, data: dict, config: BenchmarkConfig) -> Path:
    results_dir = ensure_results_dir(config)
    filepath = results_dir / filename
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, default=str)
    return filepath