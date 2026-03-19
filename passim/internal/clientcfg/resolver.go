package clientcfg

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"text/template"
)

// NodeContext provides node info for template rendering.
type NodeContext struct {
	PublicIP  string
	Hostname  string
	Country   string
	DataDir   string
	Domain    string // SSL domain (e.g. "abc.dns.passim.io")
}

// AppContext provides app info for template rendering.
type AppContext struct {
	ID           string
	Template     string
	Settings     map[string]interface{}
	AppDir       string // e.g. /data/apps/wireguard-abc12345
	SubscribeURL string // full URL for subscription (e.g. https://host/api/s/token/subscribe)
}

// ResolvedFile represents a single config file for file_per_user type.
type ResolvedFile struct {
	Index   int    `json:"index"`
	Name    string `json:"name"`
	Content string `json:"content,omitempty"`
}

// ResolvedField represents a rendered credential field.
type ResolvedField struct {
	Key    string            `json:"key"`
	Label  map[string]string `json:"label"`
	Value  string            `json:"value"`
	Secret bool              `json:"secret,omitempty"`
}

// ResolvedURL represents a rendered URI scheme.
type ResolvedURL struct {
	Name   string `json:"name"`
	URI    string `json:"scheme"`
	QR     bool   `json:"qr,omitempty"`
}

// ResolvedConfig is the fully resolved client configuration for a deployed app.
type ResolvedConfig struct {
	Type        string            `json:"type"`
	Files       []ResolvedFile    `json:"files,omitempty"`
	Credentials []ResolvedField   `json:"fields,omitempty"`
	URLs        []ResolvedURL     `json:"urls,omitempty"`
	ImportURLs  map[string]string `json:"import_urls,omitempty"`
	QR          bool              `json:"qr,omitempty"`
	NodeName    string            `json:"node_name,omitempty"`
	NodeCountry string            `json:"node_country,omitempty"`
}

// ClientsDef is the clients block from a template.
// Matches template.ClientConfig but avoids circular import.
type ClientsDef struct {
	Type       string
	Source     string
	Format     string
	QR         bool
	Fields     []FieldDef
	URLs       []URLDef
	ImportURLs map[string]string
}

// FieldDef matches template.CredentialField.
type FieldDef struct {
	Key    string
	Label  map[string]string
	Value  string
	Secret bool
}

// URLDef matches template.ClientURL.
type URLDef struct {
	Name   string
	Scheme string
	QR     bool
}

// Resolve produces a ResolvedConfig from the template's clients definition,
// app settings/generated values, and node context.
func Resolve(clients *ClientsDef, app AppContext, node NodeContext) (*ResolvedConfig, error) {
	if clients == nil {
		return nil, fmt.Errorf("no clients definition")
	}

	switch clients.Type {
	case "file_per_user":
		return resolveFilePerUser(clients, app, node)
	case "credentials":
		return resolveCredentials(clients, app, node)
	case "url":
		return resolveURL(clients, app, node)
	default:
		return nil, fmt.Errorf("unknown clients type: %q", clients.Type)
	}
}

func resolveFilePerUser(clients *ClientsDef, app AppContext, node NodeContext) (*ResolvedConfig, error) {
	// Expand {n} in source pattern to find files on disk.
	// Source: "/config/peer{n}/peer{n}.conf"
	source := clients.Source
	if source == "" {
		return nil, fmt.Errorf("file_per_user: source is empty")
	}

	// Try the primary path (appDir/configs), then fallback to legacy path
	// (dataDir/configs/{template}). The legacy path supports containers
	// deployed before the per-app directory layout was introduced.
	hostPattern := containerPathToHost(source, app.AppDir)
	files := scanPeerFiles(hostPattern)

	if len(files) == 0 && node.DataDir != "" && app.Template != "" {
		legacyBase := filepath.Join(node.DataDir, "configs", app.Template)
		parts := strings.SplitN(source, "/", 3) // ["", "config", "peer{n}/..."]
		if len(parts) >= 3 {
			files = scanPeerFiles(filepath.Join(legacyBase, parts[2]))
		}
	}

	return &ResolvedConfig{
		Type:        "file_per_user",
		Files:       files,
		QR:          clients.QR,
		NodeName:    node.Hostname,
		NodeCountry: node.Country,
	}, nil
}

// scanPeerFiles expands {n} = 1..100 in a path pattern and reads matching files.
func scanPeerFiles(hostPattern string) []ResolvedFile {
	var files []ResolvedFile
	for n := 1; n <= 100; n++ {
		path := strings.ReplaceAll(hostPattern, "{n}", strconv.Itoa(n))
		content, err := os.ReadFile(path)
		if err != nil {
			break // no more peers
		}
		name := filepath.Base(path)
		files = append(files, ResolvedFile{
			Index:   n,
			Name:    name,
			Content: string(content),
		})
	}
	return files
}

func resolveCredentials(clients *ClientsDef, app AppContext, node NodeContext) (*ResolvedConfig, error) {
	data := buildTemplateData(app, node)
	var fields []ResolvedField
	for _, f := range clients.Fields {
		rendered, err := renderString(f.Value, data)
		if err != nil {
			return nil, fmt.Errorf("render credential %q: %w", f.Key, err)
		}
		fields = append(fields, ResolvedField{
			Key:    f.Key,
			Label:  f.Label,
			Value:  rendered,
			Secret: f.Secret,
		})
	}

	return &ResolvedConfig{
		Type:        "credentials",
		Credentials: fields,
		NodeName:    node.Hostname,
		NodeCountry: node.Country,
	}, nil
}

