package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	tmpl "github.com/passim/passim/internal/template"
)

// templateSummary is the JSON shape returned by GET /api/templates.
type templateSummary struct {
	Name        string            `json:"name"`
	Category    string            `json:"category"`
	Version     string            `json:"version"`
	Icon        string            `json:"icon"`
	Description map[string]string `json:"description"`
	Settings    []settingInfo     `json:"settings"`
}

type optionInfo struct {
	Value interface{}       `json:"value"`
	Label map[string]string `json:"label"`
}

type settingInfo struct {
	Key         string            `json:"key"`
	Type        string            `json:"type"`
	Min         *int              `json:"min,omitempty"`
	Max         *int              `json:"max,omitempty"`
	Default     interface{}       `json:"default,omitempty"`
	Label       map[string]string `json:"label"`
	Required    *bool             `json:"required,omitempty"`
	Advanced    bool              `json:"advanced,omitempty"`
	Description map[string]string `json:"description,omitempty"`
	Pattern     string            `json:"pattern,omitempty"`
	Options     []optionInfo      `json:"options,omitempty"`
}

// guideInfo is the JSON shape for template guide instructions.
type guideInfo struct {
	Setup map[string]string `json:"setup,omitempty"`
	Usage map[string]string `json:"usage,omitempty"`
}

// sourceInfo is the JSON shape for template source metadata.
type sourceInfo struct {
	URL     string `json:"url,omitempty"`
	License string `json:"license,omitempty"`
}

// clientsInfo is the JSON shape for the template's client config definition.
type clientsInfo struct {
	Type       string             `json:"type"`                      // "file_per_user" | "credentials" | "url"
	Source     string             `json:"source,omitempty"`          // file_per_user
	Format     string             `json:"format,omitempty"`          // file_per_user
	QR         bool               `json:"qr,omitempty"`             // file_per_user / url
	Fields     []credentialInfo   `json:"fields,omitempty"`          // credentials
	URLs       []clientURLInfo    `json:"urls,omitempty"`            // url
	ImportURLs map[string]string  `json:"import_urls,omitempty"`     // url
}

type credentialInfo struct {
	Key    string            `json:"key"`
	Label  map[string]string `json:"label"`
	Value  string            `json:"value"`
	Secret bool              `json:"secret,omitempty"`
}

type clientURLInfo struct {
	Name   string `json:"name"`
	Scheme string `json:"scheme"`
	QR     bool   `json:"qr,omitempty"`
}

// shareInfo is the JSON shape for the template's share config.
type shareInfo struct {
	Supports     bool     `json:"supports"`
	PerUser      bool     `json:"per_user,omitempty"`
	ShareContent []string `json:"share_content,omitempty"`
}

// templateDetail is the JSON shape returned by GET /api/templates/:name.
type templateDetail struct {
	Name        string            `json:"name"`
	Category    string            `json:"category"`
	Version     string            `json:"version"`
	Icon        string            `json:"icon"`
	Description map[string]string `json:"description"`
	Settings    []settingInfo     `json:"settings"`
	Guide       *guideInfo        `json:"guide,omitempty"`
	Clients     *clientsInfo      `json:"clients,omitempty"`
	Share       *shareInfo        `json:"share,omitempty"`
	Source      *sourceInfo       `json:"source,omitempty"`
	Limitations []string          `json:"limitations,omitempty"`
}

func convertSettings(src []tmpl.Setting) []settingInfo {
	settings := make([]settingInfo, 0, len(src))
	for _, s := range src {
		si := settingInfo{
			Key:         s.Key,
			Type:        s.Type,
			Min:         s.Min,
			Max:         s.Max,
			Default:     s.Default,
			Label:       s.Label,
			Required:    s.Required,
			Advanced:    s.Advanced,
			Description: s.Description,
			Pattern:     s.Pattern,
		}
		for _, o := range s.Options {
			si.Options = append(si.Options, optionInfo{Value: o.Value, Label: o.Label})
		}
		settings = append(settings, si)
	}
	return settings
}

func convertClients(c *tmpl.ClientConfig) *clientsInfo {
	if c == nil {
		return nil
	}
	ci := &clientsInfo{
		Type:       c.Type,
		Source:     c.Source,
		Format:     c.Format,
		QR:         c.QR,
		ImportURLs: c.ImportURLs,
	}
	for _, f := range c.Fields {
		ci.Fields = append(ci.Fields, credentialInfo{
			Key:    f.Key,
			Label:  f.Label,
			Value:  f.Value,
			Secret: f.Secret,
		})
	}
	for _, u := range c.URLs {
		ci.URLs = append(ci.URLs, clientURLInfo{
			Name:   u.Name,
			Scheme: u.Scheme,
			QR:     u.QR,
		})
	}
	return ci
}

func convertShare(s *tmpl.ShareConfig) *shareInfo {
	if s == nil {
		return nil
	}
	return &shareInfo{
		Supports:     s.Supports,
		PerUser:      s.PerUser,
		ShareContent: s.ShareContent,
	}
}

func getTemplateHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		name := c.Param("name")
		t, ok := deps.Templates.Get(name)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}

		detail := templateDetail{
			Name:        t.Name,
			Category:    t.Category,
			Version:     t.Version,
			Icon:        t.Icon,
			Description: t.Description,
			Settings:    convertSettings(t.Settings),
			Limitations: t.Limitations,
		}

		if t.Guide != nil {
			detail.Guide = &guideInfo{
				Setup: t.Guide.Setup,
				Usage: t.Guide.Usage,
			}
		}

		if t.Source != nil {
			detail.Source = &sourceInfo{
				URL:     t.Source.URL,
				License: t.Source.License,
			}
		}

		detail.Clients = convertClients(t.Clients)
		detail.Share = convertShare(t.Share)

		c.JSON(http.StatusOK, detail)
	}
}

func listTemplates(registry *tmpl.Registry) gin.HandlerFunc {
	return func(c *gin.Context) {
		templates := registry.List()
		summaries := make([]templateSummary, 0, len(templates))
		for _, t := range templates {
			summaries = append(summaries, templateSummary{
				Name:        t.Name,
				Category:    t.Category,
				Version:     t.Version,
				Icon:        t.Icon,
				Description: t.Description,
				Settings:    convertSettings(t.Settings),
			})
		}
		c.JSON(http.StatusOK, summaries)
	}
}
