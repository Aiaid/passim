package stack

import (
	"sort"

	"github.com/compose-spec/compose-go/v2/types"
)

// DependencyCondition mirrors the compose-go DependsOn condition strings.
const (
	CondStarted           = "service_started"
	CondHealthy           = "service_healthy"
	CondCompletedOK       = "service_completed_successfully"
)

// Dependency describes why a service depends on another.
type Dependency struct {
	Service   string
	Condition string
}

// Topology is a service DAG ready for layered, parallel startup.
// Each entry in Layers is a group that can start concurrently; all services
// in layer N depend only on services already started in layers 0..N-1.
type Topology struct {
	Layers       [][]string              // service names by startup layer
	Dependencies map[string][]Dependency // service → things that must be ready first
}

// BuildTopology extracts the dependency graph from the project and returns
// a topological layering. Errors:
//   - stack.depends_on_unknown_service: depends_on references a service not in the project
//   - stack.depends_on_cycle: graph contains a cycle (direct or indirect)
//
// network_mode: service:<x> becomes an implicit depends_on (condition=service_started)
// on <x>. The caller is responsible for resolving that before calling us —
// BuildTopology only sees what's already been merged into svc.DependsOn.
func BuildTopology(p *types.Project) (*Topology, error) {
	deps := make(map[string][]Dependency, len(p.Services))
	known := make(map[string]struct{}, len(p.Services))
	for name := range p.Services {
		known[name] = struct{}{}
	}

	for name, svc := range p.Services {
		var list []Dependency
		for depName, d := range svc.DependsOn {
			if _, ok := known[depName]; !ok {
				return nil, verr(ErrDependsOnUnknownService,
					"service.%s.depends_on references unknown service %q", name, depName)
			}
			condition := d.Condition
			if condition == "" {
				condition = CondStarted
			}
			list = append(list, Dependency{Service: depName, Condition: condition})
		}
		// Deterministic ordering so later code (layer sort, logging) is stable.
		sort.Slice(list, func(i, j int) bool { return list[i].Service < list[j].Service })
		deps[name] = list
	}

	layers, err := layerize(deps)
	if err != nil {
		return nil, err
	}
	return &Topology{Layers: layers, Dependencies: deps}, nil
}

// layerize does a Kahn-style topological sort, grouping services whose
// in-degree hits zero in the same round. A cycle shows up as services
// remaining after no round made progress.
func layerize(deps map[string][]Dependency) ([][]string, error) {
	remaining := make(map[string]map[string]struct{}, len(deps))
	for svc, ds := range deps {
		set := make(map[string]struct{}, len(ds))
		for _, d := range ds {
			set[d.Service] = struct{}{}
		}
		remaining[svc] = set
	}

	var layers [][]string
	for len(remaining) > 0 {
		var ready []string
		for svc, pending := range remaining {
			if len(pending) == 0 {
				ready = append(ready, svc)
			}
		}
		if len(ready) == 0 {
			// Nothing moved → cycle. Report involved services deterministically.
			stuck := make([]string, 0, len(remaining))
			for svc := range remaining {
				stuck = append(stuck, svc)
			}
			sort.Strings(stuck)
			return nil, verr(ErrDependsOnCycle,
				"depends_on cycle involving: %v", stuck)
		}
		sort.Strings(ready)
		layers = append(layers, ready)
		for _, svc := range ready {
			delete(remaining, svc)
		}
		// Remove satisfied edges.
		for _, pending := range remaining {
			for _, svc := range ready {
				delete(pending, svc)
			}
		}
	}
	return layers, nil
}

// mergeNetworkModeDependency adds an implicit depends_on (service_started)
// when a service uses network_mode: service:<x>. This rewriter is called
// before BuildTopology so the resulting graph already reflects the
// relationship — that way the cycle check in BuildTopology catches a
// service pointing network_mode at itself or a service that transitively
// depends back on it.
//
// Also rewrites NetworkMode from "service:<x>" to "container:<container-id>"
// is *not* done here — that requires a container ID that only exists after
// the deployer starts <x>. Deployer does that substitution inline.
func mergeNetworkModeDependency(p *types.Project) error {
	for name, svc := range p.Services {
		target, ok := serviceNetworkMode(svc.NetworkMode)
		if !ok {
			continue
		}
		if _, known := p.Services[target]; !known {
			return verr(ErrNetworkModeUnknownService,
				"service.%s.network_mode references unknown service %q", name, target)
		}
		if svc.DependsOn == nil {
			svc.DependsOn = types.DependsOnConfig{}
		}
		if _, already := svc.DependsOn[target]; !already {
			svc.DependsOn[target] = types.ServiceDependency{Condition: CondStarted}
		}
		p.Services[name] = svc
	}
	return nil
}

// serviceNetworkMode returns the target service name when NetworkMode is
// "service:<name>", otherwise ("", false).
func serviceNetworkMode(mode string) (string, bool) {
	const prefix = "service:"
	if len(mode) <= len(prefix) {
		return "", false
	}
	if mode[:len(prefix)] != prefix {
		return "", false
	}
	return mode[len(prefix):], true
}
