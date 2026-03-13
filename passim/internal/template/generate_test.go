package template

import (
	"regexp"
	"strconv"
	"testing"
)

func TestGenerateRandomStringLength(t *testing.T) {
	tests := []struct {
		name   string
		length int
		want   int
	}{
		{"default length", 0, 32},
		{"short", 8, 8},
		{"long", 64, 64},
		{"one", 1, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			specs := []GeneratedSpec{
				{Key: "secret", Type: "random_string", Length: tt.length},
			}
			result := GenerateValues(specs)

			got := result["secret"]
			if len(got) != tt.want {
				t.Errorf("len = %d, want %d", len(got), tt.want)
			}

			// Should only contain alphanumeric characters
			if !regexp.MustCompile(`^[a-zA-Z0-9]+$`).MatchString(got) {
				t.Errorf("contains non-alphanumeric characters: %q", got)
			}
		})
	}
}

func TestGenerateRandomStringUniqueness(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "a", Type: "random_string", Length: 32},
		{Key: "b", Type: "random_string", Length: 32},
	}
	result := GenerateValues(specs)

	if result["a"] == result["b"] {
		t.Errorf("two random strings should be different (both = %q)", result["a"])
	}
}

func TestGenerateUUIDFormat(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "id", Type: "uuid_v4"},
	}
	result := GenerateValues(specs)

	uuid := result["id"]
	// UUID v4 format: 8-4-4-4-12 hex chars
	uuidRegex := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	if !uuidRegex.MatchString(uuid) {
		t.Errorf("UUID format invalid: %q", uuid)
	}
}

func TestGenerateUUIDUniqueness(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "a", Type: "uuid_v4"},
		{Key: "b", Type: "uuid_v4"},
	}
	result := GenerateValues(specs)

	if result["a"] == result["b"] {
		t.Errorf("two UUIDs should be different (both = %q)", result["a"])
	}
}

func TestGenerateRandomPort(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "port", Type: "random_port"},
	}
	result := GenerateValues(specs)

	portStr := result["port"]
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("port is not a number: %q", portStr)
	}

	// Port should be in valid range (1-65535), and typically > 1024 for unprivileged
	if port < 1 || port > 65535 {
		t.Errorf("port %d is out of valid range", port)
	}
}

func TestGenerateRandomPortUnique(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "a", Type: "random_port"},
		{Key: "b", Type: "random_port"},
	}
	result := GenerateValues(specs)

	// Ports should usually be different (not guaranteed, but very likely)
	// We just check they're both valid
	for _, key := range []string{"a", "b"} {
		port, err := strconv.Atoi(result[key])
		if err != nil {
			t.Fatalf("%s is not a number: %q", key, result[key])
		}
		if port < 1 || port > 65535 {
			t.Errorf("%s port %d is out of range", key, port)
		}
	}
}

func TestGenerateUnknownType(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "x", Type: "unknown_type"},
	}
	result := GenerateValues(specs)

	if result["x"] != "" {
		t.Errorf("unknown type should produce empty string, got %q", result["x"])
	}
}

func TestGenerateMultipleSpecs(t *testing.T) {
	specs := []GeneratedSpec{
		{Key: "secret", Type: "random_string", Length: 16},
		{Key: "id", Type: "uuid_v4"},
		{Key: "port", Type: "random_port"},
	}
	result := GenerateValues(specs)

	if len(result) != 3 {
		t.Fatalf("len = %d, want 3", len(result))
	}
	if _, ok := result["secret"]; !ok {
		t.Error("missing key 'secret'")
	}
	if _, ok := result["id"]; !ok {
		t.Error("missing key 'id'")
	}
	if _, ok := result["port"]; !ok {
		t.Error("missing key 'port'")
	}
}
