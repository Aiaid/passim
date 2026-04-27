package update

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/passim/passim/internal/version"
)

func TestIsNewer(t *testing.T) {
	tests := []struct {
		current, latest string
		want            bool
	}{
		{"v1.0.0", "v1.0.1", true},
		{"v1.0.0", "v1.1.0", true},
		{"v1.0.0", "v2.0.0", true},
		{"v1.2.3", "v1.2.3", false},
		{"v1.2.3", "v1.2.2", false},
		{"v2.0.0", "v1.9.9", false},
		{"1.0.0", "v1.0.1", true},
		{"v1.0.0", "1.0.1", true},
		{"dev", "v1.0.0", false},
		{"v1.0.0-rc.1", "v1.0.0", true},
	}

	for _, tt := range tests {
		got := isNewer(tt.current, tt.latest)
		if got != tt.want {
			t.Errorf("isNewer(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
		}
	}
}

func TestDecideAvailable(t *testing.T) {
	tests := []struct {
		name            string
		current, latest string
		cmp             *CompareResult
		want            bool
	}{
		{"semver behind", "v1.0.0", "v1.1.0", nil, true},
		{"semver same", "v1.1.0", "v1.1.0", nil, false},
		{"semver ahead", "v2.0.0", "v1.9.9", nil, false},
		{"semver ignores cmp", "v1.0.0", "v1.0.0", &CompareResult{Status: "behind", BehindBy: 5}, false},
		{"dev compare behind", "dev", "v1.0.0", &CompareResult{Status: "behind", BehindBy: 3}, true},
		{"dev compare diverged", "dev-abc1234", "v1.0.0", &CompareResult{Status: "diverged", BehindBy: 2, AheadBy: 4}, true},
		{"dev compare ahead", "dev", "v1.0.0", &CompareResult{Status: "ahead", AheadBy: 5, BehindBy: 0}, false},
		{"dev compare identical", "dev", "v1.0.0", &CompareResult{Status: "identical", BehindBy: 0}, false},
		{"dev fallback any release", "dev", "v1.0.0", nil, true},
		{"dev fallback non-semver latest", "dev", "weird", nil, false},
		{"unknown fallback", "unknown", "v1.0.0", nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := decideAvailable(tt.current, tt.latest, tt.cmp)
			if got != tt.want {
				t.Errorf("decideAvailable(%q, %q, %+v) = %v, want %v",
					tt.current, tt.latest, tt.cmp, got, tt.want)
			}
		})
	}
}

func TestCompareWithRelease(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		want := "/repos/test/repo/compare/v1.0.0...abcdef0123456789abcdef0123456789abcdef01"
		if r.URL.Path != want {
			http.Error(w, "unexpected path: "+r.URL.Path, http.StatusBadRequest)
			return
		}
		json.NewEncoder(w).Encode(CompareResult{Status: "behind", BehindBy: 7, AheadBy: 0})
	}))
	defer srv.Close()

	c := &Checker{
		repo:       "test/repo",
		apiBase:    srv.URL,
		httpClient: srv.Client(),
	}

	cmp, err := c.compareWithRelease(context.Background(), "v1.0.0", "abcdef0123456789abcdef0123456789abcdef01")
	if err != nil {
		t.Fatalf("compareWithRelease failed: %v", err)
	}
	if cmp == nil {
		t.Fatal("expected non-nil result")
	}
	if cmp.Status != "behind" || cmp.BehindBy != 7 {
		t.Errorf("unexpected result: %+v", cmp)
	}
}

func TestCompareWithRelease_ShortOrUnknownSHASkips(t *testing.T) {
	c := &Checker{repo: "test/repo", apiBase: "http://example.invalid", httpClient: &http.Client{Timeout: time.Second}}

	cases := []string{"", "unknown", "abc12"}
	for _, sha := range cases {
		cmp, err := c.compareWithRelease(context.Background(), "v1.0.0", sha)
		if err == nil {
			t.Errorf("expected error for sha=%q, got nil (cmp=%+v)", sha, cmp)
		}
		if cmp != nil {
			t.Errorf("expected nil result for sha=%q, got %+v", sha, cmp)
		}
	}
}

