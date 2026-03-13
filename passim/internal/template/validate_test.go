package template

import (
	"strings"
	"testing"
)

func boolPtr(b bool) *bool { return &b }
func intPtr(i int) *int    { return &i }

func TestValidateSettingsValid(t *testing.T) {
	settings := []Setting{
		{
			Key:  "peers",
			Type: "number",
			Min:  intPtr(1),
			Max:  intPtr(25),
		},
		{
			Key:  "name",
			Type: "string",
		},
		{
			Key:  "debug",
			Type: "boolean",
		},
	}

	values := map[string]interface{}{
		"peers": 5,
		"name":  "wg0",
		"debug": true,
	}

	merged, err := ValidateSettings(settings, values)
	if err != nil {
		t.Fatalf("ValidateSettings() error: %v", err)
	}

	if merged["peers"] != 5 {
		t.Errorf("peers = %v, want 5", merged["peers"])
	}
	if merged["name"] != "wg0" {
		t.Errorf("name = %v, want wg0", merged["name"])
	}
	if merged["debug"] != true {
		t.Errorf("debug = %v, want true", merged["debug"])
	}
}

func TestValidateSettingsInvalidType(t *testing.T) {
	tests := []struct {
		name    string
		setting Setting
		value   interface{}
		errMsg  string
	}{
		{
			name:    "string for number",
			setting: Setting{Key: "port", Type: "number"},
			value:   "not-a-number",
			errMsg:  "expected number",
		},
		{
			name:    "number for string",
			setting: Setting{Key: "name", Type: "string"},
			value:   42,
			errMsg:  "expected string",
		},
		{
			name:    "string for boolean",
			setting: Setting{Key: "debug", Type: "boolean"},
			value:   "yes",
			errMsg:  "expected boolean",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ValidateSettings(
				[]Setting{tt.setting},
				map[string]interface{}{tt.setting.Key: tt.value},
			)
			if err == nil {
				t.Error("expected error")
			} else if !strings.Contains(err.Error(), tt.errMsg) {
				t.Errorf("error = %q, want to contain %q", err.Error(), tt.errMsg)
			}
		})
	}
}

func TestValidateSettingsOutOfRange(t *testing.T) {
	settings := []Setting{
		{
			Key:  "peers",
			Type: "number",
			Min:  intPtr(1),
			Max:  intPtr(25),
		},
	}

	t.Run("below minimum", func(t *testing.T) {
		_, err := ValidateSettings(settings, map[string]interface{}{"peers": 0})
		if err == nil {
			t.Error("expected error for below minimum")
		}
		if !strings.Contains(err.Error(), "below minimum") {
			t.Errorf("error = %q", err.Error())
		}
	})

	t.Run("above maximum", func(t *testing.T) {
		_, err := ValidateSettings(settings, map[string]interface{}{"peers": 30})
		if err == nil {
			t.Error("expected error for above maximum")
		}
		if !strings.Contains(err.Error(), "exceeds maximum") {
			t.Errorf("error = %q", err.Error())
		}
	})

	t.Run("at boundary min", func(t *testing.T) {
		merged, err := ValidateSettings(settings, map[string]interface{}{"peers": 1})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if merged["peers"] != 1 {
			t.Errorf("peers = %v, want 1", merged["peers"])
		}
	})

	t.Run("at boundary max", func(t *testing.T) {
		merged, err := ValidateSettings(settings, map[string]interface{}{"peers": 25})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if merged["peers"] != 25 {
			t.Errorf("peers = %v, want 25", merged["peers"])
		}
	})
}

