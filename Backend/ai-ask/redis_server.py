import os
import re
import numpy as np
import redis
from redis.exceptions import ConnectionError
import time
import json
import logging
from fastembed import TextEmbedding
from qdrant_db import store_embedding, get_relevant_chunks
from llm import perform_llm_call

log = logging.getLogger(__name__)
RedisClient : redis.Redis
retries = 3
EMBEDDING_PRIORITY = 10

embedding_model : TextEmbedding

PROMPT="""Answer the question using ONLY the provided context below. Be concise and accurate. If the context does not contain enough information, say so honestly.

<Context>
{blogs_body}
</Context>

<Question>
{question}
</Question>

Answer (concise, factual, use bullet points for lists):"""


def chunk_text(text: str, max_chars: int = 1500, overlap_chars: int = 400) -> list[str]:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    if not sentences:
        return [text]

    chunks: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for sentence in sentences:
        sentence_len = len(sentence)
        if current_len + sentence_len > max_chars and current_chunk:
            chunks.append(" ".join(current_chunk))
            overlap_len = 0
            overlap_sentences: list[str] = []
            for s in reversed(current_chunk):
                if overlap_len + len(s) > overlap_chars:
                    break
                overlap_sentences.insert(0, s)
                overlap_len += len(s)
            current_chunk = overlap_sentences
            current_len = overlap_len

        current_chunk.append(sentence)
        current_len += sentence_len

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def init_embedding_model(model_name:str):
    global embedding_model
    cache_dir = os.getenv("FASTEMBED_CACHE_DIR", "/root/.cache/fastembed")
    embedding_model = TextEmbedding(model_name=model_name, cache_dir=cache_dir)
    log.info(f"✅ Loaded embedding model: {model_name}")


def get_embedding_dim() -> int:
    test_vector = next(iter(embedding_model.embed("__dim_test__")))
    return len(test_vector)


def connect_redis(host: str, port: int) -> bool:
    global RedisClient
    for attempt in range(retries):
        try:
            r = redis.Redis(host=host, port=port, decode_responses=True)
            if not r.ping(): # type: ignore
                log.warning(f"⚠️ Attempt {attempt + 1}/{retries} failed, retrying in 2s...")
                time.sleep(2)    
                continue
            RedisClient = r
            log.info("✅ Connected to Redis")
            return True
        except ConnectionError:
            log.warning(f"⚠️ Attempt {attempt + 1}/{retries} failed, retrying in 2s...")
            time.sleep(2)
    return False


def close_server():
    try:
        RedisClient.close()
        log.info("Closing Connection to Redis")
    except Exception as e:
        print(f"Error in closing Redis Client: {e}")


def process(req: dict[str, str]) -> str:
    payload_type = req["payload_type"]

    if payload_type == "RAG":
        prompt_vectors = embedding_model.embed(req["payload"])
        first = next(iter(prompt_vectors))
        prompt_vector_list = np.asarray(first).tolist()

        chunks = get_relevant_chunks(search_query=prompt_vector_list, limit=7)

        if not chunks:
            resp_blogs_json: list[dict[str, str]] = []
            prompt = PROMPT.format(
                blogs_body="No relevant content found.",
                question=req["payload"],
            )
            response = perform_llm_call(prompt)
            return json.dumps({"response": response, "blogs": resp_blogs_json})

        # filter low-relevance chunks (cosine similarity < 0.5 is noise)
        relevant_chunks = [c for c in chunks if c.get("score", 0) >= 0.5]

        # deduplicate by blog_id, keeping the highest-scoring chunk per blog
        seen_blogs: dict[str, dict] = {}
        for chunk in (relevant_chunks or chunks):
            blog_id = chunk.get("blog_id", chunk.get("id", ""))
            if not blog_id:
                continue
            if blog_id not in seen_blogs or chunk.get("score", 0) > seen_blogs[blog_id].get("score", 0):
                seen_blogs[blog_id] = chunk

        # sort by score descending, take top 3
        unique_chunks = sorted(seen_blogs.values(), key=lambda c: c.get("score", 0), reverse=True)[:3]

        context = ""
        resp_blogs_json: list[dict[str, str]] = []
        for chunk in unique_chunks:
            title = chunk.get("title", "Untitled")
            text = chunk.get("text", "")
            context += f"Blog Title: {title}\n-------------\nBlog Body:\n{text}\n-------------"
            resp_blogs_json.append({
                "title": title,
                "slug": title,
            })

        prompt = PROMPT.format(
            blogs_body=context,
            question=req["payload"],
        )

        response = perform_llm_call(prompt)
        return json.dumps({"response": response, "blogs": resp_blogs_json})

    elif payload_type == "Embedding":
        doc_id = req.get("id", "")
        text = req.get("payload", "")
        title = req.get("title", "")

        chunks = chunk_text(text)
        for i, chunk in enumerate(chunks):
            vectors = embedding_model.embed(chunk)
            first = next(iter(vectors))
            vector_list = np.asarray(first).tolist()

            chunk_id = f"{doc_id}_{i}"
            store_embedding(
                chunk_id,
                chunk,
                vector_list,
                payload={
                    "blog_id": doc_id,
                    "chunk_index": i,
                    "title": title,
                },
            )

        return json.dumps({
            "status": "success",
            "doc_id": doc_id,
            "chunks": len(chunks),
        })

    else:
        raise ValueError(f"Unknown payload type: {payload_type}")


def send_response(req_id: str, result: str = "", error: str = ""):
    resp = {
        "id": req_id,
        "result": result,
        "error": error,
    }
    RedisClient.lpush(req_id, json.dumps(resp))
    RedisClient.expire(req_id, 60)  # cleanup key after 60s


def run_server(channel_name: str):
    log.info(
        f"👂 Python worker listening on '{channel_name}' for priority {EMBEDDING_PRIORITY} (Embedding)..."
    )

    PRINT_COUNT = 30
    no_request_count = 0
    while True:
        messages = RedisClient.zrange(channel_name, 0, 0, withscores=True) # type: ignore

        if not messages:
            no_request_count += 1
            if no_request_count == PRINT_COUNT:
                log.info(f"🏓 ping — no requests for {PRINT_COUNT}s ...")
                no_request_count = 0

            time.sleep(1)
            continue

        raw, _ = messages[0] # type: ignore
        RedisClient.zrem(channel_name, raw) # type: ignore

        try:
            req = json.loads(raw) # type: ignore
        except json.JSONDecodeError as e:
            log.error(f"❌ Failed to parse request: {e}")
            continue

        req_id = req.get("id")
        payload = req.get("payload", "")[:8]

        log.info(f"📥 [{req_id[:8]}] Recv: {payload} | Type: {req['payload_type']}")

        if not req_id:
            log.error(f"❌ [{req_id[:8]}] No reply_to field — dropping request")
            continue

        try:
            result = process(req)
            send_response(req_id, result=result)
            log.info(f"📤 Sent response to [{req_id[:8]}]")

        except Exception as e:
            log.error(f"❌ [{req_id[:8]}] Processing failed: {e}")
            send_response(req_id, error=str(e))  # always reply, even on failure
