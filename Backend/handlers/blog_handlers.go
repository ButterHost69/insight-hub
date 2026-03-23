package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/models"
)

func CreateBlog(c *gin.Context) {
	var req models.Blog
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Backend Validation
	title := strings.TrimSpace(req.Title)
	if len(title) < 5 || len(title) > 100 {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("title must be between 5 and 100 characters", nil))
		return
	}

	words := strings.Fields(req.BlogContent)
	wordCount := len(words)
	if wordCount < 1 || wordCount > 500 {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("content must be between 1 and 500 words", nil))
		return
	}

	isValidCategory := false
	for _, cat := range models.ValidCategories {
		if req.Category == cat {
			isValidCategory = true
			break
		}
	}
	if !isValidCategory {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("invalid category", nil))
		return
	}

	// Unique Title Check
	exists, err := db.TitleExists(c.Request.Context(), title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse("failed to check title uniqueness", nil))
		return
	}
	if exists {
		c.JSON(http.StatusConflict, models.NewErrorResponse("a blog with this title already exists", nil))
		return
	}

	// Validate author ID
	if req.AuthorID == "" || req.AuthorID == "anonymous" {
		c.JSON(http.StatusUnauthorized, models.NewErrorResponse("authenticated user required", nil))
		return
	}

	userID, err := db.GetUserID(c.Request.Context(), req.AuthorID)
	if err == nil {
		req.AuthorID = userID
	}

	blogID, err := db.CreateBlog(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Notify followers
	followers, _ := db.GetFollowers(c.Request.Context(), req.AuthorID)
	author, _ := db.GetUserByID(c.Request.Context(), req.AuthorID)
	for _, followerID := range followers {
		db.CreateNotification(c.Request.Context(), &models.Notification{
			Recipient: followerID,
			Sender:    author.Username,
			Type:      models.NotificationTypeBlog,
			Message:   author.Username + " published a new blog \"" + req.Title + "\"",
			BlogID:    blogID,
		})
	}

	c.JSON(http.StatusCreated, models.NewSuccessResponse("blog created successfully", gin.H{
		"id":   blogID,
		"blog": req,
	}))
}

func GetBlogs(c *gin.Context) {
	blogs, err := db.GetAllBlogs(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse("failed to fetch blogs", nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("blogs fetched successfully", blogs))
}
func IncrementViews(c *gin.Context) {
	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	if err := db.IncrementViews(c.Request.Context(), req.Title); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("view count incremented", nil))
}

func ToggleLike(c *gin.Context) {
	var req struct {
		Title    string `json:"title"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	isLiked, err := db.ToggleLike(c.Request.Context(), req.Username, req.Title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Create notification if liked
	if isLiked {
		blogID, _ := db.GetBlogID(c.Request.Context(), req.Title)
		blog, _ := db.GetAllBlogs(c.Request.Context()) // This is inefficient, but I'll use it for now as a quick fix or add GetBlogByTitle
		var targetBlog models.Blog
		for _, b := range blog {
			if b.Title == req.Title {
				targetBlog = b
				break
			}
		}

		if targetBlog.AuthorID != "" && targetBlog.AuthorUsername != req.Username {
			db.CreateNotification(c.Request.Context(), &models.Notification{
				Recipient: targetBlog.AuthorID,
				Sender:    req.Username,
				Type:      models.NotificationTypeLike,
				Message:   req.Username + " liked your blog \"" + req.Title + "\"",
				BlogID:    blogID,
			})
		}
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("like status toggled", gin.H{"liked": isLiked}))
}

func AddComment(c *gin.Context) {
	var req models.Comment
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	if err := db.AddComment(c.Request.Context(), &req); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Create notification for the blog author
	// Fetch blog details to get author ID
	blogs, _ := db.GetAllBlogs(c.Request.Context())
	var targetBlog models.Blog
	for _, b := range blogs {
		if b.ID == req.BlogID {
			targetBlog = b
			break
		}
	}

	if targetBlog.AuthorID != "" && targetBlog.AuthorID != req.AuthorID {
		db.CreateNotification(c.Request.Context(), &models.Notification{
			Recipient: targetBlog.AuthorID,
			Sender:    req.AuthorUsername,
			Type:      models.NotificationTypeComment,
			Message:   req.AuthorUsername + " commented on your blog \"" + targetBlog.Title + "\"",
			BlogID:    req.BlogID,
		})
	}

	c.JSON(http.StatusCreated, models.NewSuccessResponse("comment added successfully", req))
}

func UpdateBlog(c *gin.Context) {
	var req models.Blog
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	isValidCategory := false
	for _, cat := range models.ValidCategories {
		if req.Category == cat {
			isValidCategory = true
			break
		}
	}
	if !isValidCategory {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("invalid category", nil))
		return
	}

	if err := db.UpdateBlog(c.Request.Context(), &req); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("blog updated successfully", req))
}

func DeleteBlog(c *gin.Context) {
	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	if err := db.DeleteBlog(c.Request.Context(), req.Title); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("blog deleted successfully", nil))
}

func GetComments(c *gin.Context) {
	blogID := c.Query("blog_id")
	if blogID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("blog_id is required", nil))
		return
	}

	comments, err := db.GetComments(c.Request.Context(), blogID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse("failed to fetch comments", nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("comments fetched successfully", comments))
}

func GetBlogsByEmbedIDs(c *gin.Context) {
	var req struct {
		EmbedIDs []string `json:"embed_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("invalid request body", nil))
		return
	}

	if len(req.EmbedIDs) == 0 {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("embed_ids array is required", nil))
		return
	}

	blogs, err := db.GetBlogsByEmbedIDs(c.Request.Context(), req.EmbedIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse("failed to fetch blogs", nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("blogs fetched successfully", blogs))
}
