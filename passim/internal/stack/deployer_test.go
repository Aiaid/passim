package stack

import (
	"context"
	"errors"
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

func TestResolveNetworkName(t *testing.T) {
	if got := resolveNetworkName("mystack", "frontend", types.NetworkConfig{}); got != "mystack_frontend" {
		t.Errorf("default = %q", got)
	}
	if got := resolveNetworkName("mystack", "frontend", types.NetworkConfig{Name: "shared-net"}); got != "shared-net" {
		t.Errorf("explicit = %q", got)
	}
}

func TestResolveVolumeName(t *testing.T) {
	if got := resolveVolumeName("mystack", "pgdata", types.VolumeConfig{}); got != "mystack_pgdata" {
		t.Errorf("default = %q", got)
	}
	if got := resolveVolumeName("mystack", "pgdata", types.VolumeConfig{Name: "my-old-vol"}); got != "my-old-vol" {
		t.Errorf("explicit = %q", got)
	}
}

func TestDefaultNetworkName(t *testing.T) {
	if got := defaultNetworkName("immich"); got != "immich_default" {
		t.Errorf("got %q", got)
	}
}

func TestRollbackRunsLIFO(t *testing.T) {
	var order []int
	rb := &rollbackStack{}
	rb.push(func() { order = append(order, 1) })
	rb.push(func() { order = append(order, 2) })
	rb.push(func() { order = append(order, 3) })
	rb.run()
	want := []int{3, 2, 1}
	if !reflect.DeepEqual(order, want) {
		t.Errorf("order = %v, want %v", order, want)
	}
}

func TestUniqueStrings(t *testing.T) {
	in := []string{"a", "b", "a", "c", "b"}
	got := uniqueStrings(in)
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

// TestDeployMinimalStack exercises the happy path end-to-end via a mock
// docker client: default network created, image pulled, container started,
// attached to the network.
func TestDeployMinimalStack(t *testing.T) {
	mock := &dockerMock{createdContainerID: "c1"}
	stackObj := &Stack{ID: "sid", Name: "mystack"}
	project, _, err := ParseAndValidate(
		context.Background(), "mystack",
		"services:\n  web:\n    image: nginx\n", "", nil,
	)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	req := &DeployRequest{
		Stack:   stackObj,
		Project: project,
		Docker:  mock,
	}
	if err := Deploy(context.Background(), req); err != nil {
		t.Fatalf("deploy: %v", err)
	}
	if len(mock.createdNetworks) != 1 || mock.createdNetworks[0] != "mystack_default" {
		t.Errorf("networks = %v", mock.createdNetworks)
	}
	if len(mock.pulled) != 1 || mock.pulled[0] != "nginx" {
		t.Errorf("pulled = %v", mock.pulled)
	}
	if len(mock.createdContainers) != 1 {
		t.Errorf("containers = %v", mock.createdContainers)
	}
	if len(mock.connects) != 1 {
		t.Errorf("connects = %v", mock.connects)
	}
	if mock.connects[0].network != "mystack_default" {
		t.Errorf("connect network = %q", mock.connects[0].network)
	}
}

// TestDeployExternalNetworkMissing checks we bail before touching anything
// when an external network doesn't exist. No rollback state is required
// because nothing was created yet.
func TestDeployExternalNetworkMissing(t *testing.T) {
	mock := &dockerMock{existingNetworks: map[string]struct{}{}}
	stackObj := &Stack{ID: "sid", Name: "mystack"}
	project, _, err := ParseAndValidate(
		context.Background(), "mystack",
		`services:
  web:
    image: nginx
    networks: [shared]
networks:
  shared:
    external: true
    name: preexisting
`, "", nil,
	)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	err = Deploy(context.Background(), &DeployRequest{
		Stack:   stackObj,
		Project: project,
		Docker:  mock,
	})
	if err == nil {
		t.Fatal("expected external-missing error")
	}
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != ErrNetworkExternalMissing {
		t.Errorf("code = %v, want %s", err, ErrNetworkExternalMissing)
	}
	if len(mock.createdContainers) != 0 {
		t.Errorf("should not have created containers, got %v", mock.createdContainers)
	}
}

// TestDeployContainerFailureRollsBack: image pull succeeds on both services,
// but the second CreateAndStart fails — we should see the first container
// and the default network removed.
func TestTranslateHealthcheckDisabled(t *testing.T) {
	hc := &types.HealthCheckConfig{Disable: true}
	got := translateHealthcheckCompose(hc)
	if got == nil || len(got.Test) != 1 || got.Test[0] != "NONE" {
		t.Errorf("got %+v, want Test=[NONE]", got)
	}
}

func TestTranslateHealthcheckFullSpec(t *testing.T) {
	d := types.Duration(10 * 1e9) // 10s
	retries := uint64(3)
	hc := &types.HealthCheckConfig{
		Test:        []string{"CMD", "curl", "-f", "http://localhost"},
		Interval:    &d,
		Timeout:     &d,
		Retries:     &retries,
		StartPeriod: &d,
	}
	got := translateHealthcheckCompose(hc)
	if got == nil {
		t.Fatal("nil")
	}
	if got.Retries != 3 {
		t.Errorf("retries = %d", got.Retries)
	}
	if got.Test[0] != "CMD" {
		t.Errorf("test = %v", got.Test)
	}
}

func TestTranslateHealthcheckNil(t *testing.T) {
	if got := translateHealthcheckCompose(nil); got != nil {
		t.Errorf("nil input should produce nil output, got %+v", got)
	}
}

func TestStrongerCondition(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{CondHealthy, CondStarted, true},
		{CondStarted, CondHealthy, false},
		{CondCompletedOK, CondHealthy, true},
		{CondStarted, CondStarted, false},
	}
	for _, c := range cases {
		if got := strongerCondition(c.a, c.b); got != c.want {
			t.Errorf("stronger(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestTranslateTmpfs(t *testing.T) {
	got := translateTmpfs(types.StringList{"/tmp", "/run:size=64m,noexec"})
	if got["/tmp"] != "" {
		t.Errorf("/tmp = %q", got["/tmp"])
	}
	if got["/run"] != "size=64m,noexec" {
		t.Errorf("/run = %q", got["/run"])
	}
}

func TestNanoCPUs(t *testing.T) {
	if nanoCPUs(0) != 0 {
		t.Error("zero should be 0")
	}
	if nanoCPUs(1.5) != 1_500_000_000 {
		t.Errorf("1.5 → %d", nanoCPUs(1.5))
	}
}

func TestDeployContainerFailureRollsBack(t *testing.T) {
	mock := &dockerMock{
		createErrAfter: 1, // first create ok, second fails
	}
	stackObj := &Stack{ID: "sid", Name: "mystack"}
	project, _, err := ParseAndValidate(
		context.Background(), "mystack",
		`services:
  a:
    image: nginx
  b:
    image: redis
`, "", nil,
	)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	err = Deploy(context.Background(), &DeployRequest{
		Stack: stackObj, Project: project, Docker: mock,
	})
	if err == nil {
		t.Fatal("expected failure")
	}
	if mock.removedContainers < 1 {
		t.Errorf("expected ≥1 container rollback, got %d", mock.removedContainers)
	}
	if mock.removedNetworks < 1 {
		t.Errorf("expected ≥1 network rollback, got %d", mock.removedNetworks)
	}
}
