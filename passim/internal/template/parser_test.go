package template

import (
	"testing"
)

func TestParseCompleteYAML(t *testing.T) {
	yaml := `
name: wireguard
category: vpn
version: 1.0.0
icon: shield
description:
  en-US: "Peer-to-peer VPN using WireGuard protocol"
  zh-CN: "基于 WireGuard 协议的点对点 VPN"
source:
  url: https://github.com/linuxserver/docker-wireguard
  license: GPL-2.0
guide:
  setup:
    en-US: "Configure peers and download config files"
  usage:
    en-US: "Import the config file into your WireGuard client"
limitations:
  - "Requires NET_ADMIN capability"
  - "Kernel module needed on host"
settings:
  - key: peers
    type: number
    min: 1
    max: 25
    default: 1
    required: true
    label:
      en-US: "Number of Peers"
      zh-CN: "对等节点数"
    description:
      en-US: "How many peer configs to generate"
  - key: dns
    type: string
    default: "1.1.1.1"
    advanced: true
    pattern: "^[0-9.]+$"
    label:
      en-US: "DNS Server"
  - key: protocol
    type: select
    default: udp
    options:
      - value: udp
        label:
          en-US: UDP
      - value: tcp
        label:
          en-US: TCP
    label:
      en-US: "Protocol"
container:
  image: linuxserver/wireguard
  ports:
    - "51820:51820/udp"
  volumes:
    - "/data/configs/wireguard:/config"
  environment:
    PEERS: "{{settings.peers}}"
  labels:
    io.passim: vpn
    io.passim.app: wireguard
  cap_add:
    - NET_ADMIN
    - SYS_MODULE
  sysctls:
    net.ipv4.conf.all.src_valid_mark: "1"
  args:
    - "--debug"
config:
  files:
    - path: /data/configs/wireguard/wg0.conf
      template: |
        [Interface]
        DNS = {{settings.dns}}
hooks:
  post_start:
    - exec: "echo started"
      timeout: 30
  pre_stop:
    - exec: "echo stopping"
clients:
  web:
    url: "http://localhost:51821"
    label:
      en-US: "WireGuard UI"
config_export:
  format: conf
  path: /data/configs/wireguard/wg_confs/
  pattern: "peer*.conf"
`

	tmpl, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("Parse() error: %v", err)
	}

	// Basic fields
	if tmpl.Name != "wireguard" {
		t.Errorf("Name = %q, want %q", tmpl.Name, "wireguard")
	}
	if tmpl.Category != "vpn" {
		t.Errorf("Category = %q, want %q", tmpl.Category, "vpn")
	}
	if tmpl.Version != "1.0.0" {
		t.Errorf("Version = %q, want %q", tmpl.Version, "1.0.0")
	}
	if tmpl.Icon != "shield" {
		t.Errorf("Icon = %q, want %q", tmpl.Icon, "shield")
	}

	// Description
	if tmpl.Description["en-US"] != "Peer-to-peer VPN using WireGuard protocol" {
		t.Errorf("Description[en-US] = %q", tmpl.Description["en-US"])
	}

	// Source
	if tmpl.Source == nil {
		t.Fatal("Source is nil")
	}
	if tmpl.Source.URL != "https://github.com/linuxserver/docker-wireguard" {
		t.Errorf("Source.URL = %q", tmpl.Source.URL)
	}
	if tmpl.Source.License != "GPL-2.0" {
		t.Errorf("Source.License = %q", tmpl.Source.License)
	}

	// Guide
	if tmpl.Guide == nil {
		t.Fatal("Guide is nil")
	}
	if tmpl.Guide.Setup["en-US"] != "Configure peers and download config files" {
		t.Errorf("Guide.Setup[en-US] = %q", tmpl.Guide.Setup["en-US"])
	}

	// Limitations
	if len(tmpl.Limitations) != 2 {
		t.Fatalf("len(Limitations) = %d, want 2", len(tmpl.Limitations))
	}

	// Settings
	if len(tmpl.Settings) != 3 {
		t.Fatalf("len(Settings) = %d, want 3", len(tmpl.Settings))
	}

	peers := tmpl.Settings[0]
	if peers.Key != "peers" {
		t.Errorf("Settings[0].Key = %q", peers.Key)
	}
	if peers.Required == nil || !*peers.Required {
		t.Errorf("Settings[0].Required should be true")
	}
	if peers.Min == nil || *peers.Min != 1 {
		t.Errorf("Settings[0].Min = %v", peers.Min)
	}
	if peers.Max == nil || *peers.Max != 25 {
		t.Errorf("Settings[0].Max = %v", peers.Max)
	}
	if peers.Description["en-US"] != "How many peer configs to generate" {
		t.Errorf("Settings[0].Description[en-US] = %q", peers.Description["en-US"])
	}

	dns := tmpl.Settings[1]
	if !dns.Advanced {
		t.Errorf("Settings[1].Advanced should be true")
	}
	if dns.Pattern != "^[0-9.]+$" {
		t.Errorf("Settings[1].Pattern = %q", dns.Pattern)
	}

	proto := tmpl.Settings[2]
	if len(proto.Options) != 2 {
		t.Fatalf("Settings[2].Options len = %d, want 2", len(proto.Options))
	}
	if proto.Options[0].Value != "udp" {
		t.Errorf("Settings[2].Options[0].Value = %v", proto.Options[0].Value)
	}

	// Container
	if tmpl.Container.Image != "linuxserver/wireguard" {
		t.Errorf("Container.Image = %q", tmpl.Container.Image)
	}
	if len(tmpl.Container.CapAdd) != 2 {
		t.Errorf("Container.CapAdd len = %d", len(tmpl.Container.CapAdd))
	}
	if len(tmpl.Container.Args) != 1 {
		t.Errorf("Container.Args len = %d, want 1", len(tmpl.Container.Args))
	}

	// Config
	if tmpl.Config == nil {
		t.Fatal("Config is nil")
	}
	if len(tmpl.Config.Files) != 1 {
		t.Fatalf("Config.Files len = %d, want 1", len(tmpl.Config.Files))
	}

	// Hooks
	if tmpl.Hooks == nil {
		t.Fatal("Hooks is nil")
	}
	if len(tmpl.Hooks.PostStart) != 1 {
		t.Fatalf("Hooks.PostStart len = %d, want 1", len(tmpl.Hooks.PostStart))
	}
	if tmpl.Hooks.PostStart[0].Timeout != 30 {
		t.Errorf("Hooks.PostStart[0].Timeout = %d", tmpl.Hooks.PostStart[0].Timeout)
	}

	// Clients
	if tmpl.Clients == nil {
		t.Fatal("Clients is nil")
	}
	if tmpl.Clients.Web == nil {
		t.Fatal("Clients.Web is nil")
	}
	if tmpl.Clients.Web.URL != "http://localhost:51821" {
		t.Errorf("Clients.Web.URL = %q", tmpl.Clients.Web.URL)
	}

	// ConfigExport
	if tmpl.ConfigExport == nil {
		t.Fatal("ConfigExport is nil")
	}
	if tmpl.ConfigExport.Format != "conf" {
		t.Errorf("ConfigExport.Format = %q", tmpl.ConfigExport.Format)
	}
}

