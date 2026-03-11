package db

import (
	"context"
	"errors"
	"sort"

	"cloud.google.com/go/firestore"
	"github.com/prachin77/insight-hub/models"
	"google.golang.org/api/iterator"
)

// SaveMessage stores a new message in Firestore.
func SaveMessage(ctx context.Context, msg *models.Message) error {
	if FirestoreClient == nil {
		return errors.New("firestore client not initialized")
	}

	_, err := FirestoreClient.Collection("messages").Doc(msg.ID).Set(ctx, msg)
	return err
}

// GetMessagesBetweenUsers fetches message history between two participants.
func GetMessagesBetweenUsers(ctx context.Context, user1, user2 string, limit int) ([]models.Message, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client not initialized")
	}

	// Firestore doesn't support "in" on two different fields in one query.
	// Run two queries: (sender=user1,receiver=user2) and (sender=user2,receiver=user1), then merge.
	var allMessages []models.Message

	// Query 1: user1 -> user2
	iter1 := FirestoreClient.Collection("messages").
		Where("sender_id", "==", user1).
		Where("receiver_id", "==", user2).
		Documents(ctx)
	for {
		doc, err := iter1.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var msg models.Message
		doc.DataTo(&msg)
		allMessages = append(allMessages, msg)
	}

	// Query 2: user2 -> user1
	iter2 := FirestoreClient.Collection("messages").
		Where("sender_id", "==", user2).
		Where("receiver_id", "==", user1).
		Documents(ctx)
	for {
		doc, err := iter2.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var msg models.Message
		doc.DataTo(&msg)
		allMessages = append(allMessages, msg)
	}

	// Sort by timestamp ascending (chronological)
	sort.Slice(allMessages, func(i, j int) bool {
		return allMessages[i].Timestamp.Before(allMessages[j].Timestamp)
	})

	// Apply limit (return only last N messages)
	if len(allMessages) > limit {
		allMessages = allMessages[len(allMessages)-limit:]
	}

	return allMessages, nil
}

// UpdateConversation updates the conversation metadata (last message, unread counts).
func UpdateConversation(ctx context.Context, convo *models.Conversation) error {
	if FirestoreClient == nil {
		return errors.New("firestore client not initialized")
	}

	_, err := FirestoreClient.Collection("conversations").Doc(convo.ID).Set(ctx, convo)
	return err
}

// GetConversation fetches a single conversation by ID.
func GetConversation(ctx context.Context, convoID string) (*models.Conversation, error) {
	doc, err := FirestoreClient.Collection("conversations").Doc(convoID).Get(ctx)
	if err != nil {
		return nil, err
	}
	var convo models.Conversation
	doc.DataTo(&convo)
	return &convo, nil
}

// GetUserConversations fetches all conversations for a specific user.
func GetUserConversations(ctx context.Context, userID string) ([]models.Conversation, error) {
	iter := FirestoreClient.Collection("conversations").
		Where("participant_ids", "array-contains", userID).
		OrderBy("last_message_time", firestore.Desc).
		Documents(ctx)

	var convos []models.Conversation
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var convo models.Conversation
		doc.DataTo(&convo)
		convos = append(convos, convo)
	}
	return convos, nil
}

// GenerateConversationID creates a stable unique ID for a pair of users.
func GenerateConversationID(u1, u2 string) string {
	users := []string{u1, u2}
	sort.Strings(users)
	return users[0] + "_" + users[1]
}

// MarkAsRead clears unread count for a user in a conversation.
func MarkAsRead(ctx context.Context, convoID, userID string) error {
	_, err := FirestoreClient.Collection("conversations").Doc(convoID).Update(ctx, []firestore.Update{
		{Path: "unread_counts." + userID, Value: 0},
	})
	return err
}

// GetMessage fetches a single message by ID.
func GetMessage(ctx context.Context, messageID string) (*models.Message, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client not initialized")
	}
	doc, err := FirestoreClient.Collection("messages").Doc(messageID).Get(ctx)
	if err != nil {
		return nil, errors.New("message not found")
	}
	var msg models.Message
	doc.DataTo(&msg)
	return &msg, nil
}

// DeleteMessage removes a message if the requester is the sender.
func DeleteMessage(ctx context.Context, messageID, senderID string) error {
	if FirestoreClient == nil {
		return errors.New("firestore client not initialized")
	}
	// Verify ownership
	msg, err := GetMessage(ctx, messageID)
	if err != nil {
		return err
	}
	if msg.SenderID != senderID {
		return errors.New("you can only delete your own messages")
	}
	_, err = FirestoreClient.Collection("messages").Doc(messageID).Delete(ctx)
	return err
}

// EditMessage updates the content of a message if the requester is the sender.
func EditMessage(ctx context.Context, messageID, senderID, newContent string) error {
	if FirestoreClient == nil {
		return errors.New("firestore client not initialized")
	}
	// Verify ownership
	msg, err := GetMessage(ctx, messageID)
	if err != nil {
		return err
	}
	if msg.SenderID != senderID {
		return errors.New("you can only edit your own messages")
	}
	_, err = FirestoreClient.Collection("messages").Doc(messageID).Update(ctx, []firestore.Update{
		{Path: "content", Value: newContent},
		{Path: "is_edited", Value: true},
	})
	return err
}
