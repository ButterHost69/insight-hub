import redis
import time
import json
import logging

log = logging.getLogger(__name__)  
RedisClient = None
retries = 3

def connect_redis(host:str, port:int) -> bool:
    global RedisClient
    for attempt in range(retries):
        try:
            r = redis.Redis(host=host, port=port, decode_responses=True)
            r.ping()
            RedisClient = r
            log.info("✅ Connected to Redis")
            return True
        except redis.exceptions.ConnectionError:
            log.warning(f"⚠️ Attempt {attempt+1}/{retries} failed, retrying in 2s...")
            time.sleep(2)
    return False


def close_server():
    if RedisClient is not None:
        RedisClient.close()
        log.info("Closing Connection to Redis")

def process(req: dict) -> str:
    payload_type = req["payload_type"]

    if payload_type == "RAG":
        # RAG SHIT HERE
        return json.dumps({
            "response":req['payload'],
            "blogs":[]
        })

    elif payload_type == "Embedding":
        # EMBED SHIT HERE
        return f"Embedding result for: {req['payload']}"

    else:
        raise ValueError(f"Unknown payload type: {payload_type}")


def send_response(req_id: str, result: str = "", error: str = ""):
    resp = {
        "id":     req_id,
        "result": result,
        "error":  error,
    }
    RedisClient.lpush(req_id, json.dumps(resp))
    RedisClient.expire(req_id, 60)   # cleanup key after 60s



def run_server(channel_name:str):            
    log.info("👂 Python worker listening on 'requests'...")

    PRINT_COUNT = 30
    no_request_count = 0
    while True:
        messages = RedisClient.zrange(channel_name, 0, 0, withscores=True)

        if not messages:
            no_request_count += 1
            if no_request_count == PRINT_COUNT:
                log.info(f"🏓 ping — no requests for {PRINT_COUNT}s ...")
                no_request_count == 0
                
            time.sleep(1)
            continue

        raw, _ = messages[0]
        RedisClient.zrem(channel_name, raw)

        try:
            req = json.loads(raw)
        except json.JSONDecodeError as e:
            log.error(f"❌ Failed to parse request: {e}")
            continue

        req_id   = req.get("id")
        payload  = req.get("payload", "")[:8]

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