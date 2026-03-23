package db

import (
	"context"
)

func GetQdrantDocCount(ctx context.Context) (uint64, error) {
	collInfo, err := QdrantClient.GetCollectionInfo(ctx, QdrantCollection)
	if err != nil {
		return 0, err
	}
	return collInfo.GetPointsCount(), nil
}
