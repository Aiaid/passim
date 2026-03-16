package template

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// templatesDir returns the absolute path to the templates/ directory.
// It walks up from the test file location to find the project root.
func templatesDir(t *testing.T) string {
	t.Helper()

	// Use runtime.Caller to find the directory containing this test file,
	// then navigate to the templates/ directory relative to the project root.
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to determine test file path")
	}
	// filename is .../passim/internal/template/templates_test.go
	// templates dir is .../passim/templates/
	projectRoot := filepath.Join(filepath.Dir(filename), "..", "..")
	dir := filepath.Join(projectRoot, "templates")

	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("templates directory not found at %s: %v", dir, err)
	}
	return dir
}

// loadAllTemplates parses every .yaml file in the templates/ directory.
func loadAllTemplates(t *testing.T) map[string]*Template {
	t.Helper()
	dir := templatesDir(t)

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read templates dir: %v", err)
	}

	templates := make(map[string]*Template)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		tmpl, err := ParseFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("parse %s: %v", e.Name(), err)
		}
		templates[tmpl.Name] = tmpl
	}
	return templates
}

// expectedTemplates lists all template names that must be present.
var expectedTemplates = []string{
	"wireguard",
	"l2tp",
	"hysteria",
	"v2ray",
	"webdav",
	"samba",
	"rdesktop",
}

func TestAllTemplatesParseSuccessfully(t *testing.T) {
	templates := loadAllTemplates(t)

	if len(templates) < len(expectedTemplates) {
		t.Errorf("loaded %d templates, expected at least %d", len(templates), len(expectedTemplates))
	}

	for _, name := range expectedTemplates {
		if _, ok := templates[name]; !ok {
			t.Errorf("template %q not found in templates directory", name)
		}
	}
}

func TestAllTemplatesHaveRequiredFields(t *testing.T) {
	templates := loadAllTemplates(t)

	for name, tmpl := range templates {
		t.Run(name, func(t *testing.T) {
			if tmpl.Name == "" {
				t.Error("name is empty")
			}
			if tmpl.Category == "" {
				t.Error("category is empty")
			}
			if tmpl.Version == "" {
				t.Error("version is empty")
			}
			if tmpl.Container.Image == "" {
				t.Error("container.image is empty")
			}
			if tmpl.Icon == "" {
				t.Error("icon is empty")
			}
			if len(tmpl.Description) == 0 {
				t.Error("description is empty")
			}
			if _, ok := tmpl.Description["en-US"]; !ok {
				t.Error("missing en-US description")
			}
			if _, ok := tmpl.Description["zh-CN"]; !ok {
				t.Error("missing zh-CN description")
			}
		})
	}
}

func TestAllTemplatesHaveLocalizedLabels(t *testing.T) {
	templates := loadAllTemplates(t)

	for name, tmpl := range templates {
		t.Run(name, func(t *testing.T) {
			for i, s := range tmpl.Settings {
				if len(s.Label) == 0 {
					t.Errorf("settings[%d] (%s): label is empty", i, s.Key)
					continue
				}
				if _, ok := s.Label["en-US"]; !ok {
					t.Errorf("settings[%d] (%s): missing en-US label", i, s.Key)
				}
				if _, ok := s.Label["zh-CN"]; !ok {
					t.Errorf("settings[%d] (%s): missing zh-CN label", i, s.Key)
				}
			}
		})
	}
}

func TestAllTemplatesValidateWithDefaults(t *testing.T) {
	templates := loadAllTemplates(t)

	for name, tmpl := range templates {
		t.Run(name, func(t *testing.T) {
			if len(tmpl.Settings) == 0 {
				t.Skip("no settings to validate")
			}

			// Build a values map using only default values.
			// Settings that reference generated values (e.g. "{{generated.password}}")
			// are skipped in validation since they would be filled at deploy time.
			values := make(map[string]interface{})
			for _, s := range tmpl.Settings {
				if s.Default == nil {
					continue
				}
				defStr, ok := s.Default.(string)
				if ok && strings.Contains(defStr, "{{generated.") {
					// For generated defaults, produce a placeholder to satisfy validation.
					values[s.Key] = "placeholder-generated-value"
					continue
				}
				values[s.Key] = s.Default
			}

			merged, err := ValidateSettings(tmpl.Settings, values)
			if err != nil {
				t.Fatalf("ValidateSettings with defaults failed: %v", err)
			}

			// Every setting with a default should be in the merged map.
			for _, s := range tmpl.Settings {
				if s.Default != nil {
					if _, ok := merged[s.Key]; !ok {
						t.Errorf("setting %q with default not present in merged result", s.Key)
					}
				}
			}
		})
	}
}

