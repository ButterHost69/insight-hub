import os
import numpy as np
import redis
from redis.exceptions import ConnectionError
import time
import json
import logging
import requests
from fastembed import TextEmbedding
from qdrant_db import store_embedding, get_relevant_blogs
from llm import perform_llm_call

log = logging.getLogger(__name__)
RedisClient : redis.Redis
retries = 3
EMBEDDING_PRIORITY = 10

embedding_model : TextEmbedding

BackendURL:str

PROMPT="""Using the below provided Context answer the following question
<Context>
{blogs_body}
</Context>
<Question>
{question}
</Question>

Response:
"""


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
        # Create Embeddings of the Input Prompt
        prompt_vectors = embedding_model.embed(req["payload"])
        first = next(iter(prompt_vectors))
        prompt_vector_list = np.asarray(first).tolist() 
        
        # Get relevant Blogs.
        blog_embed_ids = get_relevant_blogs(search_query=prompt_vector_list, limit=3)

        # Fetch Those Blogs details
        url = BackendURL + "blogs/embed-id"
        payload = {"embed_ids": blog_embed_ids}
        response = requests.get(url, json=payload).json()
        
        if response["success"] != True:
            raise Exception(f"Could Not Fetch Blog Details Properly, got response['success']: {response["success"]} need bool:True")
            
        blogs = response.get("data")
        resp_blogs_json: list[dict[str, str]] = []
        context = ""
        for blog in blogs:
            context += f"Blog Title: {blog["title"]}\n-------------\nBlog Body:\n{blog["blog_content"]}\n-------------"
            resp_blogs_json.append(
                {
                    "title":blog["title"],
                    # TODO: Make it to blog["id"] -> but have to render the blogs by id too.
                    "slug":blog["title"],
                }
            )
        
        # Send the Request to the LLM
        prompt = PROMPT.format(
            blogs_body = context,
            question = req["payload"],
        )
        
        response = perform_llm_call(prompt)

        # Send the Response
        return json.dumps({"response": response, "blogs": resp_blogs_json})

    elif payload_type == "Embedding":
        doc_id = req.get("id", "")
        text = req.get("payload", "")

        vectors = embedding_model.embed(text)
        first = next(iter(vectors))
        vector_list = np.asarray(first).tolist() 

        success = store_embedding(doc_id, text, vector_list)

        if success:
            return json.dumps(
                {"status": "success", "doc_id": doc_id, "vector_dim": len(vector_list)}
            )
        else:
            raise Exception("Failed to store embedding in Qdrant")

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


def run_server(channel_name: str, backend_url:str):
    global BackendURL
    BackendURL = backend_url
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
