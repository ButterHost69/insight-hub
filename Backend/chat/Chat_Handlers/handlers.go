package chat_handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/models"
	"github.com/prachin77/insight-hub/proto/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for development
	},
}

var client pb.MessagingServiceClient

// wsHub stores active WebSocket connections by userID for broadcasting control events.
var wsHub = struct {
	sync.RWMutex
	conns map[string]*websocket.Conn
}{conns: make(map[string]*websocket.Conn)}

// WSEvent represents a control event sent over WebSocket (delete, edit, new message).
type WSEvent struct {
	Type       string `json:"type"`                  // "message", "delete", "edit"
	MessageID  string `json:"message_id,omitempty"`
	SenderID   string `json:"sender_id,omitempty"`
	ReceiverID string `json:"receiver_id,omitempty"`
	Content    string `json:"content,omitempty"`
	Timestamp  string `json:"timestamp,omitempty"`
	ID         string `json:"id,omitempty"`
}

// broadcastEvent sends a control event to a specific user if they're connected.
func broadcastEvent(userID string, event WSEvent) {
	wsHub.RLock()
	ws, ok := wsHub.conns[userID]
	wsHub.RUnlock()
	if !ok || ws == nil {
		return
	}
	data, _ := json.Marshal(event)
	if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("❌ Failed to broadcast event to %s: %v", userID, err)
	}
}

// InitClient initializes the gRPC client connection.
func InitClient(serverAddr string) {
	conn, err := grpc.Dial(serverAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	client = pb.NewMessagingServiceClient(conn)
	log.Printf("✅ gRPC Messaging Client initialized (connected to %s)", serverAddr)
}

// GetChatSidebar fetches the list of followed users and their chat metadata.
func GetChatSidebar(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("user_id is required", nil))
		return
	}

	// 1. Get Following list
	followingIDs, err := db.GetFollowing(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// 2. Fetch conversations to get unread counts/last messages
	convos, err := db.GetUserConversations(c.Request.Context(), userID)
	if err != nil {
		log.Printf("⚠️ Failed to fetch conversations for user %s: %v", userID, err)
	}
	convoMap := make(map[string]models.Conversation)
	for _, conv := range convos {
		// Find the other participant
		otherID := ""
		for _, p := range conv.ParticipantIDs {
			if p != userID {
				otherID = p
				break
			}
		}
		if otherID != "" {
			convoMap[otherID] = conv
		}
	}

	// 3. Build sidebar items
	type SidebarItem struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		LastMessage string `json:"lastMessage"`
		Time        string `json:"time"`
		Unread      int    `json:"unread"`
		Online      bool   `json:"online"`
	}

	var sidebar []SidebarItem
	for _, id := range followingIDs {
		user, err := db.GetUserByID(c.Request.Context(), id)
		if err != nil {
			continue
		}

		// Check online status via gRPC
		status, _ := client.GetOnlineStatus(c.Request.Context(), &pb.GetOnlineStatusRequest{UserId: id})

		item := SidebarItem{
			ID:   id,
			Name: user.Username,
		}

		if convo, ok := convoMap[id]; ok {
			item.LastMessage = convo.LastMessage
			item.Time = convo.LastMessageTime.Format("3:04 PM")
			item.Unread = convo.UnreadCounts[userID]
		}

		if status != nil {
			item.Online = status.IsOnline
		}

		sidebar = append(sidebar, item)
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("sidebar fetched", sidebar))
}

