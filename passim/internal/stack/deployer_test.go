package stack

import (
	"context"
	"reflect"
	"sort"
	"testing"

	"github.com/compose-spec/compose-go/v2/types"
)

func strPtr(s string) *string { return &s }

func TestTranslateEnv(t *testing.T) {
	env := types.MappingWithEquals{
		"FOO":        strPtr("bar"),
		"QUUX":       strPtr("1"),
		"FROM_HOST":  nil, // skipped
		"HAS_EQUALS": strPtr("a=b=c"),
	}
	got := translateEnv(env)
	sort.Strings(got)
	want := []string{"FOO=bar", "HAS_EQUALS=a=b=c", "QUUX=1"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestTranslatePorts(t *testing.T) {
	ports := []types.ServicePortConfig{
		{Target: 80, Published: "8080", Protocol: "tcp"},
		{Target: 53, Published: "53", Protocol: "udp"},
		{Target: 443, Published: "", Protocol: "tcp"}, // skipped (no host port)
	}
	got := translatePorts(ports)
	want := []string{"8080:80/tcp", "53:53/udp"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestTranslatePortsDefaultProto(t *testing.T) {
	ports := []types.ServicePortConfig{{Target: 80, Published: "80", Protocol: ""}}
	got := translatePorts(ports)
	if got[0] != "80:80/tcp" {
		t.Errorf("got %q", got[0])
	}
}

func TestTranslateVolumes(t *testing.T) {
	vols := []types.ServiceVolumeConfig{
		{Type: "bind", Source: "/data/foo", Target: "/app/foo"},
		{Type: "volume", Source: "pgdata", Target: "/var/lib/postgresql", ReadOnly: true},
		{Type: "tmpfs", Target: "/tmp"}, // skipped
	}
	got := translateVolumes(vols)
	want := []string{"/data/foo:/app/foo", "pgdata:/var/lib/postgresql:ro"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestTranslateServiceLabelsMerged(t *testing.T) {
	s := &Stack{ID: "sid", Name: "mystack"}
	svc := types.ServiceConfig{
		Name:  "web",
		Image: "nginx:alpine",
		Labels: types.Labels{
			"app.custom": "yes",
		},
	}
	cfg, err := TranslateService(s, svc, "", "", "")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if cfg.Labels["app.custom"] != "yes" {
		t.Errorf("user label dropped")
	}
	if cfg.Labels[LabelStackName] != "mystack" {
		t.Errorf("stack label missing")
	}
	if cfg.Labels[LabelComposeProject] != "mystack" {
		t.Errorf("compose label missing")
	}
	if cfg.Name != "mystack_web_1" {
		t.Errorf("name = %q", cfg.Name)
	}
}

func TestTranslateServiceReservedLabelWins(t *testing.T) {
	s := &Stack{ID: "sid", Name: "mystack"}
	svc := types.ServiceConfig{
		Name:  "web",
		Image: "nginx",
		Labels: types.Labels{
			LabelStackName: "spoofed",
		},
	}
	cfg, _ := TranslateService(s, svc, "", "", "")
	if cfg.Labels[LabelStackName] != "mystack" {
		t.Errorf("spoofed label not overridden: %v", cfg.Labels[LabelStackName])
	}
}

func TestComposeContainerName(t *testing.T) {
	if got := ComposeContainerName("immich", "redis", 1); got != "immich_redis_1" {
		t.Errorf("got %q", got)
	}
}

func TestDeployNilRequest(t *testing.T) {
	if err := Deploy(context.Background(), nil); err == nil {
		t.Error("expected error for nil req")
	}
}

func TestTranslateRestart(t *testing.T) {
	cases := []string{"", "no", "always", "unless-stopped", "on-failure", "on-failure:3"}
	for _, r := range cases {
		if got := translateRestart(r); got != r {
			t.Errorf("translateRestart(%q) = %q", r, got)
		}
	}
}

func TestTranslateExtraHosts(t *testing.T) {
	h := types.HostsList{
		"somehost": []string{"1.2.3.4"},
		"other":    []string{"5.6.7.8"},
	}
	got := translateExtraHosts(h)
	want := []string{"other:5.6.7.8", "somehost:1.2.3.4"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}
