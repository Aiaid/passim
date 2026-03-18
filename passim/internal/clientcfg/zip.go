package clientcfg

import (
	"archive/zip"
	"bytes"
	"fmt"
)

// GenerateZIP creates a ZIP archive from file_per_user ResolvedConfigs.
// For a single node, files are at root level: peer1.conf, peer2.conf
// For multiple nodes, files are organized by node: tokyo-1/peer1.conf, singapore-1/peer2.conf
func GenerateZIP(configs []ResolvedConfig) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	multiNode := len(configs) > 1

	for _, cfg := range configs {
		if cfg.Type != "file_per_user" {
			continue
		}
		for _, f := range cfg.Files {
			var name string
			if multiNode && cfg.NodeName != "" {
				prefix := cfg.NodeName
				if cfg.NodeCountry != "" {
					prefix = countryFlag(cfg.NodeCountry) + cfg.NodeName
				}
				name = prefix + "/" + f.Name
			} else {
				name = f.Name
			}

			entry, err := w.Create(name)
			if err != nil {
				return nil, fmt.Errorf("create zip entry %s: %w", name, err)
			}
			if _, err := entry.Write([]byte(f.Content)); err != nil {
				return nil, fmt.Errorf("write zip entry %s: %w", name, err)
			}
		}
	}

	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("close zip: %w", err)
	}

	return buf.Bytes(), nil
}

// countryFlag converts a 2-letter country code to a flag emoji.
func countryFlag(code string) string {
	if len(code) != 2 {
		return ""
	}
	code = fmt.Sprintf("%c%c", code[0]&^0x20, code[1]&^0x20) // toUpper
	r1 := rune(code[0]) - 'A' + 0x1F1E6
	r2 := rune(code[1]) - 'A' + 0x1F1E6
	return string([]rune{r1, r2})
}
