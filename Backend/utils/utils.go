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
}

func LoadConfig() (*AppConfig, error) {
	if err := godotenv.Load(); err != nil {
		return nil, fmt.Errorf("error loading .env file : %v", err)
	}

	ServerPortStr := os.Getenv("SERVER_PORT")
	ServerPort , err := strconv.Atoi(ServerPortStr)
	if err != nil || ServerPort <= 0 {
		return nil , fmt.Errorf("invalid or missing SERVER_PORT in environment")
	}

	return &AppConfig{
		ServerPort : ServerPort,
	} , nil
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
