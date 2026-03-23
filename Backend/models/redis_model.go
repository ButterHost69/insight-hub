package models

type RedisRequest struct {
	ID          string `json:"id"`
	PayloadType string `json:"payload_type"` // 1: RAG ; 10: Embedding
	Payload     string `json:"payload"`
}

type RedisResponse struct {
	ID     string `json:"id"`
	Result string `json:"result"`
	Error  string `json:"error"`
}
