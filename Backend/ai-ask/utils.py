from dotenv import load_dotenv
from dataclasses import dataclass
import os



@dataclass(frozen=True)
class Config:
    REDIS_URL: str | None
    BACKEND_URL: str | None
    REDIS_CHANNEL: str | None
    QDRANT_URL: str | None
    QDRANT_COLLECTION: str | None
    AI_ASKMODE :str | None
    VLLM_URL: str | None
    HF_TOKEN: str | None
    GROQ_API: str
    EMBEDDING_MODEL_NAME: str | None

def load_config() -> Config:
    load_dotenv()  # reads .env from current directory
    redis_url = os.getenv("REDIS_URL", None)
    redis_channel = os.getenv("REDIS_CHANNEL", None)
    qdrant_url = os.getenv("QDRANT_URL", None)
    qdrant_collection = os.getenv("QDRANT_COLLECTION", None)
    ai_ask_mode = os.getenv("AI_ASKMODE", None)
    vllm_url = os.getenv("VLLM_URL", None)
    hf_token = os.getenv("HF_TOKEN", None)
    groq_api = os.getenv("GROQ_API", "")
    emb_model_name = os.getenv("EMBEDDING_MODEL_NAME", None)
    backend_url = os.getenv("BACKEND_URL", None)
    
    return Config(
        REDIS_URL=redis_url, 
        REDIS_CHANNEL=redis_channel, 
        QDRANT_URL=qdrant_url, 
        QDRANT_COLLECTION=qdrant_collection, 
        AI_ASKMODE=ai_ask_mode, 
        VLLM_URL=vllm_url, 
        HF_TOKEN=hf_token, 
        GROQ_API=groq_api, 
        EMBEDDING_MODEL_NAME=emb_model_name,
        BACKEND_URL=backend_url,
    )