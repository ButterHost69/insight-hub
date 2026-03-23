package db

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"time"

	"cloud.google.com/go/firestore"
	firestorepb "cloud.google.com/go/firestore/apiv1/firestorepb"
	"github.com/google/uuid"
	"github.com/prachin77/insight-hub/models"
	"google.golang.org/api/iterator"
)

const blogsCollection = "blogs"

// CreateBlog stores a new blog post in Firestore and returns the document ID.
func CreateBlog(ctx context.Context, blog *models.Blog) (string, error) {
	if FirestoreClient == nil {
		return "", errors.New("firestore client is not initialized")
	}

	blog.CreatedAt = time.Now()
	blog.UpdatedAt = time.Now()
	blog.Likes = 0
	blog.Comments = 0
	blog.Views = 0
	blog.EmbedID = uuid.NewString()

	docRef := FirestoreClient.Collection(blogsCollection).NewDoc()
	blog.ID = docRef.ID

	_, err := docRef.Set(ctx, blog)
	if err != nil {
		return "", err
	}

	// Increment user's blog count
	if blog.AuthorID != "" {
		_, err = FirestoreClient.Collection("users").Doc(blog.AuthorID).Update(ctx, []firestore.Update{
			{Path: "NoOfBlogs", Value: firestore.Increment(1)},
		})
		if err != nil {
			// Log error but don't fail blog creation if increment fails
			// Optional: you might want to return this error instead
		}
	}

	go func() {
		log.Printf("[CreateBlog] Sending Blog %s to embedding pipeline (embed_id: %s)\n", blog.ID, blog.EmbedID)
		SendRedisRequest(models.RedisRequest{
			ID:          blog.EmbedID,
			PayloadType: "Embedding",
			Payload:     blog.BlogContent,
		})
	}()

	return docRef.ID, nil
}

// GetBlogID retrieves the document ID for a given title.
func GetBlogID(ctx context.Context, title string) (string, error) {
	if FirestoreClient == nil {
		return "", errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection(blogsCollection).Where("title", "==", title).Limit(1).Documents(ctx).Next()
	if err != nil {
		return "", errors.New("blog not found")
	}

	return doc.Ref.ID, nil
}

// GetAllBlogs fetches all blogs from Firestore.
func GetAllBlogs(ctx context.Context) ([]models.Blog, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client is not initialized")
	}

	var blogs []models.Blog
	iter := FirestoreClient.Collection(blogsCollection).OrderBy("created_at", firestore.Desc).Documents(ctx)
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var b models.Blog
		if err := doc.DataTo(&b); err != nil {
			continue
		}
		b.ID = doc.Ref.ID

		// Fetch author details
		userDoc, err := FirestoreClient.Collection("users").Doc(b.AuthorID).Get(ctx)
		if err == nil {
			var u models.User
			if err := userDoc.DataTo(&u); err == nil {
				b.AuthorName = u.FullName
				b.AuthorUsername = u.Username
			}
		} else {
			b.AuthorName = "Unknown Author"
			b.AuthorUsername = "unknown"
		}

		blogs = append(blogs, b)
	}
	return blogs, nil
}

// GetBlogCount returns the total number of blogs in Firestore without fetching all documents.
func GetBlogCount(ctx context.Context) (int64, error) {
	if FirestoreClient == nil {
		return 0, errors.New("firestore client is not initialized")
	}

	results, err := FirestoreClient.Collection(blogsCollection).
		NewAggregationQuery().
		WithCount("count").
		Get(ctx)
	if err != nil {
		return 0, err
	}

	countVal, ok := results["count"]
	if !ok {
		return 0, errors.New("count result not found")
	}

	// Firestore returns *firestorepb.Value — unwrap it
	pbVal, ok := countVal.(*firestorepb.Value)
	if !ok {
		return 0, fmt.Errorf("unexpected count type: %T", countVal)
	}

	intVal, ok := pbVal.ValueType.(*firestorepb.Value_IntegerValue)
	if !ok {
		return 0, fmt.Errorf("count value is not an integer, got %T", pbVal.ValueType)
	}

	return intVal.IntegerValue, nil
}

// TitleExists checks if a blog with the same title already exists.
func TitleExists(ctx context.Context, title string) (bool, error) {
	if FirestoreClient == nil {
		return false, errors.New("firestore client is not initialized")
	}

	iter := FirestoreClient.Collection(blogsCollection).Where("title", "==", title).Limit(1).Documents(ctx)
	_, err := iter.Next()
	if err != nil {
		return false, nil
	}
	return true, nil
}

