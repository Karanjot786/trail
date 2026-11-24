package enrich

import "testing"

func TestRegionName(t *testing.T) {
	tests := []struct {
		country, code, want string
		ok                  bool
	}{
		{"IN", "MH", "Maharashtra", true},
		{"in", "in-mh", "Maharashtra", true},
		{"US", "CA", "California", true},
		{"DE", "BE", "Berlin", true},
		{"IN", "ZZ", "", false},
		{"", "MH", "", false},
		{"IN", "", "", false},
	}
	for _, tt := range tests {
		got, ok := RegionName(tt.country, tt.code)
		if got != tt.want || ok != tt.ok {
			t.Errorf("RegionName(%q,%q) = %q,%v want %q,%v", tt.country, tt.code, got, ok, tt.want, tt.ok)
		}
	}
}
