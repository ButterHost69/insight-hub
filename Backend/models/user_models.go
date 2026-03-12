package models

import "time"

type User struct {
	ID         string    `firestore:"id,omitempty" json:"id"`
	FullName   string    `firestore:"FullName" json:"fullName"`
	Username   string    `firestore:"Username" json:"username"`
	Email        string    `firestore:"Email" json:"email" binding:"required,email"`
	Password     string    `firestore:"Password" json:"password,omitempty"`
	AuthProvider string    `firestore:"AuthProvider" json:"auth_provider"`
	ProviderID   string    `firestore:"ProviderID" json:"provider_id"`
	CreatedAt    time.Time `firestore:"CreatedAt" json:"created_at"`
	NoOfBlogs    int       `firestore:"NoOfBlogs" json:"no_of_blogs"`
	Followers    int       `firestore:"Followers" json:"followers"`
	Followings   int       `firestore:"Followings" json:"followings"`
	LastSeen     time.Time `firestore:"LastSeen" json:"last_seen"`
}

type FollowUser struct {
	FullName string `json:"fullName"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

type Followers struct {
	FollowersList []FollowUser `json:"followers_list"`
	FollowingList []FollowUser `json:"following_list"`
}
