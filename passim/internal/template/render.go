package template

import (
	"bytes"
	"fmt"
	"strings"
	"text/template"
)

// NodeInfo describes the host node for template rendering.
type NodeInfo struct {
	PublicIP string
	Timezone string
	Hostname string
	DataDir  string
	Domain   string // SSL domain (e.g., "vruwbka8.dns.passim.io" or user's own domain)
}

// AppInfo describes the deployed app instance for template rendering.
type AppInfo struct {
	Dir string // per-app directory, e.g. /data/apps/wireguard-abc12345
}

// RenderData carries all data available during template rendering.
type RenderData struct {
	Settings  map[string]interface{}
	Node      NodeInfo
	Generated map[string]string
	App       AppInfo
}

// RenderedTemplate holds the fully-resolved container specification.
type RenderedTemplate struct {
	Image       string
	Ports       []string
	Volumes     []string
	Environment map[string]string
	Labels      map[string]string
	CapAdd      []string
	Sysctls     map[string]string
	Args        []string
	ConfigFiles []RenderedConfigFile
}

// RenderedConfigFile is a config file with its content rendered.
type RenderedConfigFile struct {
	Path    string
	Content string
}

// templateData flattens RenderData into the namespace used by templates.
// Templates use {{.settings_KEY}}, {{.node_PublicIP}}, {{.generated_KEY}}.
func buildFlatMap(data RenderData) map[string]interface{} {
	m := make(map[string]interface{})
	for k, v := range data.Settings {
		m["settings_"+k] = v
	}
	m["node_PublicIP"] = data.Node.PublicIP
	m["node_Timezone"] = data.Node.Timezone
	m["node_Hostname"] = data.Node.Hostname
	m["node_data_dir"] = data.Node.DataDir
	m["node_Domain"] = data.Node.Domain
	for k, v := range data.Generated {
		m["generated_"+k] = v
	}
	m["app_dir"] = data.App.Dir
	return m
}

// renderString processes a single string value that may contain
// {{settings.key}}, {{node.PublicIP}}, or {{generated.key}} placeholders.
// It converts dot notation to underscore notation for Go templates.
func renderString(s string, flatMap map[string]interface{}) (string, error) {
	// Convert our dot notation to Go template field access:
	// {{settings.peers}} -> {{.settings_peers}}
	// {{node.PublicIP}}  -> {{.node_PublicIP}}
	// {{generated.key}}  -> {{.generated_key}}
	converted := convertPlaceholders(s)

	tmpl, err := template.New("").Option("missingkey=error").Parse(converted)
	if err != nil {
		return "", fmt.Errorf("parse template %q: %w", s, err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, flatMap); err != nil {
		return "", fmt.Errorf("render template %q: %w", s, err)
	}
	return buf.String(), nil
}

// convertPlaceholders turns {{settings.peers}} into {{.settings_peers}}.
func convertPlaceholders(s string) string {
	result := s
	// Replace known prefixes with dot-accessed underscore keys
	for _, prefix := range []string{"settings", "node", "generated", "app"} {
		old := "{{" + prefix + "."
		new := "{{." + prefix + "_"
		result = strings.ReplaceAll(result, old, new)
	}
	return result
}

// renderStringMap renders every value in a map[string]string.
func renderStringMap(m map[string]string, flatMap map[string]interface{}) (map[string]string, error) {
	if m == nil {
		return nil, nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		rendered, err := renderString(v, flatMap)
		if err != nil {
			return nil, fmt.Errorf("key %q: %w", k, err)
		}
		out[k] = rendered
	}
	return out, nil
}

// renderStringSlice renders every element in a string slice.
func renderStringSlice(ss []string, flatMap map[string]interface{}) ([]string, error) {
	if ss == nil {
		return nil, nil
	}
	out := make([]string, len(ss))
	for i, s := range ss {
		rendered, err := renderString(s, flatMap)
		if err != nil {
			return nil, fmt.Errorf("index %d: %w", i, err)
		}
		out[i] = rendered
	}
	return out, nil
}

// Render resolves all template placeholders in a Template using the
// provided RenderData and returns a RenderedTemplate ready for deployment.
func Render(tmpl *Template, data RenderData) (*RenderedTemplate, error) {
	flatMap := buildFlatMap(data)

	env, err := renderStringMap(tmpl.Container.Environment, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render environment: %w", err)
	}

	labels, err := renderStringMap(tmpl.Container.Labels, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render labels: %w", err)
	}

	ports, err := renderStringSlice(tmpl.Container.Ports, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render ports: %w", err)
	}

	volumes, err := renderStringSlice(tmpl.Container.Volumes, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render volumes: %w", err)
	}

	args, err := renderStringSlice(tmpl.Container.Args, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render args: %w", err)
	}

	sysctls, err := renderStringMap(tmpl.Container.Sysctls, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render sysctls: %w", err)
	}

	// Render image name (could contain version placeholders, etc.)
	image, err := renderString(tmpl.Container.Image, flatMap)
	if err != nil {
		return nil, fmt.Errorf("render image: %w", err)
	}

	// Render config file templates
	var configFiles []RenderedConfigFile
	if tmpl.Config != nil {
		for _, cf := range tmpl.Config.Files {
			content, err := renderString(cf.Template, flatMap)
			if err != nil {
				return nil, fmt.Errorf("render config file %q: %w", cf.Path, err)
			}
			path, err := renderString(cf.Path, flatMap)
			if err != nil {
				return nil, fmt.Errorf("render config path %q: %w", cf.Path, err)
			}
			configFiles = append(configFiles, RenderedConfigFile{Path: path, Content: content})
		}
	}

	// CapAdd is copied as-is (no templates in capability names)
	capAdd := make([]string, len(tmpl.Container.CapAdd))
	copy(capAdd, tmpl.Container.CapAdd)

	return &RenderedTemplate{
		Image:       image,
		Ports:       ports,
		Volumes:     volumes,
		Environment: env,
		Labels:      labels,
		CapAdd:      capAdd,
		Sysctls:     sysctls,
		Args:        args,
		ConfigFiles: configFiles,
	}, nil
}
