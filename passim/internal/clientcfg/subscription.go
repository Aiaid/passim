package clientcfg

import (
	"fmt"
	"net/url"
	"strings"
)

// ClashProxy is a single proxy entry in a Clash subscription YAML.
type ClashProxy struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Server   string `json:"server"`
	Port     int    `json:"port"`
	Password string `json:"password,omitempty"`
	UUID     string `json:"uuid,omitempty"`
	AlterID  int    `json:"alterId,omitempty"`
	Insecure bool   `json:"skip-cert-verify,omitempty"`
	SNI      string `json:"sni,omitempty"`
}

// GenerateClashYAML generates a Clash-compatible subscription YAML from multiple
// ResolvedConfigs (one per node). Only processes url-type configs.
func GenerateClashYAML(configs []ResolvedConfig) ([]byte, error) {
	var proxies []ClashProxy
	var proxyNames []string

	for _, cfg := range configs {
		if cfg.Type != "url" {
			continue
		}
		for _, u := range cfg.URLs {
			proxy, err := parseURIToClashProxy(u.URI, cfg.NodeName)
			if err != nil {
				continue // skip unparseable URIs
			}
			proxies = append(proxies, proxy)
			proxyNames = append(proxyNames, proxy.Name)
		}
	}

	if len(proxies) == 0 {
		return []byte("proxies: []\n"), nil
	}

	// Build YAML manually for simplicity (avoids yaml library dependency for output)
	var sb strings.Builder
	sb.WriteString("proxies:\n")
	for _, p := range proxies {
		sb.WriteString(fmt.Sprintf("  - name: %q\n", p.Name))
		sb.WriteString(fmt.Sprintf("    type: %s\n", p.Type))
		sb.WriteString(fmt.Sprintf("    server: %s\n", p.Server))
		sb.WriteString(fmt.Sprintf("    port: %d\n", p.Port))
		if p.Password != "" {
			sb.WriteString(fmt.Sprintf("    password: %q\n", p.Password))
		}
		if p.UUID != "" {
			sb.WriteString(fmt.Sprintf("    uuid: %s\n", p.UUID))
			sb.WriteString(fmt.Sprintf("    alterId: %d\n", p.AlterID))
		}
		if p.Insecure {
			sb.WriteString("    skip-cert-verify: true\n")
		}
		if p.SNI != "" {
			sb.WriteString(fmt.Sprintf("    sni: %s\n", p.SNI))
		}
		sb.WriteString("\n")
	}

	// Proxy group
	sb.WriteString("proxy-groups:\n")
	sb.WriteString("  - name: auto\n")
	sb.WriteString("    type: url-test\n")
	sb.WriteString("    proxies:\n")
	for _, name := range proxyNames {
		sb.WriteString(fmt.Sprintf("      - %q\n", name))
	}
	sb.WriteString("    url: http://www.gstatic.com/generate_204\n")
	sb.WriteString("    interval: 300\n")

	return []byte(sb.String()), nil
}

// parseURIToClashProxy parses a proxy URI scheme into a ClashProxy.
// Supports: hysteria2://, vmess://
func parseURIToClashProxy(uri, nodeName string) (ClashProxy, error) {
	if strings.HasPrefix(uri, "hysteria2://") {
		return parseHysteria2URI(uri, nodeName)
	}
	if strings.HasPrefix(uri, "vmess://") {
		return parseVMessURI(uri, nodeName)
	}
	return ClashProxy{}, fmt.Errorf("unsupported URI scheme: %s", uri)
}

// parseHysteria2URI parses: hysteria2://password@host:port/?insecure=1#name
func parseHysteria2URI(uri, fallbackName string) (ClashProxy, error) {
	u, err := url.Parse(uri)
	if err != nil {
		return ClashProxy{}, fmt.Errorf("parse hysteria2 URI: %w", err)
	}

	password := u.User.Username()
	host := u.Hostname()
	port := 443
	if p := u.Port(); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}

	name := fallbackName
	if u.Fragment != "" {
		name = u.Fragment
	}

	insecure := u.Query().Get("insecure") == "1"
	sni := u.Query().Get("sni")

	return ClashProxy{
		Name:     name,
		Type:     "hysteria2",
		Server:   host,
		Port:     port,
		Password: password,
		Insecure: insecure,
		SNI:      sni,
	}, nil
}

// parseVMessURI parses: vmess://uuid@host:port?alterId=0#name
func parseVMessURI(uri, fallbackName string) (ClashProxy, error) {
	u, err := url.Parse(uri)
	if err != nil {
		return ClashProxy{}, fmt.Errorf("parse vmess URI: %w", err)
	}

	uuid := u.User.Username()
	host := u.Hostname()
	port := 443
	if p := u.Port(); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}

	name := fallbackName
	if u.Fragment != "" {
		name = u.Fragment
	}

	alterID := 0
	if a := u.Query().Get("alterId"); a != "" {
		fmt.Sscanf(a, "%d", &alterID)
	}

	return ClashProxy{
		Name:    name,
		Type:    "vmess",
		Server:  host,
		Port:    port,
		UUID:    uuid,
		AlterID: alterID,
	}, nil
}
