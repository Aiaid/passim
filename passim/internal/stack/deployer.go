package stack

import (
	"context"
	"fmt"
	"io"
	"maps"
	"sort"
	"strings"

	"github.com/compose-spec/compose-go/v2/types"
	"github.com/passim/passim/internal/docker"
)

// DeployRequest carries everything the Phase-1 deployer needs.
type DeployRequest struct {
	Stack        *Stack
	Project      *types.Project
	Docker       docker.DockerClient
	DataDir      string
	DataVolume   string
	DataHostPath string
}

// Deploy brings a stack up, running services in the order compose-go
// provides. On any failure it rolls back every container it created,
// so a failed deploy leaves no side effects (all-or-nothing).
//
// Phase 1: no default network, no depends_on, no configs/secrets, no
// healthcheck. Each service is pulled + started independently on the
// Docker daemon's default bridge network.
func Deploy(ctx context.Context, req *DeployRequest) error {
	if req == nil || req.Stack == nil || req.Project == nil || req.Docker == nil {
		return fmt.Errorf("invalid deploy request")
	}

	var rollback []func()
	addRollback := func(fn func()) { rollback = append(rollback, fn) }
	doRollback := func() {
		for i := len(rollback) - 1; i >= 0; i-- {
			rollback[i]()
		}
	}

	// Deterministic order so parallel Phase-2 rewrites don't flip behavior.
	svcNames := make([]string, 0, len(req.Project.Services))
	for name := range req.Project.Services {
		svcNames = append(svcNames, name)
	}
	sort.Strings(svcNames)

	for _, name := range svcNames {
		svc := req.Project.Services[name]
		cfg, err := TranslateService(req.Stack, svc, req.DataDir, req.DataVolume, req.DataHostPath)
		if err != nil {
			doRollback()
			return fmt.Errorf("translate service %s: %w", name, err)
		}

		reader, err := req.Docker.PullImage(ctx, svc.Image)
		if err != nil {
			doRollback()
			return fmt.Errorf("pull image %s: %w", svc.Image, err)
		}
		if reader != nil {
			io.Copy(io.Discard, reader)
			reader.Close()
		}

		containerID, err := req.Docker.CreateAndStartContainer(ctx, cfg)
		if err != nil {
			doRollback()
			return fmt.Errorf("start service %s: %w", name, err)
		}
		id := containerID
		addRollback(func() {
			// Background context so rollback finishes even if the parent
			// context was cancelled.
			_ = req.Docker.RemoveContainer(context.Background(), id)
		})
	}
	return nil
}

// TearDown removes every container that carries the stack's passim label.
// It tolerates partial success (best-effort removal), returning a joined
// error describing anything it couldn't clean up.
func TearDown(ctx context.Context, client docker.DockerClient, stackName string) error {
	all, err := client.ListContainers(ctx)
	if err != nil {
		return fmt.Errorf("list containers: %w", err)
	}
	var errs []string
	for _, c := range all {
		if c.Labels[LabelStackName] != stackName {
			continue
		}
		if err := client.RemoveContainer(ctx, c.ID); err != nil {
			errs = append(errs, fmt.Sprintf("remove %s: %v", c.ID, err))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("tear down: %s", strings.Join(errs, "; "))
	}
	return nil
}

// TranslateService converts a compose-go ServiceConfig into the Passim
// Docker layer's ContainerConfig. Phase-1 scope: image / env / ports /
// volumes / restart / labels / command / entrypoint / expose / cap_add /
// cap_drop / sysctls / extra_hosts / user / working_dir / tty / stdin_open.
// Other fields are ignored at this phase (they become supported in later
// phases as ContainerConfig itself grows).
func TranslateService(s *Stack, svc types.ServiceConfig, dataDir, dataVolume, dataHostPath string) (*docker.ContainerConfig, error) {
	labels := ContainerLabels(s.ID, s.Name, svc.Name, 1, svc.Labels)
	cfg := &docker.ContainerConfig{
		Name:         ComposeContainerName(s.Name, svc.Name, 1),
		Image:        svc.Image,
		Env:          translateEnv(svc.Environment),
		Ports:        translatePorts(svc.Ports),
		Volumes:      translateVolumes(svc.Volumes),
		Labels:       labels,
		CapAdd:       svc.CapAdd,
		Sysctls:      translateMapping(svc.Sysctls),
		Cmd:          []string(svc.Command),
		ExtraHosts:   translateExtraHosts(svc.ExtraHosts),
		RestartPolicy: translateRestart(svc.Restart),
		DataDir:      dataDir,
		DataVolume:   dataVolume,
		DataHostPath: dataHostPath,
	}
	return cfg, nil
}

// ComposeContainerName produces the "<project>_<service>_<n>" form that
// compose CLI itself generates, so `docker compose -p <name> ps` shows
// them in the familiar layout.
func ComposeContainerName(stackName, serviceName string, containerNumber int) string {
	return fmt.Sprintf("%s_%s_%d", stackName, serviceName, containerNumber)
}

// translateEnv converts compose MappingWithEquals (map[string]*string) into
// the "KEY=VALUE" slice Docker SDK expects. A nil value (compose "pass-through
// from host env") after interpolation means the variable wasn't defined — we
// skip it rather than pass an empty-string override.
func translateEnv(env types.MappingWithEquals) []string {
	if len(env) == 0 {
		return nil
	}
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]string, 0, len(env))
	for _, k := range keys {
		v := env[k]
		if v == nil {
			continue
		}
		out = append(out, k+"="+*v)
	}
	return out
}

// translatePorts renders each published port as "host:container[/proto]".
// Ports without a Published (expose-only or "ports: - 80") get skipped in
// Phase 1 — binding an ephemeral host port requires Docker Engine post-
// create inspect support we haven't plumbed yet.
func translatePorts(ports []types.ServicePortConfig) []string {
	if len(ports) == 0 {
		return nil
	}
	out := make([]string, 0, len(ports))
	for _, p := range ports {
		if p.Published == "" || p.Target == 0 {
			continue
		}
		proto := p.Protocol
		if proto == "" {
			proto = "tcp"
		}
		out = append(out, fmt.Sprintf("%s:%d/%s", p.Published, p.Target, proto))
	}
	return out
}

// translateVolumes renders each bind/volume entry as "source:target[:ro]".
// Tmpfs and image types are skipped at Phase 1.
func translateVolumes(vols []types.ServiceVolumeConfig) []string {
	if len(vols) == 0 {
		return nil
	}
	out := make([]string, 0, len(vols))
	for _, v := range vols {
		switch v.Type {
		case "bind", "volume", "":
			spec := v.Source + ":" + v.Target
			if v.ReadOnly {
				spec += ":ro"
			}
			out = append(out, spec)
		default:
			// tmpfs, image, cluster — deferred to later phases
			continue
		}
	}
	return out
}

func translateMapping(m types.Mapping) map[string]string {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]string, len(m))
	maps.Copy(out, m)
	return out
}

// translateExtraHosts converts compose HostsList (map[string][]string) to
// Docker's "host:ip" slice form.
func translateExtraHosts(h types.HostsList) []string {
	if len(h) == 0 {
		return nil
	}
	var out []string
	for host, ips := range h {
		for _, ip := range ips {
			out = append(out, host+":"+ip)
		}
	}
	sort.Strings(out)
	return out
}

// translateRestart maps compose restart policy strings to Docker's. compose
// uses `no` / `always` / `on-failure` / `unless-stopped`; Docker accepts the
// same, so it's a direct passthrough. Empty string leaves daemon default.
func translateRestart(r string) string {
	return r
}
