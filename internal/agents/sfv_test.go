package agents

import (
	"strings"
	"testing"
)

func TestParseDictionary(t *testing.T) {
	in := `sig1=("@authority" "signature-agent";key="sig1");created=1735689600;keyid="ab_c";alg="ed25519";tag="web-bot-auth", b=:AQID:, c, d=?0, e=tok/en;x, f=-1.5`
	ms, err := parseDictionary(in)
	if err != nil {
		t.Fatal(err)
	}
	if len(ms) != 6 || !ms[0].inner || len(ms[0].list) != 2 {
		t.Fatalf("%+v", ms)
	}
	if got := serializeInnerList(ms[0].list, ms[0].params); got != `("@authority" "signature-agent";key="sig1");created=1735689600;keyid="ab_c";alg="ed25519";tag="web-bot-auth"` {
		t.Errorf("round trip %s", got)
	}
	if b := ms[1].item; b.kind != sfBytes || string(b.b) != "\x01\x02\x03" {
		t.Errorf("bytes %+v", b)
	}
	if c := ms[2].item; c.kind != sfBool || !c.t {
		t.Errorf("bare key %+v", c)
	}
	if e := ms[4]; e.item.s != "tok/en" || len(e.params) != 1 {
		t.Errorf("token %+v", e)
	}
	for _, bad := range []string{"", "A=1", "a=", "a=1,", `a="unterminated`, `a=("x"`, "a=:!!:", `a="\x"`, "a=1;", strings.Repeat("a", maxHeader+1), "a=1 b=2", "a=12345678901234567"} {
		if _, err := parseDictionary(bad); err == nil {
			t.Errorf("%.40q accepted", bad)
		}
	}
}

func TestParseItem(t *testing.T) {
	it, _, err := parseItem(` "https://chatgpt.com" `)
	if err != nil || it.kind != sfString || it.s != "https://chatgpt.com" {
		t.Fatalf("%+v %v", it, err)
	}
	for _, bad := range []string{"", `g="https://agent.bot.goog"`, `"a" "b"`} {
		if _, _, err := parseItem(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func FuzzParseDictionary(f *testing.F) {
	for _, s := range []string{`sig1=:AQID:`, `a=("x";k=1 y);p=?1, b=tok`, `g="https://agent.bot.goog"`, `a=-1.25`} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		ms, err := parseDictionary(s)
		if len(s) > maxHeader && err == nil {
			t.Fatal("accepted over 4 KB")
		}
		for _, m := range ms {
			if m.inner {
				_ = serializeInnerList(m.list, m.params)
			}
		}
	})
}

func FuzzParseSignatureInput(f *testing.F) {
	f.Add(`sig1=("@authority" "signature-agent");created=1735689600;expires=1735693200;keyid="k";tag="web-bot-auth"`)
	f.Add(`g=("@authority" "signature-agent";key="g");created=1;keyid="x";alg="ed25519";tag="web-bot-auth"`)
	f.Fuzz(func(t *testing.T, s string) {
		_, err := parseSignatureInput(s)
		if len(s) > maxHeader && err == nil {
			t.Fatal("accepted over 4 KB")
		}
	})
}
