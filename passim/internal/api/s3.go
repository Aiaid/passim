package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/passim/passim/internal/db"
)

type createS3Request struct {
	Name      string `json:"name" binding:"required"`
	Endpoint  string `json:"endpoint" binding:"required"`
	Bucket    string `json:"bucket" binding:"required"`
	AccessKey string `json:"access_key" binding:"required"`
	SecretKey string `json:"secret_key" binding:"required"`
}

type updateS3Request struct {
	Name      string `json:"name"`
	Endpoint  string `json:"endpoint"`
	Bucket    string `json:"bucket"`
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`
}

func createS3Handler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req createS3Request
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		cred := &db.S3Credential{
			ID:        uuid.New().String(),
			Name:      req.Name,
			Endpoint:  req.Endpoint,
			Bucket:    req.Bucket,
			AccessKey: req.AccessKey,
			SecretKey: req.SecretKey,
		}

		if err := db.CreateS3(deps.DB, cred); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Re-read to get the created_at timestamp from DB
		saved, err := db.GetS3(deps.DB, cred.ID)
		if err != nil || saved == nil {
			// Fallback: return what we have
			c.JSON(http.StatusCreated, cred)
			return
		}

		c.JSON(http.StatusCreated, saved)
	}
}

func listS3Handler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		creds, err := db.ListS3(deps.DB)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if creds == nil {
			creds = []db.S3Credential{}
		}
		c.JSON(http.StatusOK, creds)
	}
}

func updateS3Handler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		existing, err := db.GetS3(deps.DB, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if existing == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "s3 credential not found"})
			return
		}

		var req updateS3Request
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		// Apply partial updates
		if req.Name != "" {
			existing.Name = req.Name
		}
		if req.Endpoint != "" {
			existing.Endpoint = req.Endpoint
		}
		if req.Bucket != "" {
			existing.Bucket = req.Bucket
		}
		if req.AccessKey != "" {
			existing.AccessKey = req.AccessKey
		}
		if req.SecretKey != "" {
			existing.SecretKey = req.SecretKey
		}

		if err := db.UpdateS3(deps.DB, existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, existing)
	}
}

func deleteS3Handler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		if err := db.DeleteS3(deps.DB, id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	}
}

func testS3Handler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
	}
}