func TestAllTemplatesGenerateValues(t *testing.T) {
	templates := loadAllTemplates(t)

	for name, tmpl := range templates {
		t.Run(name, func(t *testing.T) {
			if len(tmpl.Generated) == 0 {
				t.Skip("no generated specs")
			}

			result := GenerateValues(tmpl.Generated)

			for _, spec := range tmpl.Generated {
				// Type-specific checks
				switch spec.Type {
				case "random_string":
					val, ok := result[spec.Key]
					if !ok {
						t.Errorf("generated key %q not found in result", spec.Key)
						continue
					}
					expectedLen := spec.Length
					if expectedLen <= 0 {
						expectedLen = 32 // default
					}
					if len(val) != expectedLen {
						t.Errorf("generated key %q: length %d, expected %d", spec.Key, len(val), expectedLen)
					}
				case "uuid_v4":
					val, ok := result[spec.Key]
					if !ok {
						t.Errorf("generated key %q not found in result", spec.Key)
						continue
					}
					parts := strings.Split(val, "-")
					if len(parts) != 5 {
						t.Errorf("generated key %q: invalid UUID format %q", spec.Key, val)
					}
				case "tls_self_signed":
					cert, hasCert := result[spec.Key+"_cert"]
					key, hasKey := result[spec.Key+"_key"]
					if !hasCert || !hasKey {
						t.Errorf("tls_self_signed %q: missing cert or key", spec.Key)
						continue
					}
					if !strings.Contains(cert, "BEGIN CERTIFICATE") {
						t.Errorf("tls_self_signed %q: cert missing PEM header", spec.Key)
					}
					if !strings.Contains(key, "BEGIN EC PRIVATE KEY") {
						t.Errorf("tls_self_signed %q: key missing PEM header", spec.Key)
					}
				default:
					val, ok := result[spec.Key]
					if !ok {
						t.Errorf("generated key %q not found in result", spec.Key)
						continue
					}
					if val == "" {
						t.Errorf("generated key %q has empty value", spec.Key)
					}
				}
			}
		})
	}
}

func TestRegistryLoadsAllTemplates(t *testing.T) {
	dir := templatesDir(t)
	reg := NewRegistry()

	if err := reg.LoadDir(dir); err != nil {
		t.Fatalf("LoadDir failed: %v", err)
	}

	list := reg.List()
	if len(list) < len(expectedTemplates) {
		t.Errorf("registry has %d templates, expected at least %d", len(list), len(expectedTemplates))
	}

	for _, name := range expectedTemplates {
		tmpl, ok := reg.Get(name)
		if !ok {
			t.Errorf("registry missing template %q", name)
			continue
		}
		if tmpl.Name != name {
			t.Errorf("registry returned template with name %q, expected %q", tmpl.Name, name)
		}
	}
}