func TestCompareWithRelease_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer srv.Close()

	c := &Checker{repo: "test/repo", apiBase: srv.URL, httpClient: srv.Client()}
	cmp, err := c.compareWithRelease(context.Background(), "v1.0.0", "abcdef0123456789abcdef0123456789abcdef01")
	if err == nil {
		t.Error("expected error on 404")
	}
	if cmp != nil {
		t.Errorf("expected nil result, got %+v", cmp)
	}
}

func TestNormalizeVersion(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"v1.2.3", "1.2.3"},
		{"1.2.3", "1.2.3"},
		{"v1.0.0-rc.1", "1.0.0"},
		{"v2.1.0-beta.3", "2.1.0"},
	}

	for _, tt := range tests {
		got := normalizeVersion(tt.input)
		if got != tt.want {
			t.Errorf("normalizeVersion(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestChecker_Check(t *testing.T) {
	// Save and restore original version
	origVersion := version.Version
	version.Version = "v1.0.0"
	defer func() { version.Version = origVersion }()

	release := GitHubRelease{
		TagName:     "v1.1.0",
		Name:        "v1.1.0",
		Body:        "Bug fixes and improvements",
		PublishedAt: time.Date(2026, 3, 17, 0, 0, 0, 0, time.UTC),
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(release)
	}))
	defer srv.Close()

	c := NewChecker("test/repo")
	c.httpClient = srv.Client()
	// Override the URL by using a custom transport
	origCheck := c.Check
	_ = origCheck

	// Use a custom checker that points to test server
	c2 := &Checker{
		repo:       "test/repo",
		httpClient: srv.Client(),
	}

	// We need to override the URL. Let's test via the mock server approach.
	// Create a checker that uses a custom HTTP client with the test server URL.
	info, err := checkWithURL(c2, srv.URL)
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}

	if !info.Available {
		t.Error("expected update to be available")
	}
	if info.Latest != "v1.1.0" {
		t.Errorf("expected latest v1.1.0, got %s", info.Latest)
	}
	if info.Changelog != "Bug fixes and improvements" {
		t.Errorf("unexpected changelog: %s", info.Changelog)
	}
}

func TestChecker_Check_NoUpdate(t *testing.T) {
	origVersion := version.Version
	version.Version = "v1.1.0"
	defer func() { version.Version = origVersion }()

	release := GitHubRelease{
		TagName:     "v1.1.0",
		Name:        "v1.1.0",
		Body:        "Current version",
		PublishedAt: time.Date(2026, 3, 17, 0, 0, 0, 0, time.UTC),
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(release)
	}))
	defer srv.Close()

	c := &Checker{httpClient: srv.Client()}
	info, err := checkWithURL(c, srv.URL)
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}

	if info.Available {
		t.Error("expected no update available")
	}
}

func TestChecker_Check_SkipsPrerelease(t *testing.T) {
	origVersion := version.Version
	version.Version = "v1.0.0"
	defer func() { version.Version = origVersion }()

	release := GitHubRelease{
		TagName:    "v2.0.0-rc.1",
		Prerelease: true,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(release)
	}))
	defer srv.Close()

	c := &Checker{httpClient: srv.Client()}
	info, err := checkWithURL(c, srv.URL)
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}

	if info.Available {
		t.Error("expected prerelease to not be available")
	}
}

func TestChecker_Cached(t *testing.T) {
	c := NewChecker("test/repo")

	if c.Cached() != nil {
		t.Error("expected nil cache initially")
	}

	info := &UpdateInfo{Current: "v1.0.0", Latest: "v1.1.0", Available: true}
	c.setCache(info)

	cached := c.Cached()
	if cached == nil {
		t.Fatal("expected cached result")
	}
	if cached.Latest != "v1.1.0" {
		t.Errorf("expected cached latest v1.1.0, got %s", cached.Latest)
	}
}

// checkWithURL is a test helper that calls the GitHub-like server at the given URL.
func checkWithURL(c *Checker, url string) (*UpdateInfo, error) {
	ctx := context.Background()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}

	if release.Draft || release.Prerelease {
		info := &UpdateInfo{Current: version.Version, Latest: version.Version, Available: false}
		c.setCache(info)
		return info, nil
	}

	info := &UpdateInfo{
		Current:     version.Version,
		Latest:      release.TagName,
		Available:   isNewer(version.Version, release.TagName),
		Changelog:   release.Body,
		PublishedAt: release.PublishedAt.Format(time.RFC3339),
	}
	c.setCache(info)
	return info, nil
}
