package stack

import (
	"context"
	"errors"
	"fmt"
	"io"
	"maps"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/compose-spec/compose-go/v2/types"
	"github.com/passim/passim/internal/docker"
)

// DeployRequest carries everything the deployer needs.
type DeployRequest struct {
	Stack        *Stack
	Project      *types.Project
	Docker       docker.DockerClient
	DataDir      string
	DataVolume   string
	DataHostPath string
	// Files is populated by Deploy() after MaterializeFiles succeeds; it
	// carries the host paths per config/secret source so TranslateService
	// can build bind-mount specs. Callers that drive the deployer
	// indirectly leave this nil.
	Files *StackFiles
}

// defaultNetworkName returns "<project>_default", matching what docker
// compose CLI names its implicit network.
func defaultNetworkName(stackName string) string {
	return stackName + "_default"
}

// resolveVolumeName: a top-level `volumes.<key>` becomes "<project>_<key>"
// unless explicitly named (volume.Name) or external. Compose normalizes this
// and puts the result in Volume.Name, but only for non-external entries —
// treat an empty Name as "use the project prefix".
func resolveVolumeName(stackName, key string, v types.VolumeConfig) string {
	if v.Name != "" {
		return v.Name
	}
	return stackName + "_" + key
}

// resolveNetworkName: same logic as volumes, but for networks.
func resolveNetworkName(stackName, key string, n types.NetworkConfig) string {
	if n.Name != "" {
		return n.Name
	}
	return stackName + "_" + key
}

// Deploy brings a stack up. All-or-nothing: any step failing rolls back every
// side effect this invocation produced.
//
// Phase 2 scope: depends_on short-form (condition=service_started),
// top-level networks / volumes (incl. external: true), default
// "<project>_default" network. Healthcheck / service_healthy /
// service_completed_successfully come in phase 3.
func Deploy(ctx context.Context, req *DeployRequest) error {
	if req == nil || req.Stack == nil || req.Project == nil || req.Docker == nil {
		return fmt.Errorf("invalid deploy request")
	}
	p := req.Project

	if err := mergeNetworkModeDependency(p); err != nil {
		return err
	}
	topo, err := BuildTopology(p)
	if err != nil {
		return err
	}

	rb := &rollbackStack{}
	defer func() {
		if r := recover(); r != nil {
			rb.run()
			panic(r)
		}
	}()

	// 1. Materialize configs / secrets. Files land on disk before any
	// container is started so bind mounts exist when Docker resolves them.
	files, err := MaterializeFiles(req.DataDir, req.Stack, p)
	if err != nil {
		return err
	}
	if files.RootDir != "" {
		stackName := req.Stack.Name
		dataDir := req.DataDir
		rb.push(func() { _ = RemoveStackFiles(dataDir, stackName) })
	}

	// 2. Top-level networks (incl. the implicit <project>_default).
	netNames, err := ensureNetworks(ctx, req, rb)
	if err != nil {
		rb.run()
		return err
	}

	// 3. Top-level volumes.
	if err := ensureVolumes(ctx, req, rb); err != nil {
		rb.run()
		return err
	}

	// 4. Pull images (parallel).
	if err := pullImages(ctx, req); err != nil {
		rb.run()
		return err
	}

	// 5. Start containers by topological layer. Map of service → container id
	// so network_mode: service:<x> can be rewritten to container:<id>.
	started := make(map[string]string, len(p.Services))
	var startedMu sync.Mutex
	req.Files = files

	for _, layer := range topo.Layers {
		if err := startLayer(ctx, req, layer, netNames, started, &startedMu, rb); err != nil {
			rb.run()
			return err
		}
		// After every service in this layer has started, wait for the
		// conditions each *next-layer* service demands. We wait here (not
		// inside startLayer) so parallel starters in a layer don't block
		// each other — only downstream layers wait.
		if err := awaitLayerConditions(ctx, req, topo, layer, started, &startedMu); err != nil {
			rb.run()
			return err
		}
	}
	return nil
}

// ConditionTimeout caps how long we wait for any single depends_on
// condition. compose has no universal default; Passim's choice is a
// generous 2 minutes, enough for most DB bring-ups without hanging
// deploy indefinitely on a wedged healthcheck.
const ConditionTimeout = 2 * time.Minute

