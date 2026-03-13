import logging
from redis_server import connect_redis, run_server, close_server
from qdrant_db import connect_qdrant
import utils

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
log = logging.getLogger(__name__)

if __name__=="__main__":
    config = utils.load_config()
    
    rediurl, redisport_str = config.REDIS_URL.split(":")
    ifConnect = connect_redis(host=rediurl, port=int(redisport_str))
    if not ifConnect:
        log.critical("❌ Could Not connect to Redis !!")
        exit(1)
        
    ifConnect = connect_qdrant(qdrant_url=config.QDRANT_URL, qdrant_collection=config.QDRANT_COLLECTION)
    if not ifConnect:
        log.critical("❌ Could Not connect to Qdrant !!")
        exit(1)
    
    run_server(channel_name=config.REDIS_CHANNEL)
    
    close_server()