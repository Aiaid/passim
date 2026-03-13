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
}

func listTemplates(registry *tmpl.Registry) gin.HandlerFunc {
	return func(c *gin.Context) {
		templates := registry.List()
		summaries := make([]templateSummary, 0, len(templates))
		for _, t := range templates {
			settings := make([]settingInfo, 0, len(t.Settings))
			for _, s := range t.Settings {
				settings = append(settings, settingInfo{
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
				})
			}
			summaries = append(summaries, templateSummary{
				Name:        t.Name,
				Category:    t.Category,
				Version:     t.Version,
				Icon:        t.Icon,
				Description: t.Description,
				Settings:    settings,
			})
		}
		c.JSON(http.StatusOK, summaries)
	}
}
