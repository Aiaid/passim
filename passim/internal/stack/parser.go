package stack

import (
	"bufio"
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/compose-spec/compose-go/v2/loader"
	"github.com/compose-spec/compose-go/v2/types"
	"gopkg.in/yaml.v3"
)

// ErrorCode is a stable identifier for validation failures; the UI translates
// it to localized text via a frontend code → message map.
type ErrorCode string

const (
	ErrInvalidName                        ErrorCode = "stack.invalid_name"
	ErrYAMLParse                          ErrorCode = "stack.yaml_parse_error"
	ErrBuildNotSupported                  ErrorCode = "stack.build_not_supported"
	ErrEnvFileNotSupported                ErrorCode = "stack.env_file_not_supported"
	ErrExtendsExternalFileNotSupported    ErrorCode = "stack.extends_external_file_not_supported"
	ErrConfigsExternalNotSupported        ErrorCode = "stack.configs_external_not_supported"
	ErrSecretsExternalNotSupported        ErrorCode = "stack.secrets_external_not_supported"
	ErrUnsupportedLoggingDriver           ErrorCode = "stack.unsupported_logging_driver"
	ErrUnsupportedNetworkDriver           ErrorCode = "stack.unsupported_network_driver"
	ErrUnsupportedVolumeDriver            ErrorCode = "stack.unsupported_volume_driver"
	ErrServicesRequired                   ErrorCode = "stack.services_required"
	ErrDependsOnUnknownService            ErrorCode = "stack.depends_on_unknown_service"
	ErrDependsOnCycle                     ErrorCode = "stack.depends_on_cycle"
	ErrNetworkModeUnknownService          ErrorCode = "stack.network_mode_unknown_service"
	ErrNetworkExternalMissing             ErrorCode = "stack.network_external_missing"
	ErrVolumeExternalMissing              ErrorCode = "stack.volume_external_missing"
	ErrStackDeployBusy                    ErrorCode = "stack.deploy_busy"
	ErrStackNotRunning                    ErrorCode = "stack.not_running"
	ErrStackBusy                          ErrorCode = "stack.busy"
)

// ValidationError is returned synchronously (HTTP 4xx) when a compose file
// can't be accepted.
type ValidationError struct {
	Code    ErrorCode
	Message string
}

func (e *ValidationError) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

