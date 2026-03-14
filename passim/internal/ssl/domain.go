package ssl

import (
	"encoding/base32"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// DiscoverDomain constructs a domain name using the DNS reflector.
// It discovers the public IP, Base32-encodes it, and appends the base domain.
// Example: IP 203.0.113.10 → Base32 "ywahcia8" → "ywahcia8.dns.passim.io"
func DiscoverDomain(baseDomain string) (string, error) {
	ip, err := discoverPublicIP()
	if err != nil {
		return "", fmt.Errorf("discover public IP: %w", err)
	}

	encoded, err := IPToBase32(ip)
	if err != nil {
		return "", err
	}

	return encoded + "." + baseDomain, nil
}

// IPToBase32 encodes an IP address to a DNS-safe Base32 string.
// IPv4 → 8 chars, IPv6 → 32 chars. Uses '8' instead of '=' for padding.
func IPToBase32(ipStr string) (string, error) {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return "", fmt.Errorf("invalid IP: %s", ipStr)
	}

	var raw []byte
	if v4 := ip.To4(); v4 != nil {
		raw = v4
	} else {
		raw = ip.To16()
	}

	encoded := base32.StdEncoding.EncodeToString(raw)
	encoded = strings.ReplaceAll(encoded, "=", "8")
	return strings.ToLower(encoded), nil
}

// DiscoverPublicIP returns the node's public IPv4 address.
func DiscoverPublicIP() (string, error) {
	return discoverIP([]string{
		"https://api4.ipify.org",
		"https://ipv4.icanhazip.com",
		"https://ifconfig.me/ip",
	})
}

// DiscoverPublicIPv6 returns the node's public IPv6 address.
func DiscoverPublicIPv6() (string, error) {
	return discoverIP([]string{
		"https://api6.ipify.org",
		"https://ipv6.icanhazip.com",
	})
}

func discoverPublicIP() (string, error) {
	return DiscoverPublicIP()
}

func discoverIP(services []string) (string, error) {
	client := &http.Client{Timeout: 5 * time.Second}

	for _, url := range services {
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			continue
		}

		ip := strings.TrimSpace(string(body))
		if net.ParseIP(ip) != nil {
			return ip, nil
		}
	}

	return "", fmt.Errorf("could not discover public IP from any service")
}
