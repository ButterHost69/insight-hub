import logging
import time

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

QdrantDBClient = None
retries = 5
log = logging.getLogger(__name__)  

def ping_qdrant(client):
    try:
        client.get_collections()
        return True
    except Exception:
        return False

def connect_qdrant(qdrant_url:str, qdrant_collection:str) -> bool:
    global QdrantDBClient
    for attempt in range(retries):
        try:
            client = QdrantClient(url=qdrant_url)
            if not ping_qdrant(client):
                log.warning(f"⚠️ Could not connect to Qdrant DB !!")
                log.warning(f"⚠️ Attempt {attempt+1}/{retries} failed, retrying in 2s...")
                time.sleep(2)
                continue
            
            if not client.collection_exists(qdrant_collection):
                log.warning(f"⚠️ Collection {qdrant_collection} doesnt exist in Qdrant DB !!")
                log.warning(f"⚠️ Creating {qdrant_collection} Collection in Qdrant DB !!")
                client.create_collection(
                    collection_name=qdrant_collection,
                    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
                )
            QdrantDBClient = client
            log.info("✅ Connected to Qdrant")
            return True
        except Exception as e:
            log.warning(f"⚠️ Attempt {attempt+1}/{retries} failed, retrying in 2s... Because: \n{e}")
            time.sleep(2)
    return False