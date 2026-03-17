package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/passim/passim/internal/version"
)

// GitHubRelease represents a GitHub release API response (subset).
type GitHubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
	Prerelease  bool      `json:"prerelease"`
	Draft       bool      `json:"draft"`
}

// UpdateInfo is the result of a version check.
type UpdateInfo struct {
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	Available   bool   `json:"available"`
	Changelog   string `json:"changelog,omitempty"`
	PublishedAt string `json:"published_at,omitempty"`
}

// Checker periodically checks for new versions.
type Checker struct {
	repo       string // "owner/repo"
	httpClient *http.Client

	mu     sync.RWMutex
	cached *UpdateInfo
}

// NewChecker creates a version checker for the given GitHub repo (e.g. "passim/passim").
func NewChecker(repo string) *Checker {
	return &Checker{
		repo: repo,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Check queries GitHub Releases API for the latest release and compares
// it against the running version. Results are cached.
func (c *Checker) Check(ctx context.Context) (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", c.repo)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "passim/"+version.Version)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch releases: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if release.Draft || release.Prerelease {
		info := &UpdateInfo{Current: version.Version, Latest: version.Version, Available: false}
		c.setCache(info)
		return info, nil
	}

	latest := release.TagName
	info := &UpdateInfo{
		Current:     version.Version,
		Latest:      latest,
		Available:   isNewer(version.Version, latest),
		Changelog:   release.Body,
		PublishedAt: release.PublishedAt.Format(time.RFC3339),
	}

	c.setCache(info)
	return info, nil
}

// Cached returns the last cached check result, or nil.
func (c *Checker) Cached() *UpdateInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.cached
}

func (c *Checker) setCache(info *UpdateInfo) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cached = info
}

// StartBackground starts a background goroutine that checks for updates
// on startup and then every interval. Cancel the context to stop.
func (c *Checker) StartBackground(ctx context.Context, interval time.Duration) {
	go func() {
		// Initial check after short delay (let server start first)
		select {
		case <-time.After(10 * time.Second):
		case <-ctx.Done():
			return
		}

		c.Check(ctx) //nolint:errcheck // best-effort

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				c.Check(ctx) //nolint:errcheck
			case <-ctx.Done():
				return
			}
		}
	}()
}

// isNewer returns true if latest is a newer semver than current.
// Both may or may not have a "v" prefix.
func isNewer(current, latest string) bool {
	curRaw := strings.TrimPrefix(current, "v")
	latRaw := strings.TrimPrefix(latest, "v")

	// Non-semver current (e.g. "dev", "unknown") — can't compare
	if !isSemver(curRaw) || !isSemver(latRaw) {
		return false
	}

	cur := normalizeVersion(current)
	lat := normalizeVersion(latest)

	curParts := splitVersion(cur)
	latParts := splitVersion(lat)

	for i := 0; i < 3; i++ {
		if latParts[i] > curParts[i] {
			return true
		}
		if latParts[i] < curParts[i] {
			return false
		}
	}

	// Same base version: pre-release < release (e.g. 1.0.0-rc.1 < 1.0.0)
	curHasPre := strings.Contains(curRaw, "-")
	latHasPre := strings.Contains(latRaw, "-")
	if curHasPre && !latHasPre {
		return true
	}

	return false
}

// isSemver checks if a version string (without "v" prefix) looks like semver.
func isSemver(v string) bool {
	// Strip pre-release suffix for the check
	base := v
	if idx := strings.Index(v, "-"); idx != -1 {
		base = v[:idx]
	}
	var a, b, c int
	n, _ := fmt.Sscanf(base, "%d.%d.%d", &a, &b, &c)
	return n == 3
}

// normalizeVersion strips "v" prefix and any pre-release suffix.
func normalizeVersion(v string) string {
	v = strings.TrimPrefix(v, "v")
	// Strip pre-release (e.g. "-rc.1")
	if idx := strings.Index(v, "-"); idx != -1 {
		v = v[:idx]
	}
	return v
}

// splitVersion splits "1.2.3" into [1, 2, 3].
func splitVersion(v string) [3]int {
	var parts [3]int
	fmt.Sscanf(v, "%d.%d.%d", &parts[0], &parts[1], &parts[2])
	return parts
}