func TestParseMinimalYAML(t *testing.T) {
	yaml := `
name: minimal
category: test
version: 0.1.0
icon: box
description:
  en-US: "A minimal template"
container:
  image: alpine:latest
`

	tmpl, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("Parse() error: %v", err)
	}

	if tmpl.Name != "minimal" {
		t.Errorf("Name = %q, want %q", tmpl.Name, "minimal")
	}
	if tmpl.Container.Image != "alpine:latest" {
		t.Errorf("Container.Image = %q", tmpl.Container.Image)
	}

	// Optional fields should be nil/empty
	if tmpl.Source != nil {
		t.Error("Source should be nil")
	}
	if tmpl.Guide != nil {
		t.Error("Guide should be nil")
	}
	if len(tmpl.Limitations) != 0 {
		t.Error("Limitations should be empty")
	}
	if len(tmpl.Settings) != 0 {
		t.Error("Settings should be empty")
	}
	if tmpl.Config != nil {
		t.Error("Config should be nil")
	}
	if tmpl.Hooks != nil {
		t.Error("Hooks should be nil")
	}
	if tmpl.Clients != nil {
		t.Error("Clients should be nil")
	}
	if tmpl.ConfigExport != nil {
		t.Error("ConfigExport should be nil")
	}
}

func TestParseInvalidYAML(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{
			name:  "garbage",
			input: "{{{{not yaml at all",
		},
		{
			name:  "missing name",
			input: "category: vpn\nversion: 1.0.0\n",
		},
		{
			name:  "bad indentation",
			input: "name: test\n  bad:\n indentation\n:\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse([]byte(tt.input))
			if err == nil {
				t.Error("Parse() should have returned an error")
			}
		})
	}
}
