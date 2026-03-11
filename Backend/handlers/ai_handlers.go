package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
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

	response := AskAIResponse{
		Response: "This is a mock AI response. Integration with actual AI service coming soon. You asked: " + prompt,
		Blogs: []Blog{
			{Title: "10 Tips for Better Writing", Slug: "Damn Sone"},
			{Title: "How to Hook Your Readers", Slug: "how-to-hook-your-readers"},
		},
	}

	c.JSON(http.StatusOK, response)
}