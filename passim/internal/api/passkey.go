package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/passim/passim/internal/auth"
	"github.com/passim/passim/internal/db"
)

type passkeyHandler struct {
	database *sql.DB
	jwt      *auth.JWTManager
	webauthn *auth.WebAuthnManager
}

// passkeyExists returns whether any passkeys are registered.
// GET /api/auth/passkeys/exists
func (h *passkeyHandler) passkeyExists(c *gin.Context) {
	exists, err := db.HasPasskeys(h.database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check passkeys"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"exists": exists})
}

// beginLogin starts the WebAuthn login ceremony.
// POST /api/auth/passkey/begin
func (h *passkeyHandler) beginLogin(c *gin.Context) {
	passkeys, err := db.ListPasskeys(h.database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load passkeys"})
		return
	}
	if len(passkeys) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no passkeys registered"})
		return
	}

	user := buildPassimUser(passkeys)
	assertion, err := h.webauthn.BeginLogin(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin login"})
		return
	}
	c.JSON(http.StatusOK, assertion.Response)
}

// finishLogin completes the WebAuthn login ceremony and issues a JWT.
// POST /api/auth/passkey/finish
func (h *passkeyHandler) finishLogin(c *gin.Context) {
	passkeys, err := db.ListPasskeys(h.database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load passkeys"})
		return
	}
	if len(passkeys) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no passkeys registered"})
		return
	}

	user := buildPassimUser(passkeys)

	// Build an *http.Request from the Gin context body for the webauthn library.
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}
	httpReq, _ := http.NewRequest("POST", "/", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")

	cred, err := h.webauthn.FinishLogin(user, httpReq)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "passkey verification failed"})
		return
	}

	// Update sign count and last_used_at for the matched credential.
	for _, pk := range passkeys {
		if bytes.Equal(pk.CredentialID, cred.ID) {
			_ = db.UpdatePasskeySignCount(h.database, pk.ID, cred.Authenticator.SignCount)
			break
		}
	}

	version, err := h.authVersion()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	token, exp, err := h.jwt.Issue(version)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"expires_at": exp,
	})
}

// beginRegister starts the WebAuthn registration ceremony.
// POST /api/auth/passkey/register (protected)
func (h *passkeyHandler) beginRegister(c *gin.Context) {
	passkeys, err := db.ListPasskeys(h.database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load passkeys"})
		return
	}

	user := buildPassimUser(passkeys)

	// Build exclude list from existing credentials.
	var excludeList []protocol.CredentialDescriptor
	for _, cred := range user.Credentials {
		excludeList = append(excludeList, cred.Descriptor())
	}

	var opts []webauthn.RegistrationOption
	if len(excludeList) > 0 {
		opts = append(opts, webauthn.WithExclusions(excludeList))
	}

	creation, err := h.webauthn.BeginRegistration(user, opts...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to begin registration"})
		return
	}
	c.JSON(http.StatusOK, creation.Response)
}

type finishRegisterRequest struct {
	Name     string          `json:"name"`
	Response json.RawMessage `json:"response"`
}

// finishRegister completes the WebAuthn registration ceremony and stores the credential.
// POST /api/auth/passkey/register/finish (protected)
func (h *passkeyHandler) finishRegister(c *gin.Context) {
	var req finishRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	passkeys, err := db.ListPasskeys(h.database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load passkeys"})
		return
	}

	user := buildPassimUser(passkeys)

	// Build an *http.Request from the attestation response for the webauthn library.
	httpReq, _ := http.NewRequest("POST", "/", bytes.NewReader(req.Response))
	httpReq.Header.Set("Content-Type", "application/json")

	cred, err := h.webauthn.FinishRegistration(user, httpReq)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "registration verification failed"})
		return
	}

	id := uuid.New().String()
	pk := &db.Passkey{
		ID:           id,
		CredentialID: cred.ID,
		PublicKey:    cred.PublicKey,
		Name:         req.Name,
		SignCount:    cred.Authenticator.SignCount,
	}
	if err := db.CreatePasskey(h.database, pk); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store passkey"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":   id,
		"name": req.Name,
	})
}

// passkeyListItem is the sanitized response for listing passkeys.
type passkeyListItem struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	SignCount  uint32 `json:"sign_count"`
	CreatedAt  string `json:"created_at"`
	LastUsedAt string `json:"last_used_at"`
}

// listPasskeys returns all passkeys without raw credential bytes.
// GET /api/auth/passkeys (protected)
func (h *passkeyHandler) listPasskeys(c *gin.Context) {
	passkeys, err := db.ListPasskeys(h.database)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list passkeys"})
		return
	}

	items := make([]passkeyListItem, 0, len(passkeys))
	for _, pk := range passkeys {
		items = append(items, passkeyListItem{
			ID:         pk.ID,
			Name:       pk.Name,
			SignCount:  pk.SignCount,
			CreatedAt:  pk.CreatedAt,
			LastUsedAt: pk.LastUsedAt,
		})
	}
	c.JSON(http.StatusOK, items)
}

// deletePasskey removes a passkey by ID.
// DELETE /api/auth/passkeys/:id (protected)
func (h *passkeyHandler) deletePasskey(c *gin.Context) {
	id := c.Param("id")
	if err := db.DeletePasskey(h.database, id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "passkey not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

// authVersion reads the current auth_version from the config table.
func (h *passkeyHandler) authVersion() (int, error) {
	val, err := db.GetConfig(h.database, "auth_version")
	if err != nil {
		return 0, err
	}
	if val == "" {
		return 1, nil
	}
	return strconv.Atoi(val)
}

// buildPassimUser creates a PassimUser with webauthn credentials from DB passkeys.
func buildPassimUser(passkeys []db.Passkey) *auth.PassimUser {
	// Fixed user ID for single-admin model.
	userID := []byte("passim-admin")

	var creds []webauthn.Credential
	for _, pk := range passkeys {
		creds = append(creds, webauthn.Credential{
			ID:        pk.CredentialID,
			PublicKey: pk.PublicKey,
			Authenticator: webauthn.Authenticator{
				SignCount: pk.SignCount,
			},
		})
	}

	return &auth.PassimUser{
		ID:          userID,
		Credentials: creds,
	}
}