// IncrementViews increases the view count for a blog with the given title.
func IncrementViews(ctx context.Context, title string) error {
	if FirestoreClient == nil {
		return errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection(blogsCollection).Where("title", "==", title).Limit(1).Documents(ctx).Next()
	if err != nil {
		return errors.New("blog not found")
	}

	_, err = doc.Ref.Update(ctx, []firestore.Update{
		{Path: "views", Value: firestore.Increment(1)},
	})
	return err
}

// ToggleLike toggles the like status for a blog and increments/decrements the count.
func ToggleLike(ctx context.Context, username, title string) (bool, error) {
	if FirestoreClient == nil {
		return false, errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection(blogsCollection).Where("title", "==", title).Limit(1).Documents(ctx).Next()
	if err != nil {
		return false, errors.New("blog not found")
	}

	var b models.Blog
	if err := doc.DataTo(&b); err != nil {
		return false, err
	}

	alreadyLiked := false
	for _, u := range b.LikedBy {
		if u == username {
			alreadyLiked = true
			break
		}
	}

	var updates []firestore.Update
	if alreadyLiked {
		updates = []firestore.Update{
			{Path: "liked_by", Value: firestore.ArrayRemove(username)},
			{Path: "likes", Value: firestore.Increment(-1)},
		}
	} else {
		updates = []firestore.Update{
			{Path: "liked_by", Value: firestore.ArrayUnion(username)},
			{Path: "likes", Value: firestore.Increment(1)},
		}
	}

	_, err = doc.Ref.Update(ctx, updates)
	return !alreadyLiked, err
}

// AddComment stores a new comment in Firestore.
func AddComment(ctx context.Context, comment *models.Comment) error {
	if FirestoreClient == nil {
		return errors.New("firestore client is not initialized")
	}

	comment.CreatedAt = time.Now()
	docRef := FirestoreClient.Collection("comments").NewDoc()
	comment.CommentID = docRef.ID

	_, err := docRef.Set(ctx, comment)
	if err != nil {
		return err
	}

	// Increment comment count in blog
	doc, err := FirestoreClient.Collection(blogsCollection).Doc(comment.BlogID).Get(ctx)
	if err == nil {
		_, _ = doc.Ref.Update(ctx, []firestore.Update{
			{Path: "comments", Value: firestore.Increment(1)},
		})
	}

	return nil
}

// GetComments fetches all comments for a specific blog.
func GetComments(ctx context.Context, blogID string) ([]models.Comment, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client is not initialized")
	}

	var comments []models.Comment
	iter := FirestoreClient.Collection("comments").Where("blog_id", "==", blogID).Documents(ctx)
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var c models.Comment
		if err := doc.DataTo(&c); err != nil {
			continue
		}
		c.CommentID = doc.Ref.ID
		comments = append(comments, c)
	}

	// Sort comments by CreatedAt descending in memory
	sort.Slice(comments, func(i, j int) bool {
		return comments[i].CreatedAt.After(comments[j].CreatedAt)
	})

	return comments, nil
}

// UpdateBlog updates an existing blog post.
func UpdateBlog(ctx context.Context, blog *models.Blog) error {
	if FirestoreClient == nil {
		return errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection(blogsCollection).Where("title", "==", blog.Title).Limit(1).Documents(ctx).Next()
	if err != nil {
		return errors.New("blog not found")
	}

	_, err = doc.Ref.Update(ctx, []firestore.Update{
		{Path: "blog_content", Value: blog.BlogContent},
		{Path: "updated_at", Value: time.Now()},
		{Path: "category", Value: blog.Category},
		{Path: "tags", Value: blog.Tags},
		{Path: "blog_image", Value: blog.BlogImage},
	})
	return err
}

// GetBlogsByEmbedIDs fetches blogs by a list of embed_ids.
func GetBlogsByEmbedIDs(ctx context.Context, embedIDs []string) ([]models.Blog, error) {
	if FirestoreClient == nil {
		return nil, errors.New("firestore client is not initialized")
	}

	if len(embedIDs) == 0 {
		return nil, nil
	}

	var blogs []models.Blog
	for _, embedID := range embedIDs {
		iter := FirestoreClient.Collection(blogsCollection).Where("embed_id", "==", embedID).Limit(1).Documents(ctx)
		doc, err := iter.Next()
		if err != nil {
			continue
		}
		var b models.Blog
		if err := doc.DataTo(&b); err != nil {
			continue
		}
		b.ID = doc.Ref.ID

		userDoc, err := FirestoreClient.Collection("users").Doc(b.AuthorID).Get(ctx)
		if err == nil {
			var u models.User
			if err := userDoc.DataTo(&u); err == nil {
				b.AuthorName = u.FullName
				b.AuthorUsername = u.Username
			}
		} else {
			b.AuthorName = "Unknown Author"
			b.AuthorUsername = "unknown"
		}

		blogs = append(blogs, b)
	}

	return blogs, nil
}

// DeleteBlog deletes a blog post and its comments, and decrements the author's blog count.
func DeleteBlog(ctx context.Context, title string) error {
	if FirestoreClient == nil {
		return errors.New("firestore client is not initialized")
	}

	doc, err := FirestoreClient.Collection(blogsCollection).Where("title", "==", title).Limit(1).Documents(ctx).Next()
	if err != nil {
		return errors.New("blog not found")
	}

	var b models.Blog
	if err := doc.DataTo(&b); err != nil {
		return err
	}

	// Delete comments
	comments, _ := GetComments(ctx, doc.Ref.ID)
	for _, c := range comments {
		_, _ = FirestoreClient.Collection("comments").Doc(c.CommentID).Delete(ctx)
	}

	// Delete blog
	_, err = doc.Ref.Delete(ctx)
	if err != nil {
		return err
	}

	// Decrement author blog count
	if b.AuthorID != "" {
		_, _ = FirestoreClient.Collection("users").Doc(b.AuthorID).Update(ctx, []firestore.Update{
			{Path: "NoOfBlogs", Value: firestore.Increment(-1)},
		})
	}

	return nil
}
