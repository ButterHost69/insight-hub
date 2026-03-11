package models

import "time"

// Message represents a single chat message between two users.
type Message struct {
	ID         string    `firestore:"id" json:"id"`
	SenderID   string    `firestore:"sender_id" json:"sender_id"`
	ReceiverID string    `firestore:"receiver_id" json:"receiver_id"`
	Content    string    `firestore:"content" json:"content"`
	Timestamp  time.Time `firestore:"timestamp" json:"timestamp"`
	IsRead     bool      `firestore:"is_read" json:"is_read"`
	IsEdited   bool      `firestore:"is_edited" json:"is_edited"`
}

// Conversation represents a chat thread between two users.
type Conversation struct {
	ID              string         `firestore:"id" json:"id"`
	ParticipantIDs  []string       `firestore:"participant_ids" json:"participant_ids"` // Exactly 2 IDs
	LastMessage     string         `firestore:"last_message" json:"last_message"`
	LastMessageTime time.Time      `firestore:"last_message_time" json:"last_message_time"`
	LastSenderID    string         `firestore:"last_sender_id" json:"last_sender_id"`
	UnreadCounts    map[string]int `firestore:"unread_counts" json:"unread_counts"` // Map of UserID -> Count
	CreatedAt       time.Time      `firestore:"created_at" json:"created_at"`
}
