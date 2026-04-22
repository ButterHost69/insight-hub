package db

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"

	"cloud.google.com/go/firestore"
	"github.com/prachin77/insight-hub/models"
	"github.com/qdrant/go-client/qdrant"
	"github.com/redis/go-redis/v9"

	"google.golang.org/api/option"
)

var (
	FirestoreClient *firestore.Client
	RedisClient     *redis.Client
	QdrantClient    *qdrant.Client

	QdrantCollection string
)

const (
	UsersCollection = "users"
)

func Init(redisUrl, qdrantUrl, qdrantCollection string) error {
	log.Println("Connecting to Databases")
	credentialsPath := "db/Firebase_Credentials.json"

	// Initialize Firestore
	if err := InitFirestore(credentialsPath); err != nil {
		return fmt.Errorf("❌ Firestore initialization failed: %v", err)
	}

	log.Println("✅ Firestore initialized successfully")

	// Connect to redis
	if err := InitRedisDB(redisUrl); err != nil {
		return fmt.Errorf("❌ Connecting to RedisDB failed: %v", err)
	}

	log.Println("✅ Connected to RedisDB successfully")

	if err := InitQdrantDB(qdrantUrl, qdrantCollection); err != nil {
		return fmt.Errorf("❌ Connecting to QdrantDB failed: %v", err)
	}
	log.Println("✅ Connected to QdrantDB successfully")

	log.Println("Qdrant: Checking to see if the vector db is uptodate")

	ctx := context.Background()
	blogCount, err := GetBlogCount(ctx)
	if err != nil {
		Close()
		return fmt.Errorf("Init: failed to get blogs count from firestore: %w", err)
	}

	pointCount, err := GetQdrantDocCount(ctx)
	if err != nil {
		Close()
		return fmt.Errorf("Init: failed to get blogs count from qdrantdb (1): %w", err)
	}

	if blogCount != int64(pointCount) {
		log.Println("Qdrant VectorDB is not upto-date")
		log.Println("Adding All the Blogs on the Redis Queue")

		blogs, err := GetAllBlogs(ctx)
		if err != nil {
			Close()
			return fmt.Errorf("Init: could not fetch all blogs using firestore: %w", err)
		}

		log.Printf("Adding Processing %d Blogs\n", blogCount)
		var wg sync.WaitGroup
		for _, blog := range blogs {
			wg.Go(
				func() {
					SendRedisRequest(models.RedisRequest{
						ID:          blog.EmbedID,
						PayloadType: "Embedding",
						Payload:     blog.BlogContent,
					})
				},
			)
		}

		wg.Wait()
		pointCount, err := GetQdrantDocCount(ctx)
		if err != nil {
			Close()
			return fmt.Errorf("Init: failed to get blogs count from qdrantdb (2): %w", err)
		}

		log.Printf("✅ QdrantDB has: %d, need %d\n", pointCount, blogCount)
		log.Println("✅ QdrantDB is now uptodate !!")
	}
	log.Printf("✅ QdrantDB has: %d, need %d\n", pointCount, blogCount)
	log.Println("✅ Blog Count and Point Count in Firebase and QdrantDB same !!")

	return nil
}

func InitRedisDB(redisURL string) error {
	ctx := context.Background()
	RedisClient = redis.NewClient(&redis.Options{
		Addr:     redisURL,
		Password: "", // no password
		DB:       0,  // default DB
		PoolSize: 10, // connection pool size
	})

	return RedisClient.Ping(ctx).Err()
}

func InitFirestore(credentialsPath string) error {
	ctx := context.Background()

	client, err := firestore.NewClient(ctx, "blog-web-d79ed", option.WithCredentialsFile(credentialsPath))
	if err != nil {
		return err
	}

	FirestoreClient = client
	return nil
}

func InitQdrantDB(dbLink, collectionName string) error {
	ctx := context.Background()

	rawLink := strings.TrimPrefix(dbLink, "https://")
	rawLink = strings.TrimPrefix(rawLink, "http://")

	dblink_split := strings.Split(rawLink, ":")
	if len(dblink_split) != 2 {
		return fmt.Errorf("Qdrant: dblink if not in proper format, need: ip:port have %s", dbLink)
	}

	db_url := dblink_split[0]
	db_port, err := strconv.Atoi(dblink_split[1])
	if err != nil {
		return fmt.Errorf("Qdrant: port not int %s, err:%w", dblink_split[1], err)
	}

	client, err := qdrant.NewClient(&qdrant.Config{
		Host: db_url,
		Port: db_port,
	})

	log.Println("✅ Qdrant: Was able to connect to QDrant !!")
	if err != nil {
		client.Close()
		return fmt.Errorf("Qdrant: failed to create Qdrant client: %w", err)
	}

	exists, err := client.CollectionExists(ctx, collectionName)
	if err != nil {
		client.Close()
		return fmt.Errorf("Qdrant: failed to check collection: %w", err)
	}

	if !exists {
		log.Printf("Qdrant collection %s does not exist\n", collectionName)
		log.Printf("Creating Qdrant Collection %s\n", collectionName)

		// TODO: if qdrantdb not created, just pass the "blogs" into the redis queue for the embeding creations and let python service create
		// 		 the properly sized qdrant collection -- this way no issue with tracking & updating vector size
		err = client.CreateCollection(context.Background(), &qdrant.CreateCollection{
			CollectionName: collectionName,
			VectorsConfig: qdrant.NewVectorsConfig(&qdrant.VectorParams{
				Size:     768, // IMPORTANT: This should be the same as embedding models
				// Size:     1536, // IMPORTANT: This should be the same as embedding models
				Distance: qdrant.Distance_Cosine,
			}),
		})

		if err != nil {
			client.Close()
			return fmt.Errorf("Qdrant: failed to create collection: %w", err)
		}

		log.Println("Qdrant: Collection created!")
	}

	QdrantCollection = collectionName
	QdrantClient = client
	return nil
}

func Close() {
	if FirestoreClient != nil {
		err := FirestoreClient.Close()
		if err != nil {
			log.Printf("⚠️ Error closing Firestore: %v", err)
		} else {
			log.Println("✅ Firestore client closed")
		}
	}

	if RedisClient != nil {
		err := RedisClient.Close()
		if err != nil {
			log.Printf("⚠️ Error closing connection to RedisDB: %v", err)
		} else {
			log.Println("✅ RedisDB connection closed")
		}
	}

	if QdrantClient != nil {
		err := QdrantClient.Close()
		if err != nil {
			log.Printf("⚠️ Error closing connection to QdrantDB: %v", err)
		} else {
			log.Println("✅ QdrantDB connection closed")
		}
	}
}
