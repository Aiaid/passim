package auth

import (
	"fmt"
	"net/http"
	"sync"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// WebAuthnManager wraps go-webauthn and manages short-lived challenge sessions.
type WebAuthnManager struct {
	wan        *webauthn.WebAuthn
	challenges sync.Map // map[string]*webauthn.SessionData
}

// PassimUser implements webauthn.User for the single-admin model.
type PassimUser struct {
	ID          []byte
	Credentials []webauthn.Credential
}

func (u *PassimUser) WebAuthnID() []byte                         { return u.ID }
func (u *PassimUser) WebAuthnName() string                       { return "admin" }
func (u *PassimUser) WebAuthnDisplayName() string                { return "Admin" }
func (u *PassimUser) WebAuthnCredentials() []webauthn.Credential { return u.Credentials }

// NewWebAuthnManager creates a WebAuthn relying party.
// rpID is the domain (e.g., "localhost").
// rpOrigin is the full origin (e.g., "https://localhost:8443").
func NewWebAuthnManager(rpID, rpOrigin string) (*WebAuthnManager, error) {
	if rpID == "" || rpOrigin == "" {
		return nil, fmt.Errorf("create webauthn: rpID and rpOrigin must not be empty")
	}
	wan, err := webauthn.New(&webauthn.Config{
		RPID:          rpID,
		RPDisplayName: "Passim",
		RPOrigins:     []string{rpOrigin},
	})
	if err != nil {
		return nil, fmt.Errorf("create webauthn: %w", err)
	}
	return &WebAuthnManager{wan: wan}, nil
}

// BeginRegistration generates credential creation options and stores the
// session challenge keyed by the hex-encoded user ID.
func (m *WebAuthnManager) BeginRegistration(user *PassimUser, opts ...webauthn.RegistrationOption) (*protocol.CredentialCreation, error) {
	creation, session, err := m.wan.BeginRegistration(user, opts...)
	if err != nil {
		return nil, fmt.Errorf("begin registration: %w", err)
	}
	m.challenges.Store(string(user.ID), session)
	return creation, nil
}

// FinishRegistration validates the attestation response and returns the new credential.
func (m *WebAuthnManager) FinishRegistration(user *PassimUser, r *http.Request) (*webauthn.Credential, error) {
	val, ok := m.challenges.LoadAndDelete(string(user.ID))
	if !ok {
		return nil, fmt.Errorf("no registration challenge found")
	}
	session := val.(*webauthn.SessionData)
	cred, err := m.wan.FinishRegistration(user, *session, r)
	if err != nil {
		return nil, fmt.Errorf("finish registration: %w", err)
	}
	return cred, nil
}

// BeginLogin generates authentication options and stores the session challenge.
func (m *WebAuthnManager) BeginLogin(user *PassimUser) (*protocol.CredentialAssertion, error) {
	assertion, session, err := m.wan.BeginLogin(user)
	if err != nil {
		return nil, fmt.Errorf("begin login: %w", err)
	}
	m.challenges.Store(string(user.ID), session)
	return assertion, nil
}

// FinishLogin validates the assertion response and returns the updated credential.
func (m *WebAuthnManager) FinishLogin(user *PassimUser, r *http.Request) (*webauthn.Credential, error) {
	val, ok := m.challenges.LoadAndDelete(string(user.ID))
	if !ok {
		return nil, fmt.Errorf("no login challenge found")
	}
	session := val.(*webauthn.SessionData)
	cred, err := m.wan.FinishLogin(user, *session, r)
	if err != nil {
		return nil, fmt.Errorf("finish login: %w", err)
	}
	return cred, nil
}
