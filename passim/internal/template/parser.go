package template

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Template struct {
	Name        string            `yaml:"name"`
	Category    string            `yaml:"category"`
	Version     string            `yaml:"version"`
	Icon        string            `yaml:"icon"`
	Description map[string]string `yaml:"description"`
	Settings    []Setting         `yaml:"settings"`
	Container   ContainerSpec     `yaml:"container"`
	ConfigExport *ConfigExport   `yaml:"config_export,omitempty"`
}

type Setting struct {
	Key     string            `yaml:"key"`
	Type    string            `yaml:"type"`
	Min     *int              `yaml:"min,omitempty"`
	Max     *int              `yaml:"max,omitempty"`
	Default interface{}       `yaml:"default,omitempty"`
	Label   map[string]string `yaml:"label"`
}

type ContainerSpec struct {
	Image       string            `yaml:"image"`
	Ports       []string          `yaml:"ports"`
	Volumes     []string          `yaml:"volumes"`
	Environment map[string]string `yaml:"environment"`
	Labels      map[string]string `yaml:"labels"`
	CapAdd      []string          `yaml:"cap_add,omitempty"`
	Sysctls     map[string]string `yaml:"sysctls,omitempty"`
}

type ConfigExport struct {
	Format  string `yaml:"format"`
	Path    string `yaml:"path"`
	Pattern string `yaml:"pattern"`
}

func ParseFile(path string) (*Template, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read template %s: %w", path, err)
	}
	return Parse(data)
}

func Parse(data []byte) (*Template, error) {
	var t Template
	if err := yaml.Unmarshal(data, &t); err != nil {
		return nil, fmt.Errorf("parse template: %w", err)
	}
	if t.Name == "" {
		return nil, fmt.Errorf("template missing name")
	}
	return &t, nil
}