func verr(code ErrorCode, format string, args ...any) *ValidationError {
	return &ValidationError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// Warning is a non-fatal parse note surfaced to the UI (e.g. "deploy section
// ignored because swarm-only").
type Warning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

var nameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,62}$`)

// NormalizeName rewrites "Immich Stack" → "immich-stack". The result is what
// the UI should display back to the user so they see the canonical form before
// submitting.
func NormalizeName(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ' || r == '.' || r == '/' || r == ':':
			b.WriteRune('-')
		}
	}
	out := b.String()
	out = strings.Trim(out, "-_")
	if len(out) > 63 {
		out = out[:63]
	}
	return out
}

// ValidateName reports whether the (already-normalized) name is acceptable.
func ValidateName(name string) error {
	if !nameRE.MatchString(name) {
		return verr(ErrInvalidName, "name must match ^[a-z0-9][a-z0-9_-]{0,62}$ (got %q)", name)
	}
	return nil
}

// ParseEnvText turns a dotenv-style text block into a map. Lines starting with
// '#' and blank lines are skipped. Values are taken as-is (no quote stripping)
// — user is responsible for writing them correctly.
func ParseEnvText(text string) (map[string]string, error) {
	out := map[string]string{}
	if text == "" {
		return out, nil
	}
	sc := bufio.NewScanner(strings.NewReader(text))
	lineno := 0
	for sc.Scan() {
		lineno++
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			return nil, fmt.Errorf("env line %d: missing '='", lineno)
		}
		k := strings.TrimSpace(line[:eq])
		v := line[eq+1:]
		// Strip surrounding quotes if present (single pair only)
		if len(v) >= 2 {
			if (v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'') {
				v = v[1 : len(v)-1]
			}
		}
		out[k] = v
	}
	return out, sc.Err()
}

// ParseAndValidate runs compose-go over the YAML and applies all Phase-1
// reject rules. Returns the parsed project + warnings on success, or a
// *ValidationError (wrapped in error) on failure.
func ParseAndValidate(ctx context.Context, name, yamlText, envText string, profiles []string) (*types.Project, []Warning, error) {
	if err := ValidateName(name); err != nil {
		return nil, nil, err
	}
	// Shallow pre-check intercepts fields that would cause compose-go to bail
	// early with a generic yaml_parse_error (env_file reads from disk,
	// extends.file opens external files, missing image trips consistency
	// check). We want a specific error code for these.
	if err := preCheckYAML(yamlText); err != nil {
		return nil, nil, err
	}
	env, err := ParseEnvText(envText)
	if err != nil {
		return nil, nil, verr(ErrYAMLParse, "env_text: %v", err)
	}

	configDetails := types.ConfigDetails{
		ConfigFiles: []types.ConfigFile{{
			Filename: "compose.yaml",
			Content:  []byte(yamlText),
		}},
		Environment: env,
	}

	project, err := loader.LoadWithContext(ctx, configDetails, func(opts *loader.Options) {
		opts.SetProjectName(name, true)
		opts.SkipValidation = false
		opts.SkipConsistencyCheck = false
		opts.ResolvePaths = false
		opts.Profiles = profiles
	})
	if err != nil {
		return nil, nil, verr(ErrYAMLParse, "%v", err)
	}
	if project == nil || len(project.Services) == 0 {
		return nil, nil, verr(ErrServicesRequired, "at least one service is required")
	}

	warnings, vErr := validateProject(project)
	if vErr != nil {
		return nil, nil, vErr
	}
	return project, warnings, nil
}

// validateProject applies Phase-1 reject rules + collects warnings for
// non-fatal but ignored fields (e.g. swarm-only `deploy:`).
func validateProject(p *types.Project) ([]Warning, error) {
	var warnings []Warning

	for _, svc := range p.Services {
		if svc.Build != nil {
			return nil, verr(ErrBuildNotSupported,
				"service.%s.build is not supported, use 'image:' instead", svc.Name)
		}
		if len(svc.EnvFiles) > 0 {
			return nil, verr(ErrEnvFileNotSupported,
				"service.%s.env_file is not supported, inline env vars with 'environment:'", svc.Name)
		}
		if svc.Extends != nil && svc.Extends.File != "" {
			return nil, verr(ErrExtendsExternalFileNotSupported,
				"service.%s.extends.file is not supported (only same-file extends)", svc.Name)
		}
		if err := validateLogging(svc); err != nil {
			return nil, err
		}
		if svc.Deploy != nil {
			warnings = append(warnings, Warning{
				Code:    "stack.deploy_ignored",
				Message: fmt.Sprintf("service.%s.deploy: ignored (swarm-only)", svc.Name),
			})
		}
		if svc.Image == "" {
			return nil, verr(ErrBuildNotSupported,
				"service.%s: 'image:' is required (build is not supported)", svc.Name)
		}
	}

	for name, net := range p.Networks {
		if net.Driver != "" && net.Driver != "bridge" {
			return nil, verr(ErrUnsupportedNetworkDriver,
				"networks.%s.driver %q is not supported (only 'bridge')", name, net.Driver)
		}
	}

	for name, vol := range p.Volumes {
		if vol.Driver != "" && vol.Driver != "local" {
			return nil, verr(ErrUnsupportedVolumeDriver,
				"volumes.%s.driver %q is not supported (only 'local')", name, vol.Driver)
		}
	}

	for name, cfg := range p.Configs {
		if bool(cfg.External) {
			return nil, verr(ErrConfigsExternalNotSupported,
				"configs.%s.external is not supported", name)
		}
	}

	for name, sec := range p.Secrets {
		if bool(sec.External) {
			return nil, verr(ErrSecretsExternalNotSupported,
				"secrets.%s.external is not supported", name)
		}
	}

	return warnings, nil
}

// loggingDriverAllowedOpts maps supported driver → set of allowed option keys.
var loggingDriverAllowedOpts = map[string]map[string]struct{}{
	"json-file": {"max-size": {}, "max-file": {}, "labels": {}, "tag": {}},
	"local":     {"max-size": {}, "max-file": {}, "compress": {}},
}

// preCheckYAML does a shallow yaml.Unmarshal into a generic map to reject
// fields that would make compose-go bail with a non-specific error. Matches
// the subset of rules that depend on the raw YAML rather than compose-go's
// normalized Project.
func preCheckYAML(yamlText string) *ValidationError {
	var root map[string]any
	if err := yaml.Unmarshal([]byte(yamlText), &root); err != nil {
		return verr(ErrYAMLParse, "%v", err)
	}
	services, _ := root["services"].(map[string]any)
	if len(services) == 0 {
		return verr(ErrServicesRequired, "at least one service is required")
	}
	for svcName, raw := range services {
		svc, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if _, has := svc["build"]; has {
			return verr(ErrBuildNotSupported,
				"service.%s.build is not supported, use 'image:' instead", svcName)
		}
		if _, has := svc["env_file"]; has {
			return verr(ErrEnvFileNotSupported,
				"service.%s.env_file is not supported, inline env vars with 'environment:'", svcName)
		}
		if ext, has := svc["extends"]; has {
			if m, ok := ext.(map[string]any); ok {
				if _, hasFile := m["file"]; hasFile {
					return verr(ErrExtendsExternalFileNotSupported,
						"service.%s.extends.file is not supported (only same-file extends)", svcName)
				}
			}
		}
		if _, has := svc["image"]; !has {
			return verr(ErrBuildNotSupported,
				"service.%s: 'image:' is required (build is not supported)", svcName)
		}
	}
	return nil
}

func validateLogging(svc types.ServiceConfig) error {
	if svc.Logging == nil {
		return nil
	}
	drv := svc.Logging.Driver
	if drv == "" {
		drv = "json-file" // daemon default
	}
	allowed, ok := loggingDriverAllowedOpts[drv]
	if !ok {
		return verr(ErrUnsupportedLoggingDriver,
			"service.%s.logging.driver %q is not supported (allowed: json-file, local)", svc.Name, drv)
	}
	for key := range svc.Logging.Options {
		if _, ok := allowed[key]; !ok {
			return verr(ErrUnsupportedLoggingDriver,
				"service.%s.logging.options.%s is not supported for driver %q", svc.Name, key, drv)
		}
	}
	return nil
}
