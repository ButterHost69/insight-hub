package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/prachin77/insight-hub/chat/Chat_Backend"
	"github.com/prachin77/insight-hub/chat/Chat_Handlers"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/handlers"
	"github.com/prachin77/insight-hub/middleware"
	"github.com/prachin77/insight-hub/models"
	"github.com/prachin77/insight-hub/utils"
)

func main() {
	// Load application configuration from .env
	config, err := utils.LoadConfig()
	if err != nil {
		log.Fatalf("❌ Failed to load configuration: %v", err)
	}

	// Initialize Firestore and Connect to Redis , Qdrant database
	if err := db.Init(config.RedisUrl, config.QdrantURL, config.QdrantCollection); err != nil {
		log.Fatalf("❌ Failed to initialize Databases: %v", err)
	}

	log.Println("✅ Connected to all databases !!")
	defer db.Close()

	// Start gRPC Messaging Server in background
	grpcPort := 50051
	go chat_backend.StartServer(grpcPort)

	// Initialize gRPC Client Handlers
	chat_handlers.InitClient(fmt.Sprintf("localhost:%d", grpcPort))

	// Create Gin server (simple, explicit setup)
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Basic middlewares
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.CORSMiddleware())

	// Basic health check route
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, models.NewSuccessResponse("health ok", gin.H{
			"status": "ok",
		}))
	})

	// Auth routes
	r.POST("/register", handlers.Register)
	r.POST("/login", handlers.Login)
	r.POST("/logout", handlers.Logout)
	r.GET("/user/:username", handlers.GetUser)
	r.GET("/user/id/:id", handlers.GetUserByIDHandler)
	r.POST("/blogs", handlers.CreateBlog)
	r.PUT("/blogs/update", handlers.UpdateBlog)
	r.DELETE("/blogs/delete", handlers.DeleteBlog)
	r.GET("/blogs", handlers.GetBlogs)
	r.POST("/blogs/increment-views", handlers.IncrementViews)
	r.POST("/blogs/toggle-like", handlers.ToggleLike)
	r.POST("/comments", handlers.AddComment)
	r.GET("/comments", handlers.GetComments)

	// Follow and Notification routes
	r.POST("/follow/toggle", handlers.ToggleFollow)
	r.GET("/follow/check", handlers.CheckFollow)
	r.GET("/follow/network", handlers.GetUserNetwork)
	r.GET("/notifications", handlers.GetNotifications)
	r.POST("/notifications/:id/read", handlers.MarkNotificationRead)
	r.POST("/notifications/read-all", handlers.MarkAllNotificationsRead)
	r.GET("/notifications/unread-count", handlers.GetUnreadCount)

	// Ask AI
	r.GET("/askAI", handlers.AskAI)
	// Chat routes (via gRPC Handlers)
	chatGroup := r.Group("/chat")
	{
		chatGroup.GET("/sidebar", chat_handlers.GetChatSidebar)
		chatGroup.GET("/messages", chat_handlers.GetMessages)
		chatGroup.POST("/send", chat_handlers.SendMessage)
		chatGroup.POST("/read", chat_handlers.ReadMessages)
		chatGroup.DELETE("/message", chat_handlers.DeleteMessage)
		chatGroup.PUT("/message", chat_handlers.EditMessage)
		chatGroup.GET("/stream", chat_handlers.StreamMessagesWS)
	}

	addr := fmt.Sprintf(":%d", config.ServerPort)
	log.Printf("🚀 Web server starting on port %d", config.ServerPort)
	log.Printf("🔗 Visit: http://localhost:%d", config.ServerPort)

	if err := r.Run(addr); err != nil {
		log.Fatalf("❌ Server failed to start: %v", err)
	}
}
