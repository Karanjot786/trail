package agents

import "testing"

func TestViaVerified(t *testing.T) {
	cases := map[Via]bool{ViaNone: false, ViaUA: false, ViaIP: true, ViaRelay: true, ViaSig: true}
	for v, want := range cases {
		if got := v.Verified(); got != want {
			t.Errorf("Via(%q).Verified() = %v, want %v", v, got, want)
		}
	}
}
