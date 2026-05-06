import logging
import time

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

QdrantDBClient : QdrantClient
QdrantCollection : str
retries = 5
log = logging.getLogger(__name__)


def ping_qdrant(client: QdrantClient):
    try:
        client.get_collections()
        return True
    except Exception:
        return False


def connect_qdrant(qdrant_url: str, qdrant_collection: str, embedding_dim: int) -> bool:
    global QdrantDBClient, QdrantCollection
    for attempt in range(retries):
        try:
            client = QdrantClient(url=qdrant_url)
            if not ping_qdrant(client):
                log.warning(f"⚠️ Could not connect to Qdrant DB !!")
                log.warning(
                    f"⚠️ Attempt {attempt + 1}/{retries} failed, retrying in 2s..."
                )
                time.sleep(2)
                continue

            if not client.collection_exists(qdrant_collection):
                log.warning(
                    f"⚠️ Collection {qdrant_collection} doesnt exist in Qdrant DB !!"
                )
                log.warning(
                    f"⚠️ Creating {qdrant_collection} Collection in Qdrant DB !!"
                )
                client.create_collection(
                    collection_name=qdrant_collection,
                    vectors_config=VectorParams(
                        size=embedding_dim, distance=Distance.COSINE
                    ),
                )
            QdrantDBClient = client
            QdrantCollection = qdrant_collection
            log.info("✅ Connected to Qdrant")
            return True
        except Exception as e:
            log.warning(
                f"⚠️ Attempt {attempt + 1}/{retries} failed, retrying in 2s... Because: \n{e}"
            )
            time.sleep(2)
    return False


def store_embedding(doc_id: str, text: str, vector: list[float], payload: dict | None = None) -> bool:
    try:
        payload_data = payload or {}
        payload_data["text"] = text
        point = PointStruct(id=doc_id, vector=vector, payload=payload_data)
        QdrantDBClient.upsert(collection_name=QdrantCollection, points=[point])
        log.info(f"✅ Stored embedding for doc_id: {doc_id}")
        return True
    except Exception as e:
        log.error(f"❌ Failed to store embedding for {doc_id}: {e}")
        return False


def get_relevant_chunks(search_query: list[float], limit: int) -> list[dict]:
    response = QdrantDBClient.query_points(
        collection_name=QdrantCollection,
        query=search_query,
        limit=limit,
        with_payload=True,
    )

    chunks = []
    for point in response.points:
        payload = point.payload or {}
        chunks.append({
            "id": str(point.id),
            "text": payload.get("text", ""),
            "blog_id": payload.get("blog_id", ""),
            "title": payload.get("title", ""),
            "chunk_index": payload.get("chunk_index", 0),
            "score": point.score,
        })
    return chunks
