package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/passim/passim/internal/clientcfg"
	"github.com/passim/passim/internal/node"
)

// pathAwareMockHub returns different responses based on the request path.
type pathAwareMockHub struct {
	nodes      []node.NodeInfo
	responses  map[string]proxyResponse // path → response
}

type proxyResponse struct {
	status int
	body   []byte
	err    error
}

func (m *pathAwareMockHub) AddNode(_ context.Context, _, _, _ string) (*node.NodeInfo, error) {
	return nil, nil
}
func (m *pathAwareMockHub) RemoveNode(_ string) error    { return nil }
func (m *pathAwareMockHub) UpdateNode(_, _ string) error  { return nil }
func (m *pathAwareMockHub) GetNode(_ string) (*node.NodeInfo, error) { return nil, nil }

func (m *pathAwareMockHub) ListNodes() []node.NodeInfo {
	return m.nodes
}

func (m *pathAwareMockHub) ProxyRequest(_ context.Context, nodeID, method, path string, _ io.Reader) (int, []byte, error) {
	key := nodeID + ":" + path
	if resp, ok := m.responses[key]; ok {
		return resp.status, resp.body, resp.err
	}
	return http.StatusNotFound, []byte(`{"error":"not found"}`), nil
}

func TestFetchRemoteConfigs_NoHub(t *testing.T) {
	deps := Deps{NodeHub: nil}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")
	if len(configs) != 0 {
		t.Errorf("expected 0 configs, got %d", len(configs))
	}
}

func TestFetchRemoteConfigs_NoNodes(t *testing.T) {
	hub := &pathAwareMockHub{
		nodes:     []node.NodeInfo{},
		responses: map[string]proxyResponse{},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")
	if len(configs) != 0 {
		t.Errorf("expected 0 configs, got %d", len(configs))
	}
}

func TestFetchRemoteConfigs_DisconnectedNodesSkipped(t *testing.T) {
	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo", Status: "disconnected", Country: "JP"},
		},
		responses: map[string]proxyResponse{},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")
	if len(configs) != 0 {
		t.Errorf("expected 0 configs from disconnected node, got %d", len(configs))
	}
}

func TestFetchRemoteConfigs_SingleNode(t *testing.T) {
	appsJSON, _ := json.Marshal([]appResponse{
		{ID: "app-abc12345", Template: "hysteria", Status: "running"},
		{ID: "app-def67890", Template: "wireguard", Status: "running"},
	})
	clientCfgJSON, _ := json.Marshal(clientConfigResponse{
		Type: "url",
		URLs: []clientConfigURL{
			{Name: "Hysteria 2", Scheme: "hysteria2://pass123@1.2.3.4:443/?insecure=1#tokyo-1", QR: true},
		},
		ImportURLs: map[string]string{"stash": "stash://install-config?url=https://example.com"},
	})

	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo-1", Status: "connected", Country: "JP"},
		},
		responses: map[string]proxyResponse{
			"node-1:/api/apps":                          {status: 200, body: appsJSON},
			"node-1:/api/apps/app-abc12345/client-config": {status: 200, body: clientCfgJSON},
		},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")

	if len(configs) != 1 {
		t.Fatalf("expected 1 config, got %d", len(configs))
	}

	cfg := configs[0]
	if cfg.Type != "url" {
		t.Errorf("type = %q, want url", cfg.Type)
	}
	if cfg.NodeName != "tokyo-1" {
		t.Errorf("node_name = %q, want tokyo-1", cfg.NodeName)
	}
	if cfg.NodeCountry != "JP" {
		t.Errorf("node_country = %q, want JP", cfg.NodeCountry)
	}
	if len(cfg.URLs) != 1 {
		t.Fatalf("expected 1 URL, got %d", len(cfg.URLs))
	}
	if cfg.URLs[0].URI != "hysteria2://pass123@1.2.3.4:443/?insecure=1#tokyo-1" {
		t.Errorf("URI = %q", cfg.URLs[0].URI)
	}
	if cfg.ImportURLs["stash"] == "" {
		t.Error("missing stash import URL")
	}
}

func TestFetchRemoteConfigs_MultipleNodes(t *testing.T) {
	appsNode1, _ := json.Marshal([]appResponse{
		{ID: "app-aaa", Template: "hysteria", Status: "running"},
	})
	appsNode2, _ := json.Marshal([]appResponse{
		{ID: "app-bbb", Template: "hysteria", Status: "running"},
	})
	cfgNode1, _ := json.Marshal(clientConfigResponse{
		Type: "url",
		URLs: []clientConfigURL{
			{Name: "Hysteria 2", Scheme: "hysteria2://pass1@1.2.3.4:443/?insecure=1#tokyo", QR: true},
		},
	})
	cfgNode2, _ := json.Marshal(clientConfigResponse{
		Type: "url",
		URLs: []clientConfigURL{
			{Name: "Hysteria 2", Scheme: "hysteria2://pass2@5.6.7.8:443/?insecure=1#singapore", QR: true},
		},
	})

	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo", Status: "connected", Country: "JP"},
			{ID: "node-2", Name: "singapore", Status: "connected", Country: "SG"},
		},
		responses: map[string]proxyResponse{
			"node-1:/api/apps":                    {status: 200, body: appsNode1},
			"node-2:/api/apps":                    {status: 200, body: appsNode2},
			"node-1:/api/apps/app-aaa/client-config": {status: 200, body: cfgNode1},
			"node-2:/api/apps/app-bbb/client-config": {status: 200, body: cfgNode2},
		},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")

	if len(configs) != 2 {
		t.Fatalf("expected 2 configs, got %d", len(configs))
	}

	// Check both nodes contributed (order is nondeterministic due to goroutines)
	names := map[string]bool{}
	for _, cfg := range configs {
		names[cfg.NodeName] = true
	}
	if !names["tokyo"] || !names["singapore"] {
		t.Errorf("expected both tokyo and singapore, got %v", names)
	}
}