// ReadMessages marks a conversation as read.
func ReadMessages(c *gin.Context) {
	var req struct {
		UserID  string `json:"user_id"`
		OtherID string `json:"other_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	convoID := db.GenerateConversationID(req.UserID, req.OtherID)
	if err := db.MarkAsRead(c.Request.Context(), convoID, req.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("messages marked as read", nil))
}

// SendMessage sends a message via gRPC.
func SendMessage(c *gin.Context) {
	var req struct {
		SenderID   string `json:"sender_id"`
		ReceiverID string `json:"receiver_id"`
		Content    string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	resp, err := client.SendMessage(c.Request.Context(), &pb.SendMessageRequest{
		SenderId:   req.SenderID,
		ReceiverId: req.ReceiverID,
		Content:    req.Content,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("message sent", resp.Data))
}

// GetMessages fetches message history via gRPC.
func GetMessages(c *gin.Context) {
	u1 := c.Query("user_id_1")
	u2 := c.Query("user_id_2")

	// Mark as read in DB first
	convoID := db.GenerateConversationID(u1, u2)
	db.MarkAsRead(c.Request.Context(), convoID, u1)

	resp, err := client.GetMessages(c.Request.Context(), &pb.GetMessagesRequest{
		UserId_1: u1,
		UserId_2: u2,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("messages fetched", resp.Messages))
}

// DeleteMessage deletes a message (only by the sender).
func DeleteMessage(c *gin.Context) {
	var req struct {
		MessageID  string `json:"message_id"`
		SenderID   string `json:"sender_id"`
		ReceiverID string `json:"receiver_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	if err := db.DeleteMessage(c.Request.Context(), req.MessageID, req.SenderID); err != nil {
		c.JSON(http.StatusForbidden, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Fetch the message to know the receiver (before it was deleted we stored sender)
	// We need to broadcast to the other user. Since the message is deleted,
	// we know the sender is req.SenderID, so broadcast to all conversations.
	broadcastEvent(req.ReceiverID, WSEvent{Type: "delete", MessageID: req.MessageID, SenderID: req.SenderID})

	c.JSON(http.StatusOK, models.NewSuccessResponse("message deleted", nil))
}

// EditMessage edits a message (only by the sender).
func EditMessage(c *gin.Context) {
	var req struct {
		MessageID  string `json:"message_id"`
		SenderID   string `json:"sender_id"`
		ReceiverID string `json:"receiver_id"`
		NewContent string `json:"new_content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	if err := db.EditMessage(c.Request.Context(), req.MessageID, req.SenderID, req.NewContent); err != nil {
		c.JSON(http.StatusForbidden, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Broadcast edit event to the receiver
	broadcastEvent(req.ReceiverID, WSEvent{Type: "edit", MessageID: req.MessageID, SenderID: req.SenderID, Content: req.NewContent})

	c.JSON(http.StatusOK, models.NewSuccessResponse("message edited", nil))
}

// StreamMessagesWS bridges gRPC stream to WebSocket for the browser.
func StreamMessagesWS(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("user_id required", nil))
		return
	}

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("❌ Failed to upgrade websocket for user %s: %v", userID, err)
		return
	}
	defer ws.Close()

	stream, err := client.StreamMessages(c.Request.Context(), &pb.StreamMessagesRequest{UserId: userID})
	if err != nil {
		log.Printf("❌ Failed to open gRPC stream for user %s: %v", userID, err)
		return
	}

	log.Printf("🔌 WebSocket connection established for user: %s", userID)

	// Register in WebSocket hub
	wsHub.Lock()
	wsHub.conns[userID] = ws
	wsHub.Unlock()
	defer func() {
		wsHub.Lock()
		delete(wsHub.conns, userID)
		wsHub.Unlock()
	}()

	// Channel to signal closure
	done := make(chan struct{})

	// Read loop to detect client disconnection
	go func() {
		defer close(done)
		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				log.Printf("🔌 WebSocket closed by client %s: %v", userID, err)
				return
			}
		}
	}()

	// Send loop: gRPC -> WebSocket
	for {
		select {
		case <-done:
			return
		case <-c.Request.Context().Done():
			return
		default:
			msg, err := stream.Recv()
			if err != nil {
				log.Printf("❌ gRPC stream error for user %s: %v", userID, err)
				return
			}
			if err := ws.WriteJSON(msg); err != nil {
				log.Printf("❌ WebSocket write error for user %s: %v", userID, err)
				return
			}
		}
	}
}
