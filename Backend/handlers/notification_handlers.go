package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/models"
)

func ToggleFollow(c *gin.Context) {
	var req struct {
		FollowerID  string `json:"follower_id"`
		FollowingID string `json:"following_id"`
		Action      string `json:"action"` // "follow" or "unfollow"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	isFollowing, _ := db.IsFollowing(c.Request.Context(), req.FollowerID, req.FollowingID)

	if req.Action == "follow" {
		if isFollowing {
			c.JSON(http.StatusOK, models.NewSuccessResponse("already following", nil))
			return
		}

		if err := db.FollowUser(c.Request.Context(), req.FollowerID, req.FollowingID); err != nil {
			c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
			return
		}

		// Create notification
		follower, _ := db.GetUserByID(c.Request.Context(), req.FollowerID)
		if follower != nil {
			db.CreateNotification(c.Request.Context(), &models.Notification{
				Recipient: req.FollowingID,
				Sender:    follower.Username,
				Type:      models.NotificationTypeFollow,
				Message:   follower.Username + " started following you",
			})
		}

		c.JSON(http.StatusOK, models.NewSuccessResponse("followed successfully", nil))
	} else {
		if !isFollowing {
			c.JSON(http.StatusOK, models.NewSuccessResponse("not following", nil))
			return
		}

		if err := db.UnfollowUser(c.Request.Context(), req.FollowerID, req.FollowingID); err != nil {
			c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
			return
		}
		c.JSON(http.StatusOK, models.NewSuccessResponse("unfollowed successfully", nil))
	}
}

func GetNotifications(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("user_id is required", nil))
		return
	}

	notifications, err := db.GetNotifications(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("notifications fetched successfully", notifications))
}

func MarkNotificationRead(c *gin.Context) {
	id := c.Param("id")
	if err := db.MarkNotificationRead(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}
	c.JSON(http.StatusOK, models.NewSuccessResponse("notification marked as read", nil))
}

func MarkAllNotificationsRead(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("user_id is required", nil))
		return
	}

	if err := db.MarkAllNotificationsRead(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}
	c.JSON(http.StatusOK, models.NewSuccessResponse("all notifications marked as read", nil))
}

func GetUnreadCount(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("user_id is required", nil))
		return
	}

	count, err := db.GetUnreadCount(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}
	c.JSON(http.StatusOK, models.NewSuccessResponse("unread count fetched successfully", gin.H{"count": count}))
}

func CheckFollow(c *gin.Context) {
	followerID := c.Query("follower_id")
	followingID := c.Query("following_id")

	if followerID == "" || followingID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("follower_id and following_id are required", nil))
		return
	}

	isFollowing, err := db.IsFollowing(c.Request.Context(), followerID, followingID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("follow status checked", gin.H{"is_following": isFollowing}))
}

func GetUserNetwork(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("user_id is required", nil))
		return
	}

	network, err := db.GetNetwork(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("network fetched successfully", network))
}
