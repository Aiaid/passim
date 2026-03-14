package ssl

import (
	"strings"
	"testing"
)

func TestIPToBase32_IPv4_Length(t *testing.T) {
	// IPv4: 4 bytes → 8 Base32 chars (including padding replacement)
	ips := []string{"203.0.113.10", "127.0.0.1", "0.0.0.0", "255.255.255.255"}
	for _, ip := range ips {
		t.Run(ip, func(t *testing.T) {
			got, err := IPToBase32(ip)
			if err != nil {
				t.Fatalf("error: %v", err)
			}
			if len(got) != 8 {
				t.Errorf("IPv4 Base32 length = %d, want 8: %q", len(got), got)
			}
			if got != strings.ToLower(got) {
				t.Errorf("should be lowercase: %q", got)
			}
			if strings.Contains(got, "=") {
				t.Errorf("should not contain '=': %q", got)
			}
		})
	}
}

func TestIPToBase32_IPv6_Length(t *testing.T) {
	// IPv6: 16 bytes → 32 Base32 chars (including padding replacement)
	got, err := IPToBase32("2001:db8::1")
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if len(got) != 32 {
		t.Errorf("IPv6 Base32 length = %d, want 32: %q", len(got), got)
	}
}

func TestIPToBase32_Invalid(t *testing.T) {
	_, err := IPToBase32("not-an-ip")
	if err == nil {
		t.Error("should error for invalid IP")
	}
}

func TestIPToBase32_Deterministic(t *testing.T) {
	// Same IP should always produce same encoding
	a, _ := IPToBase32("203.0.113.10")
	b, _ := IPToBase32("203.0.113.10")
	if a != b {
		t.Errorf("not deterministic: %q != %q", a, b)
	}
}

func TestIPToBase32_Different(t *testing.T) {
	// Different IPs should produce different encodings
	a, _ := IPToBase32("10.0.0.1")
	b, _ := IPToBase32("10.0.0.2")
	if a == b {
		t.Errorf("different IPs same encoding: %q", a)
	}
}

func TestIPToBase32_DNSSafe(t *testing.T) {
	// Output should be valid as a DNS label (lowercase alphanumeric + digits)
	got, _ := IPToBase32("192.168.1.1")
	for _, c := range got {
		valid := (c >= 'a' && c <= 'z') || (c >= '2' && c <= '8')
		if !valid {
			t.Errorf("invalid DNS label char %c in %q", c, got)
		}
	}
}
