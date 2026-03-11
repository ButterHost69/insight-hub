package db

import (
	"context"
	"fmt"
	"log"

	"cloud.google.com/go/firestore"
	"github.com/redis/go-redis/v9"
	"google.golang.org/api/option"
)

var (
	FirestoreClient *firestore.Client
	RedisClient *redis.Client
)

const (
	UsersCollection = "users"
)

func Init() error {
	credentialsPath := "db/Firebase_Credentials.json"

	// Initialize Firestore
	if err := InitFirestore(credentialsPath); err != nil {
		return fmt.Errorf("❌ Firestore initialization failed: %v", err)
	}

	log.Println("✅ Firestore initialized successfully")

	// Connect to redis
	// [ ] Make it so it loads from .env file
	redisURL := "redis:6379"
	if err := InitRedisDB(redisURL); err != nil {
		return fmt.Errorf("❌ Connecting to RedisDB failed: %v", err)
	}
	
	log.Println("✅ Connected to RedisDB successfully")

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
}
