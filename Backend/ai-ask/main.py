import logging
from redis_server import connect_redis, run_server, close_server

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
log = logging.getLogger(__name__)

REDIS_URL_HOST = "redis"
REDIS_URL_PORT = 6379

CHANNEL_NAME = "requests"

if __name__=="__main__":
    ifConnect = connect_redis(host=REDIS_URL_HOST, port=REDIS_URL_PORT)
    if not ifConnect:
        log.critical("❌ Could Not connect to Redis succesfully !!")
        exit(1)
    
    run_server(channel_name=CHANNEL_NAME)
    
    close_server()