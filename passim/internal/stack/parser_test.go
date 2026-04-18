package stack

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func mustFail(t *testing.T, yaml string, wantCode ErrorCode) {
	t.Helper()
	_, _, err := ParseAndValidate(context.Background(), "test", yaml, "", nil)
	if err == nil {
		t.Fatalf("expected error %s, got nil", wantCode)
	}
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %T: %v", err, err)
	}
	if ve.Code != wantCode {
		t.Errorf("code = %q, want %q (msg=%s)", ve.Code, wantCode, ve.Message)
	}
}

func mustPass(t *testing.T, yaml string) {
	t.Helper()
	_, _, err := ParseAndValidate(context.Background(), "test", yaml, "", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseMinimal(t *testing.T) {
	mustPass(t, `
services:
  web:
    image: nginx:alpine
    ports: ["8080:80"]
`)
}

func TestParseMultiService(t *testing.T) {
	proj, warns, err := ParseAndValidate(context.Background(), "test", `
services:
  web:
    image: nginx
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: hunter2
`, "", nil)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(proj.Services) != 2 {
		t.Errorf("services = %d", len(proj.Services))
	}
	if len(warns) != 0 {
		t.Errorf("unexpected warnings: %v", warns)
	}
}

func TestRejectBuild(t *testing.T) {
	mustFail(t, `
services:
  web:
    build: ./app
`, ErrBuildNotSupported)
}

func TestRejectEnvFile(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
    env_file:
      - ./app.env
`, ErrEnvFileNotSupported)
}

func TestRejectExtendsFile(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
    extends:
      file: other.yaml
      service: base
`, ErrExtendsExternalFileNotSupported)
}

func TestRejectConfigsExternal(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
configs:
  cfg:
    external: true
    name: my-config
`, ErrConfigsExternalNotSupported)
}

func TestRejectSecretsExternal(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
secrets:
  s:
    external: true
    name: my-secret
`, ErrSecretsExternalNotSupported)
}

func TestRejectUnsupportedLoggingDriver(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
    logging:
      driver: syslog
`, ErrUnsupportedLoggingDriver)
}

func TestRejectUnknownLoggingOption(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
    logging:
      driver: json-file
      options:
        syslog-address: tcp://localhost
`, ErrUnsupportedLoggingDriver)
}

func TestAcceptLoggingWhitelist(t *testing.T) {
	mustPass(t, `
services:
  web:
    image: nginx
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
`)
	mustPass(t, `
services:
  web:
    image: nginx
    logging:
      driver: local
      options:
        compress: "true"
`)
}

func TestRejectUnsupportedNetworkDriver(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
networks:
  custom:
    driver: overlay
`, ErrUnsupportedNetworkDriver)
}

func TestRejectUnsupportedVolumeDriver(t *testing.T) {
	mustFail(t, `
services:
  web:
    image: nginx
    volumes:
      - data:/var/lib/data
volumes:
  data:
    driver: nfs
`, ErrUnsupportedVolumeDriver)
}

func TestRejectMissingImage(t *testing.T) {
	// build is already rejected; this covers the "no image AND no build" case.
	mustFail(t, `
services:
  web:
    command: ["echo"]
`, ErrBuildNotSupported)
}

func TestDeployEmitsWarning(t *testing.T) {
	_, warns, err := ParseAndValidate(context.Background(), "test", `
services:
  web:
    image: nginx
    deploy:
      replicas: 3
`, "", nil)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(warns) == 0 {
		t.Fatal("expected deploy warning")
	}
	if warns[0].Code != "stack.deploy_ignored" {
		t.Errorf("code = %q", warns[0].Code)
	}
}

func TestNormalizeName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Immich", "immich"},
		{"Immich Stack", "immich-stack"},
		{"  MyApp/v2  ", "myapp-v2"},
		{"kebab-case", "kebab-case"},
		{"snake_case", "snake_case"},
		{"UPPER", "upper"},
		{"-leading-dash", "leading-dash"},
	}
	for _, tc := range cases {
		if got := NormalizeName(tc.in); got != tc.want {
			t.Errorf("NormalizeName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestValidateName(t *testing.T) {
	good := []string{"a", "a1", "immich", "paperless-ngx", "n8n_stack"}
	for _, n := range good {
		if err := ValidateName(n); err != nil {
			t.Errorf("ValidateName(%q) unexpected: %v", n, err)
		}
	}
	bad := []string{"", "-start", "with space", "UPPER", "over" + strings.Repeat("x", 70)}
	for _, n := range bad {
		if err := ValidateName(n); err == nil {
			t.Errorf("ValidateName(%q) should fail", n)
		}
	}
}

func TestParseEnvText(t *testing.T) {
	env, err := ParseEnvText(`
# comment
FOO=bar
BAZ="quoted value"
EMPTY=
WITH_EQUALS=a=b=c
`)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if env["FOO"] != "bar" {
		t.Errorf("FOO = %q", env["FOO"])
	}
	if env["BAZ"] != "quoted value" {
		t.Errorf("BAZ = %q", env["BAZ"])
	}
	if env["EMPTY"] != "" {
		t.Errorf("EMPTY = %q", env["EMPTY"])
	}
	if env["WITH_EQUALS"] != "a=b=c" {
		t.Errorf("WITH_EQUALS = %q", env["WITH_EQUALS"])
	}
}

func TestEnvInterpolation(t *testing.T) {
	proj, _, err := ParseAndValidate(context.Background(), "test", `
services:
  web:
    image: nginx:${NGINX_VERSION}
`, "NGINX_VERSION=1.25", nil)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if proj.Services["web"].Image != "nginx:1.25" {
		t.Errorf("image = %q", proj.Services["web"].Image)
	}
}

func TestInvalidYAML(t *testing.T) {
	mustFail(t, `services: [this is not valid`, ErrYAMLParse)
}

func TestInvalidName(t *testing.T) {
	_, _, err := ParseAndValidate(context.Background(), "Bad Name!", `
services:
  web:
    image: nginx
`, "", nil)
	if err == nil {
		t.Fatal("expected invalid name error")
	}
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != ErrInvalidName {
		t.Errorf("got %v", err)
	}
}