func TestValidateSettingsDefaultsApplied(t *testing.T) {
	settings := []Setting{
		{
			Key:     "peers",
			Type:    "number",
			Default: 3,
		},
		{
			Key:     "dns",
			Type:    "string",
			Default: "1.1.1.1",
		},
		{
			Key:  "name",
			Type: "string",
		},
	}

	// Provide no values at all
	merged, err := ValidateSettings(settings, map[string]interface{}{})
	if err != nil {
		t.Fatalf("ValidateSettings() error: %v", err)
	}

	if merged["peers"] != 3 {
		t.Errorf("peers = %v, want 3 (default)", merged["peers"])
	}
	if merged["dns"] != "1.1.1.1" {
		t.Errorf("dns = %v, want 1.1.1.1 (default)", merged["dns"])
	}
	// "name" has no default, should not appear
	if _, ok := merged["name"]; ok {
		t.Error("name should not be in merged (no default)")
	}
}

func TestValidateSettingsRequiredMissing(t *testing.T) {
	settings := []Setting{
		{
			Key:      "peers",
			Type:     "number",
			Required: boolPtr(true),
		},
	}

	_, err := ValidateSettings(settings, map[string]interface{}{})
	if err == nil {
		t.Error("expected error for missing required field")
	}
	if !strings.Contains(err.Error(), "required") {
		t.Errorf("error = %q, want to contain 'required'", err.Error())
	}
}

func TestValidateSettingsPatternMatch(t *testing.T) {
	settings := []Setting{
		{
			Key:     "dns",
			Type:    "string",
			Pattern: `^\d{1,3}(\.\d{1,3}){3}$`,
		},
	}

	t.Run("valid pattern", func(t *testing.T) {
		merged, err := ValidateSettings(settings, map[string]interface{}{"dns": "1.1.1.1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if merged["dns"] != "1.1.1.1" {
			t.Errorf("dns = %v", merged["dns"])
		}
	})

	t.Run("invalid pattern", func(t *testing.T) {
		_, err := ValidateSettings(settings, map[string]interface{}{"dns": "not-an-ip"})
		if err == nil {
			t.Error("expected error for pattern mismatch")
		}
		if !strings.Contains(err.Error(), "does not match pattern") {
			t.Errorf("error = %q", err.Error())
		}
	})
}

func TestValidateSettingsSelectOption(t *testing.T) {
	settings := []Setting{
		{
			Key:  "protocol",
			Type: "select",
			Options: []SettingOption{
				{Value: "udp", Label: map[string]string{"en-US": "UDP"}},
				{Value: "tcp", Label: map[string]string{"en-US": "TCP"}},
			},
		},
	}

	t.Run("valid option", func(t *testing.T) {
		merged, err := ValidateSettings(settings, map[string]interface{}{"protocol": "udp"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if merged["protocol"] != "udp" {
			t.Errorf("protocol = %v", merged["protocol"])
		}
	})

	t.Run("invalid option", func(t *testing.T) {
		_, err := ValidateSettings(settings, map[string]interface{}{"protocol": "icmp"})
		if err == nil {
			t.Error("expected error for invalid option")
		}
		if !strings.Contains(err.Error(), "not a valid option") {
			t.Errorf("error = %q", err.Error())
		}
	})
}

func TestValidateSettingsNumericTypes(t *testing.T) {
	settings := []Setting{
		{
			Key:  "count",
			Type: "number",
			Min:  intPtr(0),
			Max:  intPtr(100),
		},
	}

	// int
	merged, err := ValidateSettings(settings, map[string]interface{}{"count": 50})
	if err != nil {
		t.Fatalf("int: %v", err)
	}
	if merged["count"] != 50 {
		t.Errorf("count = %v", merged["count"])
	}

	// float64 (common from JSON unmarshaling)
	merged, err = ValidateSettings(settings, map[string]interface{}{"count": float64(42)})
	if err != nil {
		t.Fatalf("float64: %v", err)
	}
	if merged["count"] != 42 {
		t.Errorf("count = %v", merged["count"])
	}

	// int64
	merged, err = ValidateSettings(settings, map[string]interface{}{"count": int64(7)})
	if err != nil {
		t.Fatalf("int64: %v", err)
	}
	if merged["count"] != 7 {
		t.Errorf("count = %v", merged["count"])
	}
}