// awaitLayerConditions inspects every service that depends on something in
// the just-started layer and blocks until that dependency reaches the
// compose-declared condition (service_started is already satisfied by
// start; healthy and completed_successfully need polling).
func awaitLayerConditions(
	ctx context.Context,
	req *DeployRequest,
	topo *Topology,
	layer []string,
	started map[string]string,
	startedMu *sync.Mutex,
) error {
	justStarted := make(map[string]struct{}, len(layer))
	for _, s := range layer {
		justStarted[s] = struct{}{}
	}

	// For each service *anywhere* in the project, look at its deps — if any
	// dep is in this layer and requires healthy/completed, we need to wait
	// before moving on. We key the wait on the dep itself so each dep is
	// awaited exactly once per deploy.
	waits := make(map[string]string) // dep-service → condition
	for _, deps := range topo.Dependencies {
		for _, d := range deps {
			if _, ok := justStarted[d.Service]; !ok {
				continue
			}
			// started is satisfied by the time we got here.
			if d.Condition == CondStarted {
				continue
			}
			// Upgrade to the strongest condition if multiple callers demand
			// different things (healthy > started, completed independent).
			existing, seen := waits[d.Service]
			if !seen || strongerCondition(d.Condition, existing) {
				waits[d.Service] = d.Condition
			}
		}
	}
	if len(waits) == 0 {
		return nil
	}

	type result struct {
		service string
		err     error
	}
	results := make(chan result, len(waits))
	for svc, cond := range waits {
		startedMu.Lock()
		cid, ok := started[svc]
		startedMu.Unlock()
		if !ok {
			return fmt.Errorf("condition wait: service %s has no container", svc)
		}
		go func(svc, cond, cid string) {
			waitCtx, cancel := context.WithTimeout(ctx, ConditionTimeout)
			defer cancel()
			err := waitForCondition(waitCtx, req.Docker, cid, cond)
			if err != nil {
				results <- result{service: svc, err: fmt.Errorf("service %s %s: %w", svc, cond, err)}
				return
			}
			results <- result{service: svc}
		}(svc, cond, cid)
	}
	var firstErr error
	for range waits {
		r := <-results
		if r.err != nil && firstErr == nil {
			firstErr = r.err
		}
	}
	return firstErr
}

func strongerCondition(a, b string) bool {
	rank := func(c string) int {
		switch c {
		case CondStarted:
			return 1
		case CondHealthy:
			return 2
		case CondCompletedOK:
			return 3
		default:
			return 0
		}
	}
	return rank(a) > rank(b)
}

// waitForCondition polls the container until it matches the requested
// condition. service_healthy requires the container's HEALTHCHECK to report
// "healthy"; service_completed_successfully requires the container to exit
// with code 0. Context cancellation (usually the ConditionTimeout) surfaces
// as an informative error so the deploy-level rollback knows why it fired.
func waitForCondition(ctx context.Context, client docker.DockerClient, containerID, cond string) error {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		info, err := client.InspectContainer(ctx, containerID)
		if err != nil {
			return fmt.Errorf("inspect: %w", err)
		}
		switch cond {
		case CondHealthy:
			if info.State == nil {
				// nothing yet
			} else if info.State.Health != nil {
				switch info.State.Health.Status {
				case "healthy":
					return nil
				case "unhealthy":
					return fmt.Errorf("healthcheck reported unhealthy")
				}
			} else if !info.State.Running {
				return fmt.Errorf("container stopped before becoming healthy (exit %d)", info.State.ExitCode)
			} else {
				// No healthcheck defined but condition asked for healthy —
				// Docker fills Health when a HEALTHCHECK exists. Treat
				// missing healthcheck as an error so the user fixes the
				// compose file.
				return fmt.Errorf("service has no healthcheck configured")
			}
		case CondCompletedOK:
			if info.State == nil {
				// keep waiting
			} else if info.State.Running {
				// keep waiting
			} else if info.State.Status == "exited" {
				if info.State.ExitCode == 0 {
					return nil
				}
				return fmt.Errorf("container exited with code %d", info.State.ExitCode)
			} else if info.State.Dead {
				return fmt.Errorf("container dead")
			}
		default:
			return fmt.Errorf("unknown condition %q", cond)
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout waiting for %s", cond)
		case <-ticker.C:
		}
	}
}

