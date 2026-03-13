package api

// Static file serving for embedded web UI.
// Will be implemented in Phase 2 when web/ is built.
//
// Usage:
//   //go:embed all:dist
//   var webFS embed.FS
//   r.NoRoute(staticHandler(webFS))
