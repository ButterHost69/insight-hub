package utils

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
)

// GenerateJWT creates a new JSON Web Token for an authenticated user.
func GenerateJWT(userID, email string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", fmt.Errorf("JWT_SECRET not set in environment")
	}

	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(time.Hour * 24).Unix(), // 24 hour expiry
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

type AppConfig struct {
	ServerPort int
	QdrantURL string
	QdrantCollection string
	RedisUrl string
}

func LoadConfig(pprof bool) (*AppConfig, error) {
	envFile := ".env"
	if pprof {
		envFile = ".env.pprof"
	}
	if err := godotenv.Load(envFile); err != nil {
		return nil, fmt.Errorf("error loading %s file : %v", envFile, err)
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