func TestFetchRemoteConfigs_NoMatchingTemplate(t *testing.T) {
	appsJSON, _ := json.Marshal([]appResponse{
		{ID: "app-xyz", Template: "wireguard", Status: "running"},
	})

	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo", Status: "connected", Country: "JP"},
		},
		responses: map[string]proxyResponse{
			"node-1:/api/apps": {status: 200, body: appsJSON},
		},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")

	if len(configs) != 0 {
		t.Errorf("expected 0 configs for non-matching template, got %d", len(configs))
	}
}

func TestFetchRemoteConfigs_RemoteAppsError(t *testing.T) {
	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo", Status: "connected", Country: "JP"},
		},
		responses: map[string]proxyResponse{
			"node-1:/api/apps": {status: 500, body: []byte(`{"error":"internal error"}`)},
		},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")

	if len(configs) != 0 {
		t.Errorf("expected 0 configs on error, got %d", len(configs))
	}
}

func TestFetchRemoteConfigs_PartialFailure(t *testing.T) {
	appsNode1, _ := json.Marshal([]appResponse{
		{ID: "app-aaa", Template: "hysteria"},
	})
	appsNode2, _ := json.Marshal([]appResponse{
		{ID: "app-bbb", Template: "hysteria"},
	})
	cfgNode1, _ := json.Marshal(clientConfigResponse{
		Type: "url",
		URLs: []clientConfigURL{
			{Name: "Hysteria 2", Scheme: "hysteria2://pass@1.2.3.4:443/#tokyo"},
		},
	})

	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo", Status: "connected", Country: "JP"},
			{ID: "node-2", Name: "singapore", Status: "connected", Country: "SG"},
		},
		responses: map[string]proxyResponse{
			"node-1:/api/apps":                       {status: 200, body: appsNode1},
			"node-1:/api/apps/app-aaa/client-config":  {status: 200, body: cfgNode1},
			"node-2:/api/apps":                       {status: 200, body: appsNode2},
			// node-2 client-config fails (404)
		},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "hysteria")

	// Should still get node-1's config even though node-2 failed
	if len(configs) != 1 {
		t.Fatalf("expected 1 config (partial failure), got %d", len(configs))
	}
	if configs[0].NodeName != "tokyo" {
		t.Errorf("expected tokyo, got %s", configs[0].NodeName)
	}
}

func TestFetchRemoteConfigs_CredentialsTypeSkipped(t *testing.T) {
	appsJSON, _ := json.Marshal([]appResponse{
		{ID: "app-aaa", Template: "myapp"},
	})
	cfgJSON, _ := json.Marshal(clientConfigResponse{
		Type: "credentials",
		Fields: []clientConfigField{
			{Key: "password", Value: "secret"},
		},
	})

	hub := &pathAwareMockHub{
		nodes: []node.NodeInfo{
			{ID: "node-1", Name: "tokyo", Status: "connected"},
		},
		responses: map[string]proxyResponse{
			"node-1:/api/apps":                       {status: 200, body: appsJSON},
			"node-1:/api/apps/app-aaa/client-config": {status: 200, body: cfgJSON},
		},
	}
	deps := Deps{NodeHub: hub}
	configs := fetchRemoteConfigs(context.Background(), deps, "myapp")

	if len(configs) != 0 {
		t.Errorf("expected 0 configs for credentials type, got %d", len(configs))
	}
}

func TestGenerateClashYAML_MultiNodeAggregation(t *testing.T) {
	// Integration-style test: simulate what the subscribe endpoint does
	local := clientcfg.ResolvedConfig{
		Type:     "url",
		NodeName: "local",
		URLs: []clientcfg.ResolvedURL{
			{Name: "Hysteria 2", URI: "hysteria2://pass@10.0.0.1:443/?insecure=1#local"},
		},
	}
	remote1 := clientcfg.ResolvedConfig{
		Type:        "url",
		NodeName:    "tokyo",
		NodeCountry: "JP",
		URLs: []clientcfg.ResolvedURL{
			{Name: "Hysteria 2", URI: "hysteria2://pass@1.2.3.4:443/?insecure=1#tokyo"},
		},
	}
	remote2 := clientcfg.ResolvedConfig{
		Type:        "url",
		NodeName:    "singapore",
		NodeCountry: "SG",
		URLs: []clientcfg.ResolvedURL{
			{Name: "Hysteria 2", URI: "hysteria2://pass@5.6.7.8:443/?insecure=1#singapore"},
		},
	}

	configs := []clientcfg.ResolvedConfig{local, remote1, remote2}
	yaml, err := clientcfg.GenerateClashYAML(configs)
	if err != nil {
		t.Fatalf("GenerateClashYAML() error: %v", err)
	}

	s := string(yaml)
	// All three nodes should appear
	for _, name := range []string{"local", "tokyo", "singapore"} {
		if !contains(s, name) {
			t.Errorf("missing proxy for %s in YAML", name)
		}
	}
	// All servers should be present
	for _, ip := range []string{"10.0.0.1", "1.2.3.4", "5.6.7.8"} {
		if !contains(s, ip) {
			t.Errorf("missing server %s in YAML", ip)
		}
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && (s == substr || len(s) > len(substr) && findSubstring(s, substr))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
