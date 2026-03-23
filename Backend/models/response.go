package models

// APIResponse defines a standard structure for all API responses.
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// NewSuccessResponse creates a successful APIResponse with an optional data payload.
func NewSuccessResponse(message string, data interface{}) APIResponse {
	return APIResponse{
		Success: true,
		Message: message,
		Data:    data,
	}
}

// NewErrorResponse creates an error APIResponse with an optional data payload.
func NewErrorResponse(message string, data interface{}) APIResponse {
	return APIResponse{
		Success: false,
		Message: message,
		Data:    data,
	}
}