func TestWireguardTemplateExpanded(t *testing.T) {
	templates := loadAllTemplates(t)
	wg, ok := templates["wireguard"]
	if !ok {
		t.Fatal("wireguard template not found")
	}

	// Source
	if wg.Source == nil {
		t.Fatal("wireguard: source is nil")
	}
	if wg.Source.URL != "https://github.com/linuxserver/docker-wireguard" {
		t.Errorf("wireguard: source URL = %q", wg.Source.URL)
	}
	if wg.Source.License == "" {
		t.Error("wireguard: source license is empty")
	}

	// Guide
	if wg.Guide == nil {
		t.Fatal("wireguard: guide is nil")
	}
	if wg.Guide.Setup["en-US"] == "" {
		t.Error("wireguard: guide.setup en-US is empty")
	}
	if wg.Guide.Setup["zh-CN"] == "" {
		t.Error("wireguard: guide.setup zh-CN is empty")
	}
	if wg.Guide.Usage["en-US"] == "" {
		t.Error("wireguard: guide.usage en-US is empty")
	}
	if wg.Guide.Usage["zh-CN"] == "" {
		t.Error("wireguard: guide.usage zh-CN is empty")
	}

	// Limitations
	if len(wg.Limitations) == 0 {
		t.Error("wireguard: limitations is empty")
	}

	// Clients
	if wg.Clients == nil {
		t.Fatal("wireguard: clients is nil")
	}
	if wg.Clients.Mobile == nil {
		t.Error("wireguard: clients.mobile is nil")
	}
	if wg.Clients.Desktop == nil {
		t.Error("wireguard: clients.desktop is nil")
	}

	// ConfigExport should still be present
	if wg.ConfigExport == nil {
		t.Fatal("wireguard: config_export is nil")
	}
	if wg.ConfigExport.Format != "conf" {
		t.Errorf("wireguard: config_export format = %q", wg.ConfigExport.Format)
	}
}

func TestTemplateCategories(t *testing.T) {
	templates := loadAllTemplates(t)

	expectedCategories := map[string]string{
		"wireguard": "vpn",
		"l2tp":      "vpn",
		"hysteria":  "vpn",
		"v2ray":     "vpn",
		"webdav":    "storage",
		"samba":     "storage",
		"rdesktop":  "tools",
	}

	for name, expectedCat := range expectedCategories {
		tmpl, ok := templates[name]
		if !ok {
			t.Errorf("template %q not found", name)
			continue
		}
		if tmpl.Category != expectedCat {
			t.Errorf("template %q: category = %q, expected %q", name, tmpl.Category, expectedCat)
		}
	}
}

func TestTemplateContainerImages(t *testing.T) {
	templates := loadAllTemplates(t)

	expectedImages := map[string]string{
		"wireguard": "linuxserver/wireguard",
		"l2tp":      "hwdsl2/ipsec-vpn-server",
		"hysteria":  "tobyxdd/hysteria",
		"v2ray":     "v2fly/v2fly-core",
		"webdav":    "bytemark/webdav",
		"samba":     "dperson/samba",
		"rdesktop":  "linuxserver/rdesktop",
	}

	for name, expectedImage := range expectedImages {
		tmpl, ok := templates[name]
		if !ok {
			t.Errorf("template %q not found", name)
			continue
		}
		if tmpl.Container.Image != expectedImage {
			t.Errorf("template %q: image = %q, expected %q", name, tmpl.Container.Image, expectedImage)
		}
	}
}

func TestTemplatesWithConfigFiles(t *testing.T) {
	templates := loadAllTemplates(t)

	// Templates that should have config file mappings
	withConfig := []string{"hysteria", "v2ray"}

	for _, name := range withConfig {
		tmpl, ok := templates[name]
		if !ok {
			t.Errorf("template %q not found", name)
			continue
		}
		t.Run(name, func(t *testing.T) {
			if tmpl.Config == nil {
				t.Fatal("config is nil")
			}
			if len(tmpl.Config.Files) == 0 {
				t.Fatal("config.files is empty")
			}
			for i, cf := range tmpl.Config.Files {
				if cf.Path == "" {
					t.Errorf("config.files[%d]: path is empty", i)
				}
				if cf.Template == "" {
					t.Errorf("config.files[%d]: template is empty", i)
				}
			}
		})
	}
}

func TestTemplatesWithCapAdd(t *testing.T) {
	templates := loadAllTemplates(t)

	// Templates that require NET_ADMIN capability
	withNetAdmin := []string{"wireguard", "l2tp"}

	for _, name := range withNetAdmin {
		tmpl, ok := templates[name]
		if !ok {
			t.Errorf("template %q not found", name)
			continue
		}
		t.Run(name, func(t *testing.T) {
			found := false
			for _, cap := range tmpl.Container.CapAdd {
				if cap == "NET_ADMIN" {
					found = true
					break
				}
			}
			if !found {
				t.Error("NET_ADMIN capability not found in cap_add")
			}
		})
	}
}

