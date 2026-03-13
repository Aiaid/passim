package template

import (
	"fmt"
	"regexp"
)

// ValidateSettings validates user-provided values against the template's
// settings schema. It returns a merged map containing the user values plus
// defaults for any optional settings that were not provided. An error is
// returned on the first validation failure.
func ValidateSettings(settings []Setting, values map[string]interface{}) (map[string]interface{}, error) {
	merged := make(map[string]interface{})

	// Build lookup of provided values
	provided := make(map[string]bool)
	for k := range values {
		provided[k] = true
	}

	for _, s := range settings {
		val, hasVal := values[s.Key]

		// Check required
		isRequired := s.Required != nil && *s.Required
		if !hasVal {
			if isRequired {
				return nil, fmt.Errorf("setting %q is required", s.Key)
			}
			// Apply default if available
			if s.Default != nil {
				merged[s.Key] = s.Default
			}
			continue
		}

		// Validate by type
		switch s.Type {
		case "number":
			n, err := toFloat64(val)
			if err != nil {
				return nil, fmt.Errorf("setting %q: expected number, got %T", s.Key, val)
			}
			intVal := int(n)
			if s.Min != nil && intVal < *s.Min {
				return nil, fmt.Errorf("setting %q: value %d is below minimum %d", s.Key, intVal, *s.Min)
			}
			if s.Max != nil && intVal > *s.Max {
				return nil, fmt.Errorf("setting %q: value %d exceeds maximum %d", s.Key, intVal, *s.Max)
			}
			merged[s.Key] = intVal

		case "string":
			str, ok := val.(string)
			if !ok {
				return nil, fmt.Errorf("setting %q: expected string, got %T", s.Key, val)
			}
			if s.Pattern != "" {
				re, err := regexp.Compile(s.Pattern)
				if err != nil {
					return nil, fmt.Errorf("setting %q: invalid pattern %q: %w", s.Key, s.Pattern, err)
				}
				if !re.MatchString(str) {
					return nil, fmt.Errorf("setting %q: value %q does not match pattern %q", s.Key, str, s.Pattern)
				}
			}
			merged[s.Key] = str

		case "boolean":
			b, ok := val.(bool)
			if !ok {
				return nil, fmt.Errorf("setting %q: expected boolean, got %T", s.Key, val)
			}
			merged[s.Key] = b

		case "select":
			if len(s.Options) > 0 {
				if !isValidOption(val, s.Options) {
					return nil, fmt.Errorf("setting %q: value %v is not a valid option", s.Key, val)
				}
			}
			merged[s.Key] = val

		default:
			// Unknown types are passed through without validation
			merged[s.Key] = val
		}
	}

	return merged, nil
}

// toFloat64 converts various numeric types to float64.
func toFloat64(v interface{}) (float64, error) {
	switch n := v.(type) {
	case int:
		return float64(n), nil
	case int64:
		return float64(n), nil
	case float64:
		return n, nil
	case float32:
		return float64(n), nil
	default:
		return 0, fmt.Errorf("not a number: %T", v)
	}
}

// isValidOption checks if a value matches one of the allowed options.
func isValidOption(val interface{}, options []SettingOption) bool {
	for _, opt := range options {
		if fmt.Sprintf("%v", opt.Value) == fmt.Sprintf("%v", val) {
			return true
		}
	}
	return false
}
