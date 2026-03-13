package template

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Registry struct {
	mu        sync.RWMutex
	templates map[string]*Template
}

func NewRegistry() *Registry {
	return &Registry{templates: make(map[string]*Template)}
}

func (r *Registry) LoadDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read templates dir: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		t, err := ParseFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return fmt.Errorf("load %s: %w", e.Name(), err)
		}
		r.templates[t.Name] = t
	}
	return nil
}

func (r *Registry) Get(name string) (*Template, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.templates[name]
	return t, ok
}

func (r *Registry) List() []*Template {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]*Template, 0, len(r.templates))
	for _, t := range r.templates {
		list = append(list, t)
	}
	return list
}
