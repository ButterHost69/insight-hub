import redis

REDIS_URL_HOST = "redis"
REDIS_URL_PORT = 6379

if __name__=="__main__":
    # 1. Connect to Redis
    r = redis.Redis(host=REDIS_URL_HOST, port=REDIS_URL_PORT, decode_responses=True)
    print(r.ping())  
    exit

    # # 2. Create a pubsub object and subscribe to the channel
    # p = r.pubsub()
    # p.subscribe("news")

    # print("👂 Listening on channel: news")

    # # 3. Block and listen for messages forever
    # for message in p.listen():
    #     # Redis sends a "subscribe" confirmation message first — skip it
    #     if message["type"] == "message":
    #         print(f"📥 Received: {message['data']}")