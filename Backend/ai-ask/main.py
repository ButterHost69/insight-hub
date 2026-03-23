import logging
from redis_server import connect_redis, run_server, close_server, init_embedding_model
from qdrant_db import connect_qdrant
import utils
from llm import setup_llm

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
log = logging.getLogger(__name__)

if __name__ == "__main__":
    config = utils.load_config()
    setup_llm(config.AI_ASKMODE, config.GROQ_API)
    
    if config.REDIS_URL is None:
        raise Exception("REDIS_URL is None, Please Provide a REDIS_URL env Variable")
    
    rediurl, redisport_str = config.REDIS_URL.split(":")
    ifConnect = connect_redis(host=rediurl, port=int(redisport_str))
    if not ifConnect:
        log.critical("❌ Could Not connect to Redis !!")
        exit(1)
        
    if config.QDRANT_URL is None:
        raise Exception("QDRANT_URL is None, Please Provide a QDRANT_URL env Variable")
    
    if config.QDRANT_COLLECTION is None:
        raise Exception("QDRANT_COLLECTION is None, Please Provide a REQDRANT_COLLECTIONDIS_URL env Variable")
    
    if config.EMBEDDING_MODEL_NAME is None:
        raise Exception("EMBEDDING_MODEL_NAME is None, Please Provide a EMBEDDING_MODEL_NAME env Variable")
    
    ifConnect = connect_qdrant(
        qdrant_url=config.QDRANT_URL, qdrant_collection=config.QDRANT_COLLECTION, model_name=config.EMBEDDING_MODEL_NAME
    )
    if not ifConnect:
        log.critical("❌ Could Not connect to Qdrant !!")
        exit(1)

    init_embedding_model(model_name = config.EMBEDDING_MODEL_NAME)
    
    if config.REDIS_CHANNEL is None:
        raise Exception("REDIS_CHANNEL is None, Please Provide a REDIS_CHANNEL env Variable")

    if config.BACKEND_URL is None:
        raise Exception("BACKEND_URL is None, Please Provide a BACKEND_URL env Variable")
    run_server(channel_name=config.REDIS_CHANNEL, backend_url=config.BACKEND_URL)
    
    close_server()