// ensureNetworks creates every top-level network the stack declares, plus a
// <project>_default for services that don't name a network explicitly. For
// external networks it verifies existence. Returns the set of top-level
// network **names** (post-resolution) keyed by compose network key, so
// startLayer can translate `services.x.networks.<key>` into real names.
func ensureNetworks(ctx context.Context, req *DeployRequest, rb *rollbackStack) (map[string]string, error) {
	p := req.Project
	stackName := req.Stack.Name

	result := make(map[string]string, len(p.Networks)+1)

	// Collect key → config pairs in deterministic order.
	keys := make([]string, 0, len(p.Networks))
	for k := range p.Networks {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, key := range keys {
		cfg := p.Networks[key]
		name := resolveNetworkName(stackName, key, cfg)
		result[key] = name

		if bool(cfg.External) {
			exists, err := req.Docker.NetworkExists(ctx, name)
			if err != nil {
				return nil, fmt.Errorf("check external network %s: %w", name, err)
			}
			if !exists {
				return nil, verr(ErrNetworkExternalMissing,
					"external network %q does not exist", name)
			}
			continue
		}

		driver := cfg.Driver
		if driver == "" {
			driver = "bridge"
		}
		opts := docker.NetworkCreateOpts{
			Driver:   driver,
			Labels:   NetworkLabels(req.Stack.ID, stackName, key),
			Internal: cfg.Internal,
		}
		if err := req.Docker.CreateNetwork(ctx, name, opts); err != nil {
			return nil, fmt.Errorf("create network %s: %w", name, err)
		}
		created := name
		rb.push(func() { _ = req.Docker.RemoveNetwork(context.Background(), created) })
	}

	// Implicit default network — every stack gets one so services can talk by
	// DNS name without declaring a network block.
	if _, hasDefault := result["default"]; !hasDefault {
		name := defaultNetworkName(stackName)
		opts := docker.NetworkCreateOpts{
			Driver: "bridge",
			Labels: NetworkLabels(req.Stack.ID, stackName, "default"),
		}
		if err := req.Docker.CreateNetwork(ctx, name, opts); err != nil {
			return nil, fmt.Errorf("create default network %s: %w", name, err)
		}
		result["default"] = name
		rb.push(func() { _ = req.Docker.RemoveNetwork(context.Background(), name) })
	}
	return result, nil
}

// ensureVolumes mirrors ensureNetworks for top-level volumes.
func ensureVolumes(ctx context.Context, req *DeployRequest, rb *rollbackStack) error {
	p := req.Project
	stackName := req.Stack.Name

	keys := make([]string, 0, len(p.Volumes))
	for k := range p.Volumes {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, key := range keys {
		cfg := p.Volumes[key]
		name := resolveVolumeName(stackName, key, cfg)

		if bool(cfg.External) {
			exists, err := req.Docker.VolumeExists(ctx, name)
			if err != nil {
				return fmt.Errorf("check external volume %s: %w", name, err)
			}
			if !exists {
				return verr(ErrVolumeExternalMissing,
					"external volume %q does not exist", name)
			}
			continue
		}

		driver := cfg.Driver
		if driver == "" {
			driver = "local"
		}
		opts := docker.VolumeCreateOpts{
			Driver:     driver,
			Labels:     VolumeLabels(req.Stack.ID, stackName, key),
			DriverOpts: cfg.DriverOpts,
		}
		if err := req.Docker.CreateVolume(ctx, name, opts); err != nil {
			return fmt.Errorf("create volume %s: %w", name, err)
		}
		created := name
		rb.push(func() { _ = req.Docker.RemoveVolume(context.Background(), created) })
	}
	return nil
}

// pullImages pulls every service's image in parallel and drains the progress
// stream. Returns on the first error; images already pulled stay on disk
// (the rollback doesn't remove them — they're shared and cheap).
func pullImages(ctx context.Context, req *DeployRequest) error {
	var wg sync.WaitGroup
	errCh := make(chan error, len(req.Project.Services))

	for _, svc := range req.Project.Services {
		wg.Add(1)
		go func(image string) {
			defer wg.Done()
			reader, err := req.Docker.PullImage(ctx, image)
			if err != nil {
				errCh <- fmt.Errorf("pull image %s: %w", image, err)
				return
			}
			if reader != nil {
				_, _ = io.Copy(io.Discard, reader)
				_ = reader.Close()
			}
		}(svc.Image)
	}
	wg.Wait()
	close(errCh)

	var errs []string
	for e := range errCh {
		errs = append(errs, e.Error())
	}
	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

// startLayer creates and starts every service in a topology layer in parallel,
// then connects each container to its declared networks. All operations feed
// the rollback stack so a failure cleans up everything this invocation has
// created so far.
func startLayer(
	ctx context.Context,
	req *DeployRequest,
	layer []string,
	netNames map[string]string,
	started map[string]string,
	startedMu *sync.Mutex,
	rb *rollbackStack,
) error {
	type result struct {
		service     string
		containerID string
		err         error
	}

	results := make(chan result, len(layer))
	for _, svcName := range layer {
		go func(name string) {
			svc := req.Project.Services[name]
			cfg, err := TranslateService(req.Stack, svc, req.DataDir, req.DataVolume, req.DataHostPath)
			if err != nil {
				results <- result{service: name, err: err}
				return
			}
			// Append config/secret bind mounts. TranslateService stays
			// files-ignorant so it can be used in tests without a disk.
			if req.Files != nil {
				for _, ref := range svc.Configs {
					if spec := ConfigMountSpec(req.Files, ref); spec != "" {
						cfg.Volumes = append(cfg.Volumes, spec)
					}
				}
				for _, ref := range svc.Secrets {
					if spec := SecretMountSpec(req.Files, ref); spec != "" {
						cfg.Volumes = append(cfg.Volumes, spec)
					}
				}
			}
			// Resolve network_mode: service:<x> → container:<id>.
			if target, ok := serviceNetworkMode(svc.NetworkMode); ok {
				startedMu.Lock()
				id, present := started[target]
				startedMu.Unlock()
				if !present {
					results <- result{service: name, err: fmt.Errorf(
						"network_mode target %q has no started container (layering bug)", target)}
					return
				}
				cfg.NetworkMode = "container:" + id
			}
			// If NetworkMode takes over, skip our own network attachments.
			// Docker disallows ports/aliases in that mode anyway.
			standalone := cfg.NetworkMode != ""

			id, err := req.Docker.CreateAndStartContainer(ctx, cfg)
			if err != nil {
				results <- result{service: name, err: fmt.Errorf("start %s: %w", name, err)}
				return
			}

			if !standalone {
				if err := attachNetworks(ctx, req, svc, id, netNames); err != nil {
					_ = req.Docker.RemoveContainer(ctx, id)
					results <- result{service: name, err: err}
					return
				}
			}

			results <- result{service: name, containerID: id}
		}(svcName)
	}

	var firstErr error
	for range layer {
		r := <-results
		if r.err != nil {
			if firstErr == nil {
				firstErr = r.err
			}
			continue
		}
		containerID := r.containerID
		rb.push(func() { _ = req.Docker.RemoveContainer(context.Background(), containerID) })
		startedMu.Lock()
		started[r.service] = r.containerID
		startedMu.Unlock()
	}
	return firstErr
}

// attachNetworks connects the container to every network the service
// declares, using the real (post-resolution) network name and the aliases
// compose specifies. Services that don't declare a network block get
// attached to <project>_default with the service name as the DNS alias.
func attachNetworks(
	ctx context.Context,
	req *DeployRequest,
	svc types.ServiceConfig,
	containerID string,
	netNames map[string]string,
) error {
	// CreateAndStartContainer already connects to cfg.NetworkName — we pass
	// empty there and do the attachments here instead so we can control
	// aliases per network. The first connect implicitly disconnects the
	// daemon-default bridge so only our networks remain.
	type attach struct {
		name    string
		aliases []string
	}
	var list []attach

	if len(svc.Networks) == 0 {
		target, ok := netNames["default"]
		if !ok {
			// Shouldn't happen — ensureNetworks always creates default.
			return fmt.Errorf("default network missing for stack")
		}
		list = append(list, attach{name: target, aliases: []string{svc.Name}})
	} else {
		keys := make([]string, 0, len(svc.Networks))
		for k := range svc.Networks {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			target, ok := netNames[k]
			if !ok {
				return fmt.Errorf("service %s references undeclared network %q", svc.Name, k)
			}
			aliases := []string{svc.Name}
			if n := svc.Networks[k]; n != nil {
				// Service name alias always first; merge compose-declared aliases.
				aliases = append(aliases, n.Aliases...)
			}
			list = append(list, attach{name: target, aliases: uniqueStrings(aliases)})
		}
	}

	for _, a := range list {
		if err := req.Docker.ConnectNetwork(ctx, a.name, containerID, a.aliases); err != nil {
			return fmt.Errorf("attach %s to %s: %w", containerID[:12], a.name, err)
		}
	}
	return nil
}

func uniqueStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

// TearDown removes every container, network and volume carrying the stack's
// passim label. Best-effort; the return is an aggregate of anything that
// couldn't be cleaned.
//
// All sweeps are by `passim.stack.id=<uuid>` label, so PUT-rewritten stacks
// still find their original resources even if the new YAML doesn't declare
// them. External networks/volumes never get our label so they're always
// left alone.
func TearDown(ctx context.Context, client docker.DockerClient, stack *Stack, removeVolumes bool) error {
	var errs []string

	all, err := client.ListContainers(ctx)
	if err != nil {
		errs = append(errs, fmt.Sprintf("list containers: %v", err))
	}
	for _, c := range all {
		if c.Labels[LabelStackID] != stack.ID {
			continue
		}
		if err := client.RemoveContainer(ctx, c.ID); err != nil {
			errs = append(errs, fmt.Sprintf("remove container %s: %v", c.ID[:12], err))
		}
	}

	nets, err := client.ListNetworksByLabel(ctx, LabelStackID, stack.ID)
	if err != nil {
		errs = append(errs, fmt.Sprintf("list networks: %v", err))
	}
	for _, name := range nets {
		if err := client.RemoveNetwork(ctx, name); err != nil {
			errs = append(errs, fmt.Sprintf("remove network %s: %v", name, err))
		}
	}

	if removeVolumes {
		vols, err := client.ListVolumesByLabel(ctx, LabelStackID, stack.ID)
		if err != nil {
			errs = append(errs, fmt.Sprintf("list volumes: %v", err))
		}
		for _, name := range vols {
			if err := client.RemoveVolume(ctx, name); err != nil {
				errs = append(errs, fmt.Sprintf("remove volume %s: %v", name, err))
			}
		}
	}

	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

// TearDownWithProject is kept for API compatibility — the label-based
// TearDown no longer needs the parsed project, but callers pass it anyway.
// project is ignored; the signature remains for callsite stability.
func TearDownWithProject(ctx context.Context, client docker.DockerClient, stack *Stack, _ *types.Project, removeVolumes bool) error {
	return TearDown(ctx, client, stack, removeVolumes)
}

// TranslateService converts a compose-go ServiceConfig into the Passim
// Docker layer's ContainerConfig. Network attachment is handled separately
// (see attachNetworks) so this struct stays focused on the container's own
// knobs.
func TranslateService(s *Stack, svc types.ServiceConfig, dataDir, dataVolume, dataHostPath string) (*docker.ContainerConfig, error) {
	labels := ContainerLabels(s.ID, s.Name, svc.Name, 1, svc.Labels)
	cfg := &docker.ContainerConfig{
		Name:          ComposeContainerName(s.Name, svc.Name, 1),
		Image:         svc.Image,
		Env:           translateEnv(svc.Environment),
		Ports:         translatePorts(svc.Ports),
		Volumes:       translateVolumes(svc.Volumes),
		Labels:        labels,
		CapAdd:        svc.CapAdd,
		CapDrop:       svc.CapDrop,
		Sysctls:       translateMapping(svc.Sysctls),
		Cmd:           []string(svc.Command),
		Entrypoint:    []string(svc.Entrypoint),
		ExtraHosts:    translateExtraHosts(svc.ExtraHosts),
		RestartPolicy: translateRestart(svc.Restart),
		Healthcheck:   translateHealthcheckCompose(svc.HealthCheck),
		Tmpfs:         translateTmpfs(svc.Tmpfs),
		Privileged:    svc.Privileged,
		ReadOnly:      svc.ReadOnly,
		User:          svc.User,
		WorkingDir:    svc.WorkingDir,
		Hostname:      svc.Hostname,
		Domainname:    svc.DomainName,
		Tty:           svc.Tty,
		StdinOpen:     svc.StdinOpen,
		Init:          svc.Init,
		PidMode:       svc.Pid,
		IpcMode:       svc.Ipc,
		UTSMode:       svc.Uts,
		ShmSize:       int64(svc.ShmSize),
		MemLimit:      int64(svc.MemLimit),
		NanoCPUs:      nanoCPUs(svc.CPUS),
		DNS:           []string(svc.DNS),
		DNSSearch:     []string(svc.DNSSearch),
		StopSignal:    svc.StopSignal,
		SecurityOpt:   svc.SecurityOpt,
		DataDir:       dataDir,
		DataVolume:    dataVolume,
		DataHostPath:  dataHostPath,
	}
	if svc.StopGracePeriod != nil {
		d := int(time.Duration(*svc.StopGracePeriod).Seconds())
		cfg.StopTimeout = &d
	}
	return cfg, nil
}

// nanoCPUs: compose `cpus: 1.5` → 1_500_000_000 nano CPUs. Matches Docker's
// resource limit unit so the host config can consume it directly.
func nanoCPUs(cpus float32) int64 {
	if cpus <= 0 {
		return 0
	}
	return int64(float64(cpus) * 1e9)
}

// translateHealthcheckCompose maps compose HealthCheckConfig to the Passim
// wrapper. compose's `disable: true` surfaces as Test=["NONE"].
func translateHealthcheckCompose(h *types.HealthCheckConfig) *docker.HealthcheckConfig {
	if h == nil {
		return nil
	}
	if h.Disable {
		return &docker.HealthcheckConfig{Test: []string{"NONE"}}
	}
	if len(h.Test) == 0 {
		return nil
	}
	out := &docker.HealthcheckConfig{Test: []string(h.Test)}
	if h.Interval != nil {
		out.Interval = time.Duration(*h.Interval)
	}
	if h.Timeout != nil {
		out.Timeout = time.Duration(*h.Timeout)
	}
	if h.Retries != nil {
		out.Retries = int(*h.Retries)
	}
	if h.StartPeriod != nil {
		out.StartPeriod = time.Duration(*h.StartPeriod)
	}
	return out
}

// translateTmpfs converts compose StringList ("[target1, target2]" or
// "target:opts") into the docker map[target]opts form.
func translateTmpfs(list types.StringList) map[string]string {
	if len(list) == 0 {
		return nil
	}
	out := make(map[string]string, len(list))
	for _, entry := range list {
		if i := strings.Index(entry, ":"); i >= 0 {
			out[entry[:i]] = entry[i+1:]
		} else {
			out[entry] = ""
		}
	}
	return out
}

// ComposeContainerName produces the "<project>_<service>_<n>" form that
// compose CLI itself generates, so `docker compose -p <name> ps` lists them
// in the familiar layout.
func ComposeContainerName(stackName, serviceName string, containerNumber int) string {
	return fmt.Sprintf("%s_%s_%d", stackName, serviceName, containerNumber)
}

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

func translateRestart(r string) string { return r }

// rollbackStack runs pushed undo functions in LIFO order. It's a tiny helper
// rather than a full transaction manager — deliberate, so each step's undo
// lives next to its do.
type rollbackStack struct {
	actions []func()
}

func (r *rollbackStack) push(fn func()) {
	r.actions = append(r.actions, fn)
}

func (r *rollbackStack) run() {
	for i := len(r.actions) - 1; i >= 0; i-- {
		r.actions[i]()
	}
}