func TestTemplatesWithArgs(t *testing.T) {
	templates := loadAllTemplates(t)

	// Templates that use container args
	withArgs := map[string]int{
		"hysteria": 3, // server -c /etc/hysteria/config.yaml
		"v2ray":    3, // run -c /etc/v2ray/config.json
		"samba":    4, // -u user;pass -s share;/mount;...
	}

	for name, expectedArgCount := range withArgs {
		tmpl, ok := templates[name]
		if !ok {
			t.Errorf("template %q not found", name)
			continue
		}
		t.Run(name, func(t *testing.T) {
			if len(tmpl.Container.Args) != expectedArgCount {
				t.Errorf("args count = %d, expected %d; args = %v",
					len(tmpl.Container.Args), expectedArgCount, tmpl.Container.Args)
			}
		})
	}
}

func TestRdesktopResolutionOptions(t *testing.T) {
	templates := loadAllTemplates(t)
	rd, ok := templates["rdesktop"]
	if !ok {
		t.Fatal("rdesktop template not found")
	}

	if len(rd.Settings) == 0 {
		t.Fatal("rdesktop has no settings")
	}

	var resSetting *Setting
	for i := range rd.Settings {
		if rd.Settings[i].Key == "resolution" {
			resSetting = &rd.Settings[i]
			break
		}
	}
	if resSetting == nil {
		t.Fatal("resolution setting not found")
	}

	if resSetting.Type != "select" {
		t.Errorf("resolution type = %q, expected select", resSetting.Type)
	}

	if len(resSetting.Options) < 3 {
		t.Errorf("resolution options count = %d, expected at least 3", len(resSetting.Options))
	}

	// Default should be 1920x1080
	if resSetting.Default != "1920x1080" {
		t.Errorf("resolution default = %v, expected 1920x1080", resSetting.Default)
	}

	// Validate with default value
	merged, err := ValidateSettings(rd.Settings, map[string]interface{}{
		"resolution": "1920x1080",
	})
	if err != nil {
		t.Fatalf("validate resolution failed: %v", err)
	}
	if merged["resolution"] != "1920x1080" {
		t.Errorf("merged resolution = %v", merged["resolution"])
	}

	// Validate with alternate value
	merged, err = ValidateSettings(rd.Settings, map[string]interface{}{
		"resolution": "1280x720",
	})
	if err != nil {
		t.Fatalf("validate resolution 720p failed: %v", err)
	}
	if merged["resolution"] != "1280x720" {
		t.Errorf("merged resolution = %v", merged["resolution"])
	}

	// Invalid option should fail
	_, err = ValidateSettings(rd.Settings, map[string]interface{}{
		"resolution": "9999x9999",
	})
	if err == nil {
		t.Error("expected error for invalid resolution option")
	}
}

func TestL2tpCredentials(t *testing.T) {
	templates := loadAllTemplates(t)
	l2tp, ok := templates["l2tp"]
	if !ok {
		t.Fatal("l2tp template not found")
	}

	// Verify generated specs
	if len(l2tp.Generated) < 2 {
		t.Fatalf("l2tp generated specs count = %d, expected at least 2", len(l2tp.Generated))
	}

	genKeys := make(map[string]bool)
	for _, g := range l2tp.Generated {
		genKeys[g.Key] = true
	}
	if !genKeys["vpn_password"] {
		t.Error("missing generated spec for vpn_password")
	}
	if !genKeys["vpn_psk"] {
		t.Error("missing generated spec for vpn_psk")
	}

	// Generate values and verify they are non-empty
	generated := GenerateValues(l2tp.Generated)
	if generated["vpn_password"] == "" {
		t.Error("vpn_password generated value is empty")
	}
	if generated["vpn_psk"] == "" {
		t.Error("vpn_psk generated value is empty")
	}

	// Verify environment references
	env := l2tp.Container.Environment
	if env["VPN_IPSEC_PSK"] == "" {
		t.Error("VPN_IPSEC_PSK environment variable not set")
	}
	if env["VPN_USER"] == "" {
		t.Error("VPN_USER environment variable not set")
	}
	if env["VPN_PASSWORD"] == "" {
		t.Error("VPN_PASSWORD environment variable not set")
	}
}

