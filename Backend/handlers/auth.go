package handlers

import (
	"net/http"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/prachin77/insight-hub/db"
	"github.com/prachin77/insight-hub/models"
	"github.com/prachin77/insight-hub/utils"
)

func Register(c *gin.Context) {
	var req models.User
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Backend validation: username length and password strength
	if len(req.Username) < 3 || len(req.Username) > 20 {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("username must be between 3 and 20 characters", nil))
		return
	}
	if !isStrongPassword(req.Password) {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("password must be at least 8 characters and include one uppercase letter and one special character", nil))
		return
	}

	userID, err := db.CreateUser(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Set auth cookie valid for 10 minutes using Document ID
	cookie := utils.NewAuthCookie(userID)
	http.SetCookie(c.Writer, &cookie)

	c.JSON(http.StatusOK, models.NewSuccessResponse("registration successful", gin.H{
		"id":       userID,
		"fullName": req.FullName,
		"email":    req.Email,
		"username": req.Username,
	}))
}

func Login(c *gin.Context) {
	var req models.User
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse(err.Error(), nil))
		return
	}

	userID, err := db.ValidateUser(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Fetch full user details after successful login
	user, err := db.GetUserByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.NewErrorResponse("failed to fetch user details", nil))
		return
	}

	// Set auth cookie
	cookie := utils.NewAuthCookie(userID)
	http.SetCookie(c.Writer, &cookie)

	c.JSON(http.StatusOK, models.NewSuccessResponse("login successful", gin.H{
		"id":         userID,
		"email":      user.Email,
		"username":   user.Username,
		"fullName":   user.FullName,
		"noOfBlogs":  user.NoOfBlogs,
		"followers":  user.Followers,
		"followings": user.Followings,
	}))
}

func GetUser(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("username is required", nil))
		return
	}

	user, err := db.GetUserByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusNotFound, models.NewErrorResponse(err.Error(), nil))
		return
	}

	c.JSON(http.StatusOK, models.NewSuccessResponse("user fetched successfully", user))
}

func GetUserByIDHandler(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, models.NewErrorResponse("id is required", nil))
		return
	}

	user, err := db.GetUserByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.NewErrorResponse(err.Error(), nil))
		return
	}

	// Also set the ID field so frontend can use it
	user.ID = id
	c.JSON(http.StatusOK, models.NewSuccessResponse("user fetched successfully", user))
}

func Logout(c *gin.Context) {
	// Clear auth cookie by setting it with immediate expiration
	cookie := utils.NewAuthCookie("")
	cookie.MaxAge = -1
	cookie.Expires = time.Now().Add(-1 * time.Hour)
	http.SetCookie(c.Writer, &cookie)

	c.JSON(http.StatusOK, models.NewSuccessResponse("logout successful", nil))
}

func isStrongPassword(pw string) bool {
	if len(pw) < 8 {
		return false
	}
	var hasUpper, hasSpecial bool
	for _, ch := range pw {
		switch {
		case unicode.IsUpper(ch):
			hasUpper = true
		case unicode.IsPunct(ch) || unicode.IsSymbol(ch):
			hasSpecial = true
		}
	}
	return hasUpper && hasSpecial
}
