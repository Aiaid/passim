package setup

import (
	"bytes"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/passim/passim/internal/db"
	"github.com/passim/passim/internal/ssl"
	"github.com/passim/passim/internal/version"
)

// joinRetryInterval is overridable in tests so the suite stays sub-second.
var joinRetryInterval = 30 * time.Second

const (
	joinMaxAttempts  = 20
	hubJoinedConfKey = "hub_joined"
)

// MaybeJoinHub kicks off a best-effort one-shot registration with a hub when
// INVITE / HUB env vars are set on first boot. The actual HTTP call retries
// in a goroutine so the boot path is never blocked.
//
// apiKeyPlain is required: the hub needs to call back into this node, so
// we send it the same API key Init() just generated. On subsequent boots
// (where Init returns "") this function is a no-op.
func MaybeJoinHub(ctx context.Context, database *sql.DB, sslMgr *ssl.SSLManager, port string, apiKeyPlain string) {
	invite := os.Getenv("INVITE")
	hub := os.Getenv("HUB")
	if invite == "" || hub == "" || apiKeyPlain == "" {
		return
	}

	joined, _ := db.GetConfig(database, hubJoinedConfKey)
	if joined == hub {
		return
	}

	name := os.Getenv("NODE_NAME")
	addr := os.Getenv("NODE_ADDR")
	if addr == "" {
		var domain string
		if sslMgr != nil {
			domain = sslMgr.GetDomain()
		}
		if domain == "" {
			log.Println("joinhub: no NODE_ADDR and no discoverable domain; skipping")
			return
		}
		if port == "" || port == "443" {
			addr = domain
		} else {
			addr = domain + ":" + port
		}
	}
	// Hub.AddNode expects address as host:port without scheme — strip if user supplied it.
	if i := strings.Index(addr, "://"); i >= 0 {
		addr = addr[i+3:]
	}

	skipTLS := os.Getenv("INVITE_SKIP_TLS_VERIFY") != ""
	go retryJoin(ctx, hub, invite, name, addr, apiKeyPlain, skipTLS, database)
}

func retryJoin(ctx context.Context, hub, invite, name, addr, apiKey string, skipTLS bool, database *sql.DB) {
	client := newJoinClient()
	body := map[string]any{
		"token":           invite,
		"name":            name,
		"address":         addr,
		"api_key":         apiKey,
		"version":         version.Version,
		"skip_tls_verify": skipTLS,
	}
	payload, _ := json.Marshal(body)
	url := strings.TrimRight(hub, "/") + "/api/cluster/join"

	for attempt := 1; attempt <= joinMaxAttempts; attempt++ {
		select {
		case <-ctx.Done():
			return
		default:
		}

		status, err := postJoin(ctx, client, url, payload)
		if err == nil {
			switch status {
			case http.StatusCreated, http.StatusOK:
				_ = db.SetConfig(database, hubJoinedConfKey, hub)
				log.Printf("joinhub: registered with %s", hub)
				return
			case http.StatusConflict:
				_ = db.SetConfig(database, hubJoinedConfKey, hub)
				log.Printf("joinhub: hub reports already joined")
				return
			case http.StatusUnauthorized, http.StatusGone:
				log.Printf("joinhub: invite token rejected (status %d), giving up", status)
				return
			default:
				log.Printf("joinhub: hub returned %d (attempt %d/%d)", status, attempt, joinMaxAttempts)
			}
		} else {
			log.Printf("joinhub: error contacting hub (attempt %d/%d): %v", attempt, joinMaxAttempts, err)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(joinRetryInterval):
		}
	}
	log.Printf("joinhub: gave up after %d attempts", joinMaxAttempts)
}

func postJoin(ctx context.Context, client *http.Client, url string, payload []byte) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

func newJoinClient() *http.Client {
	skip := os.Getenv("INVITE_SKIP_TLS_VERIFY") != ""
	return &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: skip},
		},
	}
}
