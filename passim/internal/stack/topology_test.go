package stack

import (
	"errors"
	"reflect"
	"testing"

	"github.com/compose-spec/compose-go/v2/types"
)

func svc(name string, deps ...string) (string, types.ServiceConfig) {
	cfg := types.ServiceConfig{Name: name, Image: "x"}
	if len(deps) > 0 {
		cfg.DependsOn = types.DependsOnConfig{}
		for _, d := range deps {
			cfg.DependsOn[d] = types.ServiceDependency{Condition: CondStarted}
		}
	}
	return name, cfg
}

func makeProject(services ...types.ServiceConfig) *types.Project {
	m := make(types.Services, len(services))
	for _, s := range services {
		m[s.Name] = s
	}
	return &types.Project{Services: m}
}

func TestTopologySingleLayer(t *testing.T) {
	_, a := svc("a")
	_, b := svc("b")
	p := makeProject(a, b)
	topo, err := BuildTopology(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(topo.Layers) != 1 {
		t.Fatalf("layers = %d, want 1", len(topo.Layers))
	}
	want := []string{"a", "b"}
	if !reflect.DeepEqual(topo.Layers[0], want) {
		t.Errorf("layer = %v, want %v", topo.Layers[0], want)
	}
}

func TestTopologyChain(t *testing.T) {
	_, a := svc("a")
	_, b := svc("b", "a")
	_, c := svc("c", "b")
	topo, err := BuildTopology(makeProject(a, b, c))
	if err != nil {
		t.Fatal(err)
	}
	want := [][]string{{"a"}, {"b"}, {"c"}}
	if !reflect.DeepEqual(topo.Layers, want) {
		t.Errorf("layers = %v, want %v", topo.Layers, want)
	}
}

func TestTopologyDiamond(t *testing.T) {
	// app → (db, cache); db → leaf; cache → leaf
	_, leaf := svc("leaf")
	_, db := svc("db", "leaf")
	_, cache := svc("cache", "leaf")
	_, app := svc("app", "db", "cache")
	topo, err := BuildTopology(makeProject(leaf, db, cache, app))
	if err != nil {
		t.Fatal(err)
	}
	want := [][]string{{"leaf"}, {"cache", "db"}, {"app"}}
	if !reflect.DeepEqual(topo.Layers, want) {
		t.Errorf("layers = %v, want %v", topo.Layers, want)
	}
}

func TestTopologySelfCycle(t *testing.T) {
	_, a := svc("a", "a")
	_, err := BuildTopology(makeProject(a))
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != ErrDependsOnCycle {
		t.Errorf("got %v, want cycle", err)
	}
}

func TestTopologyMutualCycle(t *testing.T) {
	_, a := svc("a", "b")
	_, b := svc("b", "a")
	_, err := BuildTopology(makeProject(a, b))
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != ErrDependsOnCycle {
		t.Errorf("got %v, want cycle", err)
	}
}

func TestTopologyUnknownService(t *testing.T) {
	_, a := svc("a", "ghost")
	_, err := BuildTopology(makeProject(a))
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != ErrDependsOnUnknownService {
		t.Errorf("got %v, want unknown_service", err)
	}
}

func TestTopologyDefaultConditionStarted(t *testing.T) {
	_, a := svc("a")
	b := types.ServiceConfig{Name: "b", Image: "x"}
	b.DependsOn = types.DependsOnConfig{"a": types.ServiceDependency{}}
	topo, err := BuildTopology(makeProject(a, b))
	if err != nil {
		t.Fatal(err)
	}
	if topo.Dependencies["b"][0].Condition != CondStarted {
		t.Errorf("condition = %q, want %q",
			topo.Dependencies["b"][0].Condition, CondStarted)
	}
}

func TestNetworkModeServiceDependency(t *testing.T) {
	a := types.ServiceConfig{Name: "a", Image: "x"}
	b := types.ServiceConfig{Name: "b", Image: "x", NetworkMode: "service:a"}
	p := makeProject(a, b)
	if err := mergeNetworkModeDependency(p); err != nil {
		t.Fatal(err)
	}
	if _, ok := p.Services["b"].DependsOn["a"]; !ok {
		t.Error("implicit depends_on not added")
	}
}

func TestNetworkModeUnknownService(t *testing.T) {
	a := types.ServiceConfig{Name: "a", Image: "x", NetworkMode: "service:ghost"}
	err := mergeNetworkModeDependency(makeProject(a))
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != ErrNetworkModeUnknownService {
		t.Errorf("got %v", err)
	}
}

func TestNetworkModePassthrough(t *testing.T) {
	a := types.ServiceConfig{Name: "a", Image: "x", NetworkMode: "host"}
	if err := mergeNetworkModeDependency(makeProject(a)); err != nil {
		t.Errorf("host mode should not error: %v", err)
	}
}
