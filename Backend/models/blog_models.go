package models

import "time"

type Blog struct {
	ID             string    `firestore:"id" json:"id"`
	EmbedID        string    `firestore:"embed_id" json:"embed_id"`
	Title          string    `firestore:"title" json:"title"`
	BlogContent    string    `firestore:"blog_content" json:"blog_content"`
	AuthorID       string    `firestore:"author_id" json:"author_id"`
	CreatedAt      time.Time `firestore:"created_at" json:"created_at"`
	UpdatedAt      time.Time `firestore:"updated_at" json:"updated_at"`
	Tags           []string  `firestore:"tags" json:"tags"`
	BlogImage      string    `firestore:"blog_image" json:"blog_image"`
	Category       string    `firestore:"category" json:"category"`
	AuthorName     string    `firestore:"-" json:"author_name"`
	AuthorUsername string    `firestore:"-" json:"author_username"`
	Views          int       `firestore:"views" json:"views"`
	Likes          int       `firestore:"likes" json:"likes"`
	LikedBy        []string  `firestore:"liked_by" json:"liked_by"`
	Comments       int       `firestore:"comments" json:"comments"`
	Featured       bool      `firestore:"featured" json:"featured"`
	Trending       bool      `firestore:"trending" json:"trending"`
}

var ValidCategories = []string{
	"Technology",
	"Travelling",
	"Food",
	"Education",
	"Sports",
	"Entertainment",
	"Fashion",
	"Lifestyle",
	"Art & Photography",
	"Health & Wellness",
	"Finance & Crypto",
	"Other",
}
