package db

import (
	"context"
	"errors"

	"github.com/prachin77/insight-hub/models"

	"cloud.google.com/go/firestore"
)

// FollowUser creates a follow relationship.
func FollowUser(ctx context.Context, followerID, followingID string) error {
	if FirestoreClient == nil {
		return errors.New("firestore client is not initialized")
	}

	// Update follower's following count and list
	_, err := FirestoreClient.Collection("users").Doc(followerID).Update(ctx, []firestore.Update{
		{Path: "Followings", Value: firestore.Increment(1)},
		{Path: "following_list", Value: firestore.ArrayUnion(followingID)},
	})
	if err != nil {
		return err
	}

	// Update following's followers count and list
	_, err = FirestoreClient.Collection("users").Doc(followingID).Update(ctx, []firestore.Update{
		{Path: "Followers", Value: firestore.Increment(1)},
		{Path: "followers_list", Value: firestore.ArrayUnion(followerID)},
	})
	return err
}

// UnfollowUser removes a follow relationship.
func UnfollowUser(ctx context.Context, followerID, followingID string) error {
	if FirestoreClient == nil {
		return errors.New("firestore client is not initialized")
	}

	// Update follower's following count and list
	_, err := FirestoreClient.Collection("users").Doc(followerID).Update(ctx, []firestore.Update{
		{Path: "Followings", Value: firestore.Increment(-1)},
		{Path: "following_list", Value: firestore.ArrayRemove(followingID)},
	})
	if err != nil {
		return err
	}

	// Update following's followers count and list
	_, err = FirestoreClient.Collection("users").Doc(followingID).Update(ctx, []firestore.Update{
		{Path: "Followers", Value: firestore.Increment(-1)},
		{Path: "followers_list", Value: firestore.ArrayRemove(followerID)},
	})
	return err
}

// GetFollowers returns the list of followers for a user.
func GetFollowers(ctx context.Context, userID string) ([]string, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection("users").Doc(userID).Get(ctx)
	if err != nil {
		return nil, err
	}

	data := doc.Data()
	if list, ok := data["followers_list"].([]interface{}); ok {
		followers := make([]string, len(list))
		for i, v := range list {
			followers[i] = v.(string)
		}
		return followers, nil
	}
	return []string{}, nil
}

// IsFollowing checks if a follower is following a user.
func IsFollowing(ctx context.Context, followerID, followingID string) (bool, error) {
	if FirestoreClient == nil {
		return false, errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection("users").Doc(followerID).Get(ctx)
	if err != nil {
		return false, err
	}

	data := doc.Data()
	if list, ok := data["following_list"].([]interface{}); ok {
		for _, v := range list {
			if v.(string) == followingID {
				return true, nil
			}
		}
	}
	return false, nil
}
// GetFollowing returns the list of users followed by a user.
func GetFollowing(ctx context.Context, userID string) ([]string, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection("users").Doc(userID).Get(ctx)
	if err != nil {
		return nil, err
	}

	data := doc.Data()
	if list, ok := data["following_list"].([]interface{}); ok {
		following := make([]string, len(list))
		for i, v := range list {
			following[i] = v.(string)
		}
		return following, nil
	}
	return []string{}, nil
}

// GetNetwork returns the full profiles of followers and followings for a user.
func GetNetwork(ctx context.Context, userID string) (*models.Followers, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection("users").Doc(userID).Get(ctx)
	if err != nil {
		return nil, err
	}

	data := doc.Data()
	var network models.Followers

	// Helper to fetch user profiles from IDs
	fetchProfiles := func(ids []interface{}) []models.FollowUser {
		var profiles []models.FollowUser
		for _, rawID := range ids {
			id := rawID.(string)
			userDoc, err := FirestoreClient.Collection("users").Doc(id).Get(ctx)
			if err == nil {
				var u models.User
				userDoc.DataTo(&u)
				profiles = append(profiles, models.FollowUser{
					FullName: u.FullName,
					Username: u.Username,
					Email:    u.Email,
				})
			}
		}
		return profiles
	}

	if list, ok := data["followers_list"].([]interface{}); ok {
		network.FollowersList = fetchProfiles(list)
	}
	if list, ok := data["following_list"].([]interface{}); ok {
		network.FollowingList = fetchProfiles(list)
	}

	return &network, nil
}
