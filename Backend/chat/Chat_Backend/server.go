package chat_backend

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/models"
	"github.com/prachin77/insight-hub/proto/pb"
	"google.golang.org/grpc"
)

type server struct {
	pb.UnimplementedMessagingServiceServer
	clients sync.Map // Map[UserID]chan *pb.Message
}

func (s *server) SendMessage(ctx context.Context, req *pb.SendMessageRequest) (*pb.SendMessageResponse, error) {
	msgID := uuid.New().String()
	timestamp := time.Now()

	msg := &models.Message{
		ID:         msgID,
		SenderID:   req.SenderId,
		ReceiverID: req.ReceiverId,
		Content:    req.Content,
		Timestamp:  timestamp,
		IsRead:     false,
	}

	// 1. Save to DB
	if err := db.SaveMessage(ctx, msg); err != nil {
		return &pb.SendMessageResponse{Success: false, Message: err.Error()}, nil
	}

	// 2. Update Conversation metadata
	convoID := db.GenerateConversationID(req.SenderId, req.ReceiverId)
	convo, err := db.GetConversation(ctx, convoID)
	if err != nil {
		// Create new conversation if doesn't exist
		convo = &models.Conversation{
			ID:             convoID,
			ParticipantIDs: []string{req.SenderId, req.ReceiverId},
			UnreadCounts:   make(map[string]int),
			CreatedAt:      timestamp,
		}
	}
	convo.LastMessage = req.Content
	convo.LastMessageTime = timestamp
	// 3. Broadcast to receiver if online
	pbMsg := &pb.Message{
		Id:         msgID,
		SenderId:   req.SenderId,
		ReceiverId: req.ReceiverId,
		Content:    req.Content,
		Timestamp:  timestamp.Format(time.RFC3339),
	}

	if val, ok := s.clients.Load(req.ReceiverId); ok {
		log.Printf("Receiver %s is online, broadcasting message", req.ReceiverId)
		ch := val.(chan *pb.Message)
		// Non-blocking send
		select {
		case ch <- pbMsg:
		default:
			log.Printf("Warning: Dropping message for %s (channel full)", req.ReceiverId)
		}
	}

	// ALWAYS increment unread count for receiver, because being online
	// doesn't mean they are looking at this specific conversation.
	convo.UnreadCounts[req.ReceiverId]++

	db.UpdateConversation(ctx, convo)

	return &pb.SendMessageResponse{
		Success: true,
		Message: "Message sent",
		Data:    pbMsg,
	}, nil
}

func (s *server) StreamMessages(req *pb.StreamMessagesRequest, stream pb.MessagingService_StreamMessagesServer) error {
	msgChan := make(chan *pb.Message, 100)
	s.clients.Store(req.UserId, msgChan)
	defer s.clients.Delete(req.UserId)

	log.Printf("User %s connected to message stream", req.UserId)

	// Update online status in DB (Optional if we rely purely on map)
	db.UpdateLastSeen(context.Background(), req.UserId)

	for {
		select {
		case msg := <-msgChan:
			if err := stream.Send(msg); err != nil {
				return err
			}
		case <-stream.Context().Done():
			log.Printf("User %s disconnected from message stream", req.UserId)
			// Update LastSeen in DB when they disconnect
			db.UpdateLastSeen(context.Background(), req.UserId)
			return nil
		}
	}
}

func (s *server) GetMessages(ctx context.Context, req *pb.GetMessagesRequest) (*pb.GetMessagesResponse, error) {
	msgs, err := db.GetMessagesBetweenUsers(ctx, req.UserId_1, req.UserId_2, 100)
	if err != nil {
		return nil, err
	}

	var pbMsgs []*pb.Message
	for _, m := range msgs {
		pbMsgs = append(pbMsgs, &pb.Message{
			Id:         m.ID,
			SenderId:   m.SenderID,
			ReceiverId: m.ReceiverID,
			Content:    m.Content,
			Timestamp:  m.Timestamp.Format(time.RFC3339),
		})
	}

	return &pb.GetMessagesResponse{Messages: pbMsgs}, nil
}

func (s *server) GetOnlineStatus(ctx context.Context, req *pb.GetOnlineStatusRequest) (*pb.GetOnlineStatusResponse, error) {
	_, isOnline := s.clients.Load(req.UserId)
	log.Printf("Checking online status for %s: %v (active clients: %v)", req.UserId, isOnline, s.countClients())
	
	// Fetch LastSeen if offline
	lastSeenStr := "Offline"
	if !isOnline {
		user, err := db.GetUserByID(ctx, req.UserId)
		if err == nil && !user.LastSeen.IsZero() {
			lastSeenStr = user.LastSeen.Format(time.RFC3339)
		}
	}

	return &pb.GetOnlineStatusResponse{
		IsOnline: isOnline,
		LastSeen: lastSeenStr,
	}, nil
}

func (s *server) countClients() int {
	count := 0
	s.clients.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

func StartServer(port int) {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	s := grpc.NewServer()
	pb.RegisterMessagingServiceServer(s, &server{})
	log.Printf("🚀 gRPC Messaging Server starting on %v", lis.Addr())
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
