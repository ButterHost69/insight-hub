from dotenv import load_dotenv
from dataclasses import dataclass
import os



@dataclass(frozen=True)
class Config:
    REDIS_URL: str
    REDIS_CHANNEL: str
    QDRANT_URL: str
    QDRANT_COLLECTION: str
    AI_ASKMODE :str
    VLLM_URL: str
    HF_TOKEN: str
    GROQ_API: str
    EMBEDDING_MODEL_NAME: str

def load_config() -> Config:
    load_dotenv()  # reads .env from current directory
    redis_url = os.getenv("REDIS_URL", None)
    redis_channel = os.getenv("REDIS_CHANNEL", None)
    qdrant_url = os.getenv("QDRANT_URL", None)
    qdrant_collection = os.getenv("QDRANT_COLLECTION", None)
    ai_ask_mode = os.getenv("AI_ASKMODE", None)
    vllm_url = os.getenv("VLLM_URL", None)
    hf_token = os.getenv("HF_TOKEN", None)
    groq_api = os.getenv("GROQ_API", None)
    emb_model_name = os.getenv("EMBEDDING_MODEL_NAME", None)
    
    return Config(redis_url, redis_channel, qdrant_url, qdrant_collection, ai_ask_mode, vllm_url, hf_token, groq_api, emb_model_name) # type: ignore