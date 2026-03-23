package db

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/prachin77/insight-hub/models"
	"github.com/redis/go-redis/v9"
)

func SendRedisRequest(req models.RedisRequest) (models.RedisResponse, error) {
    data, err := json.Marshal(req)
    if err != nil {
        return models.RedisResponse{}, fmt.Errorf("marshal failed: %w", err)
    }

    timeout := 5 * time.Second
	var score float64
    switch req.PayloadType {
    case "RAG":
        timeout = 15 * time.Second
		score = 1
    case "Embedding":
        timeout = 5 * time.Minute
		score = 10
    default:
        return models.RedisResponse{}, fmt.Errorf("unknown payload type: %s", req.PayloadType)
    }

    ctx, cancel := context.WithTimeout(context.Background(), timeout)
    defer cancel()  

    
    if err := RedisClient.ZAdd(ctx, "requests", redis.Z{
        Score:  score,
        Member: string(data),
    }).Err(); err != nil {
        return models.RedisResponse{}, fmt.Errorf("zadd failed: %w", err)
    }

    log.Printf("📤 [%s] Sent: %s | Type: %s\n", req.ID, req.Payload, req.PayloadType)

    result, err := RedisClient.BLPop(ctx, 0, req.ID).Result()
    if err != nil {
        return models.RedisResponse{}, fmt.Errorf("blpop [%s] failed: %w", req.ID, err)
    }

    var resp models.RedisResponse
    if err := json.Unmarshal([]byte(result[1]), &resp); err != nil {
        return models.RedisResponse{}, fmt.Errorf("unmarshal response failed: %w", err)
    }

    if resp.Error != "" {
        return resp, fmt.Errorf("worker error [%s]: %s", req.ID, resp.Error)
    }

    return resp, nil
}