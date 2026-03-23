package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/gin-gonic/gin"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/models"
)

type Blog struct {
	Title string `json:"title"`
	Slug  string `json:"slug"`
}

type AskAIResponse struct {
	Response string `json:"response"`
	Blogs    []Blog `json:"blogs"`
}

func AskAI(c *gin.Context) {
	prompt := c.Query("prompt")
	if prompt == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("prompt is required", nil))
		return
	}

	redis_resp, err := db.SendRedisRequest(models.RedisRequest{
		ID:          uuid.New().String(),
		PayloadType: "RAG",
		Payload:     prompt,
	})

	if err != nil {
		c.JSON(
			http.StatusInternalServerError,
			AskAIResponse{
				Response: "Error for Prompt: " + prompt,
				Blogs:    []Blog{},
			},
		)
		return
	}

	var resp AskAIResponse
	err = json.Unmarshal([]byte(redis_resp.Result), &resp)
	if err != nil {
		c.JSON(
			http.StatusInternalServerError,
			AskAIResponse{
				Response: "Error for Prompt: " + prompt,
				Blogs:    []Blog{},
			},
		)
		return
	}
	c.JSON(http.StatusOK, resp)
}
