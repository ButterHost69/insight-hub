package utils

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type AppConfig struct {
	ServerPort int
	QdrantURL string
	QdrantCollection string
	RedisUrl string
}

func LoadConfig() (*AppConfig, error) {
	if err := godotenv.Load(".env"); err != nil {
		return nil, fmt.Errorf("error loading .env file : %v", err)
	}

	ServerPortStr := os.Getenv("SERVER_PORT")
	ServerPort, err := strconv.Atoi(ServerPortStr)
	if err != nil || ServerPort <= 0 {
		return nil, fmt.Errorf("invalid or missing SERVER_PORT in environment")
	}

	REDIS_URL_Str := os.Getenv("REDIS_URL")
	if REDIS_URL_Str == "" {
		return nil, fmt.Errorf("invalid or missing REDIS_URL in environment")
	}

	QDRANT_URL_Str := os.Getenv("QDRANT_gRPC_URL")
	if QDRANT_URL_Str == "" {
		return nil, fmt.Errorf("invalid or missing QDRANT_URL in environment")
	}

	QDRANT_COLLECTION := os.Getenv("QDRANT_COLLECTION")
	if QDRANT_COLLECTION == "" {
		return nil, fmt.Errorf("invalid or missing QDRANT_COLLECTION in environment")
	}

	return &AppConfig{
		ServerPort: ServerPort,
		RedisUrl: REDIS_URL_Str,
		QdrantURL: QDRANT_URL_Str,
		QdrantCollection: QDRANT_COLLECTION,
	}, nil
}

// NewAuthCookie creates an HTTP cookie for auth with a 10-minute expiry.
func NewAuthCookie(value string) http.Cookie {
	return http.Cookie{
		Name:     "auth_token",
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(10 * time.Minute),
	}
}