func TestHysteriaConfigTemplate(t *testing.T) {
	templates := loadAllTemplates(t)
	hy, ok := templates["hysteria"]
	if !ok {
		t.Fatal("hysteria template not found")
	}

	if hy.Config == nil || len(hy.Config.Files) == 0 {
		t.Fatal("hysteria config files missing")
	}

	cf := hy.Config.Files[0]
	if !strings.Contains(cf.Template, "password") {
		t.Error("hysteria config template does not contain password reference")
	}
	if cf.Path != "config.yaml" {
		t.Errorf("hysteria config path = %q, want config.yaml", cf.Path)
	}
}

func TestV2rayConfigTemplate(t *testing.T) {
	templates := loadAllTemplates(t)
	v2, ok := templates["v2ray"]
	if !ok {
		t.Fatal("v2ray template not found")
	}

	if v2.Config == nil || len(v2.Config.Files) == 0 {
		t.Fatal("v2ray config files missing")
	}

	cf := v2.Config.Files[0]
	if !strings.Contains(cf.Template, "vmess") {
		t.Error("v2ray config template does not contain vmess protocol")
	}
	if !strings.Contains(cf.Template, "uuid") {
		t.Error("v2ray config template does not reference uuid")
	}
	if !strings.Contains(cf.Template, "alterId") {
		t.Error("v2ray config template does not contain alterId")
	}

	// Verify UUID generation spec
	if len(v2.Generated) == 0 {
		t.Fatal("v2ray has no generated specs")
	}
	foundUUID := false
	for _, g := range v2.Generated {
		if g.Key == "uuid" && g.Type == "uuid_v4" {
			foundUUID = true
			break
		}
	}
	if !foundUUID {
		t.Error("v2ray missing uuid_v4 generated spec")
	}
}

func TestWebdavEnvironment(t *testing.T) {
	templates := loadAllTemplates(t)
	wd, ok := templates["webdav"]
	if !ok {
		t.Fatal("webdav template not found")
	}

	env := wd.Container.Environment
	if env["AUTH_TYPE"] != "Digest" {
		t.Errorf("AUTH_TYPE = %q, expected Digest", env["AUTH_TYPE"])
	}
	if env["USERNAME"] == "" {
		t.Error("USERNAME environment variable not set")
	}
	if env["PASSWORD"] == "" {
		t.Error("PASSWORD environment variable not set")
	}
}

func TestSambaArgs(t *testing.T) {
	templates := loadAllTemplates(t)
	smb, ok := templates["samba"]
	if !ok {
		t.Fatal("samba template not found")
	}

	args := smb.Container.Args
	if len(args) < 4 {
		t.Fatalf("samba args count = %d, expected at least 4", len(args))
	}

	if args[0] != "-u" {
		t.Errorf("samba args[0] = %q, expected -u", args[0])
	}
	if args[2] != "-s" {
		t.Errorf("samba args[2] = %q, expected -s", args[2])
	}

	// The user and share args should contain template placeholders
	if !strings.Contains(args[1], "{{settings.username}}") {
		t.Error("samba args[1] does not reference settings.username")
	}
	if !strings.Contains(args[1], "{{settings.password}}") {
		t.Error("samba args[1] does not reference settings.password")
	}
	if !strings.Contains(args[3], "{{settings.share_name}}") {
		t.Error("samba args[3] does not reference settings.share_name")
	}
}

func TestAllTemplatesHaveSourceAndGuide(t *testing.T) {
	templates := loadAllTemplates(t)

	for _, name := range expectedTemplates {
		tmpl, ok := templates[name]
		if !ok {
			t.Errorf("template %q not found", name)
			continue
		}
		t.Run(name, func(t *testing.T) {
			if tmpl.Source == nil {
				t.Error("source is nil")
			} else if tmpl.Source.URL == "" {
				t.Error("source URL is empty")
			}

			if tmpl.Guide == nil {
				t.Error("guide is nil")
			} else {
				if len(tmpl.Guide.Setup) == 0 {
					t.Error("guide.setup is empty")
				}
				if len(tmpl.Guide.Usage) == 0 {
					t.Error("guide.usage is empty")
				}
			}

			if len(tmpl.Limitations) == 0 {
				t.Error("limitations is empty")
			}
		})
	}
}