func resolveURL(clients *ClientsDef, app AppContext, node NodeContext) (*ResolvedConfig, error) {
	data := buildTemplateData(app, node)
	var urls []ResolvedURL
	for _, u := range clients.URLs {
		rendered, err := renderString(u.Scheme, data)
		if err != nil {
			return nil, fmt.Errorf("render url %q: %w", u.Name, err)
		}
		urls = append(urls, ResolvedURL{
			Name: u.Name,
			URI:  rendered,
			QR:   u.QR,
		})
	}

	importURLs := make(map[string]string)
	for k, v := range clients.ImportURLs {
		rendered, err := renderString(v, data)
		if err != nil {
			// Non-critical, skip
			continue
		}
		importURLs[k] = rendered
	}

	return &ResolvedConfig{
		Type:        "url",
		URLs:        urls,
		ImportURLs:  importURLs,
		QR:          len(urls) > 0 && urls[0].QR,
		NodeName:    node.Hostname,
		NodeCountry: node.Country,
	}, nil
}

// buildTemplateData creates the flat map used for Go template rendering.
func buildTemplateData(app AppContext, node NodeContext) map[string]string {
	data := make(map[string]string)

	// Node variables
	data["node_public_ip"] = node.PublicIP
	data["node_hostname"] = node.Hostname
	data["node_country"] = node.Country
	data["node_data_dir"] = node.DataDir
	data["node_domain"] = node.Domain

	// Settings
	for k, v := range app.Settings {
		data["settings_"+k] = fmt.Sprintf("%v", v)
	}

	// Subscribe URL (for import_urls rendering)
	if app.SubscribeURL != "" {
		data["subscribe_url"] = app.SubscribeURL
		data["base64_subscribe_url"] = base64.StdEncoding.EncodeToString([]byte(app.SubscribeURL))
	}

	return data
}

// renderString renders a template string with {{var}} placeholders.
// Converts {{settings.foo}} → {{.settings_foo}}, {{var}} → {{.var}}, and renders.
func renderString(tmplStr string, data map[string]string) (string, error) {
	// Replace dot-separated placeholders with underscore-separated
	s := tmplStr
	for _, prefix := range []string{"settings", "node", "generated"} {
		s = strings.ReplaceAll(s, "{{"+prefix+".", "{{."+prefix+"_")
	}
	// Handle bare template variables (no dot prefix)
	for _, bare := range []string{"subscribe_url", "base64_subscribe_url"} {
		s = strings.ReplaceAll(s, "{{"+bare+"}}", "{{."+bare+"}}")
	}

	t, err := template.New("").Option("missingkey=zero").Parse(s)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// containerPathToHost converts a container path like /config/wg_confs/peer{n}.conf
// to a host path like /data/apps/wireguard-abc12345/configs/wg_confs/peer{n}.conf
func containerPathToHost(containerPath, appDir string) string {
	// Common container volume mappings:
	// /config → {appDir}/configs
	// /etc/hysteria → {appDir}/configs
	// /etc/v2ray → {appDir}/configs
	configDir := filepath.Join(appDir, "configs")

	// Strip the first path component (container mount point)
	parts := strings.SplitN(containerPath, "/", 3) // ["", "config", "wg_confs/peer{n}.conf"]
	if len(parts) >= 3 {
		return filepath.Join(configDir, parts[2])
	}
	if len(parts) == 2 {
		return configDir
	}
	return containerPath
}

// ListFileIndices returns sorted file indices for a file_per_user source pattern.
func ListFileIndices(source, appDir string) []int {
	hostPattern := containerPathToHost(source, appDir)
	var indices []int
	for n := 1; n <= 100; n++ {
		path := strings.ReplaceAll(hostPattern, "{n}", strconv.Itoa(n))
		if _, err := os.Stat(path); err == nil {
			indices = append(indices, n)
		} else {
			break
		}
	}
	sort.Ints(indices)
	return indices
}

// ReadFileByIndex reads a single config file by peer index.
func ReadFileByIndex(source, appDir string, index int) (string, string, error) {
	hostPattern := containerPathToHost(source, appDir)
	path := strings.ReplaceAll(hostPattern, "{n}", strconv.Itoa(index))
	content, err := os.ReadFile(path)
	if err != nil {
		return "", "", fmt.Errorf("read config file: %w", err)
	}
	return filepath.Base(path), string(content), nil
}

// ReadFileByIndexWithFallback tries appDir first, then falls back to
// dataDir/configs/{template} for legacy deployments.
func ReadFileByIndexWithFallback(source, appDir, dataDir, templateName string, index int) (string, string, error) {
	name, content, err := ReadFileByIndex(source, appDir, index)
	if err == nil {
		return name, content, nil
	}
	if dataDir != "" && templateName != "" {
		legacyBase := filepath.Join(dataDir, "configs", templateName)
		parts := strings.SplitN(source, "/", 3)
		if len(parts) >= 3 {
			path := filepath.Join(legacyBase, strings.ReplaceAll(parts[2], "{n}", strconv.Itoa(index)))
			content, err := os.ReadFile(path)
			if err == nil {
				return filepath.Base(path), string(content), nil
			}
		}
	}
	return "", "", fmt.Errorf("read config file: %w", err)
}
