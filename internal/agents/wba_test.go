package agents

import (
	"bytes"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

// RFC 9421 Appendix B.1.4 and B.2.6, verbatim.
const (
	rfcEd25519Pub = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJrQLj5P/89iXES9+vFgrIy29clF9CC/oPPsw3c5D0bs=
-----END PUBLIC KEY-----`
	rfcB26Input = `sig-b26=("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"`
	rfcB26Sig   = `sig-b26=:wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==:`
	rfcB26Base  = `"date": Tue, 20 Apr 2021 02:07:55 GMT
"@method": POST
"@path": /foo
"@authority": example.com
"content-type": application/json
"content-length": 18
"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"`
)

func TestRFC9421Ed25519Vector(t *testing.T) {
	in, err := parseSignatureInput(rfcB26Input)
	if err != nil {
		t.Fatal(err)
	}
	m := in[0]
	values := []string{"Tue, 20 Apr 2021 02:07:55 GMT", "POST", "/foo", "example.com", "application/json", "18"}
	base := signatureBase(m.list, values, serializeInnerList(m.list, m.params))
	if base != rfcB26Base {
		t.Fatalf("base:\n%s\nwant:\n%s", base, rfcB26Base)
	}
	block, _ := pem.Decode([]byte(rfcEd25519Pub))
	k, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	sigs, err := parseDictionary(rfcB26Sig)
	if err != nil {
		t.Fatal(err)
	}
	if !ed25519.Verify(k.(ed25519.PublicKey), []byte(base), sigs[0].item.b) {
		t.Fatal("RFC 9421 B.2.6 signature does not verify")
	}
}

// fakeKeys is a KeySource that counts lookups.
type fakeKeys struct {
	keys  map[string]ed25519.PublicKey // origin|keyid
	calls int
}

func (f *fakeKeys) Key(origin, keyid string) (ed25519.PublicKey, bool) {
	f.calls++
	k, ok := f.keys[origin+"|"+keyid]
	return k, ok
}

var (
	testPriv  = ed25519.NewKeyFromSeed(bytes.Repeat([]byte{7}, 32))
	testNow   = time.Unix(1_795_000_000, 0)
	testKeyID = "poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U"
)

// wbaReq describes one signed request for signWBA.
type wbaReq struct {
	label, origin, authority string
	dict                     bool // Signature-Agent as a dictionary member (Google's form)
	created, expires         int64
	tag, alg, keyid          string
	extraComponent           string
}

// signWBA signs like a Web Bot Auth agent and returns the headers.
func signWBA(r wbaReq) Signed {
	if r.label == "" {
		r.label = "sig1"
	}
	if r.tag == "" {
		r.tag = "web-bot-auth"
	}
	if r.keyid == "" {
		r.keyid = testKeyID
	}
	if r.created == 0 {
		r.created = testNow.Unix() - 10
	}
	sa := `"` + r.origin + `"`
	saComp, saValue := `"signature-agent"`, sa
	if r.dict {
		sa = r.label + `="` + r.origin + `"`
		saComp = `"signature-agent";key="` + r.label + `"`
	}
	comps := `"@authority" ` + saComp
	if r.extraComponent != "" {
		comps += ` "` + r.extraComponent + `"`
	}
	params := fmt.Sprintf("(%s);created=%d", comps, r.created)
	if r.expires != 0 {
		params += fmt.Sprintf(";expires=%d", r.expires)
	}
	params += `;keyid="` + r.keyid + `"`
	if r.alg != "" {
		params += `;alg="` + r.alg + `"`
	}
	params += `;nonce="bm9uY2U";tag="` + r.tag + `"`
	base := `"@authority": ` + strings.ToLower(r.authority) + "\n" +
		saComp + ": " + saValue + "\n"
	if r.extraComponent != "" {
		base += `"` + r.extraComponent + `": x` + "\n"
	}
	base += `"@signature-params": ` + params
	sig := ed25519.Sign(testPriv, []byte(base))
	return Signed{
		Authority:      r.authority,
		SignatureAgent: sa,
		SignatureInput: r.label + "=" + params,
		Signature:      r.label + "=:" + base64.StdEncoding.EncodeToString(sig) + ":",
	}
}

func testKeySource() *fakeKeys {
	pub := testPriv.Public().(ed25519.PublicKey)
	return &fakeKeys{keys: map[string]ed25519.PublicKey{
		"https://chatgpt.com|" + testKeyID:    pub,
		"https://agent.bot.goog|" + testKeyID: pub,
	}}
}

func TestVerifyWebBotAuth(t *testing.T) {
	for _, c := range []struct {
		name string
		req  wbaReq
		want string
	}{
		{"string form", wbaReq{origin: "https://chatgpt.com", authority: "Shop.Example"}, "chatgpt-agent"},
		{"dictionary form", wbaReq{label: "g", origin: "https://agent.bot.goog", authority: "shop.example", dict: true, alg: "ed25519"}, "google-agent"},
		{"explicit expires", wbaReq{origin: "https://chatgpt.com", authority: "shop.example", expires: testNow.Unix() + 3600}, "chatgpt-agent"},
	} {
		s := signWBA(c.req)
		a, err := Verify(s, s.Authority, testKeySource(), testNow)
		if err != nil || a.ID != c.want {
			t.Errorf("%s: %q %v", c.name, a.ID, err)
		}
	}
}

func TestVerifyRejectsUnlistedAgent(t *testing.T) {
	for _, origin := range []string{"http://169.254.169.254", "https://evil.example", "http://chatgpt.com"} {
		for _, dict := range []bool{false, true} {
			s := signWBA(wbaReq{origin: origin, authority: "shop.example", dict: dict})
			ks := testKeySource()
			if _, err := Verify(s, "shop.example", ks, testNow); !errors.Is(err, ErrUnlistedAgent) {
				t.Errorf("%s: %v", origin, err)
			}
			if ks.calls != 0 {
				t.Errorf("%s: %d key lookups", origin, ks.calls)
			}
		}
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	for _, r := range []wbaReq{
		{created: testNow.Unix() - 3600},                                  // 5 min default lifetime long gone
		{created: testNow.Unix() - 7200, expires: testNow.Unix() - 120},   // explicit expiry passed
		{created: testNow.Unix() + 600},                                   // from the future
		{created: testNow.Unix() - 10, expires: testNow.Unix() + 25*3600}, // over 24 h
	} {
		r.origin, r.authority = "https://chatgpt.com", "shop.example"
		s := signWBA(r)
		if _, err := Verify(s, "shop.example", testKeySource(), testNow); err == nil {
			t.Errorf("created %d expires %d accepted", r.created, r.expires)
		}
	}
}

func TestVerifyRejectsWrongTag(t *testing.T) {
	for _, r := range []wbaReq{{tag: "other"}, {alg: "rsa-pss-sha512"}} {
		r.origin, r.authority = "https://chatgpt.com", "shop.example"
		s := signWBA(r)
		if _, err := Verify(s, "shop.example", testKeySource(), testNow); err == nil {
			t.Errorf("%+v accepted", r)
		}
	}
}

func TestVerifyRejectsWrongAuthority(t *testing.T) {
	s := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	if _, err := Verify(s, "other.example", testKeySource(), testNow); !errors.Is(err, ErrBadSignature) {
		t.Errorf("wrong authority: %v", err)
	}
	if _, err := Verify(s, "", testKeySource(), testNow); err == nil {
		t.Error("empty authority accepted")
	}
}

func TestVerifyRejectsTamperedAgentHeader(t *testing.T) {
	s := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	s.SignatureAgent = `"https://chatgpt.com/"`
	if _, err := Verify(s, "shop.example", testKeySource(), testNow); err == nil {
		t.Error("tampered Signature-Agent accepted")
	}
	d := signWBA(wbaReq{label: "g", origin: "https://agent.bot.goog", authority: "shop.example", dict: true})
	d.SignatureAgent = `g="https://chatgpt.com"`
	if _, err := Verify(d, "shop.example", testKeySource(), testNow); err == nil {
		t.Error("swapped dictionary member accepted")
	}
}

func TestVerifyRejectsOther(t *testing.T) {
	ok := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	cases := map[string]Signed{}
	extra := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example", extraComponent: "@path"})
	cases["unsupported component"] = extra
	unknownKey := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example", keyid: "nope"})
	cases["unknown keyid"] = unknownKey
	big := ok
	big.Signature = strings.Repeat("a", maxHeader+1)
	cases["huge signature"] = big
	noSig := ok
	noSig.Signature = ""
	cases["no signature"] = noSig
	otherLabel := ok
	otherLabel.Signature = strings.Replace(ok.Signature, "sig1=", "sig2=", 1)
	cases["label mismatch"] = otherLabel
	flipped := ok
	flipped.Signature = "sig1=:" + base64.StdEncoding.EncodeToString(make([]byte, 64)) + ":"
	cases["bad bytes"] = flipped
	cases["garbage"] = Signed{SignatureAgent: "\x00", SignatureInput: "((((", Signature: ":::"}
	for name, s := range cases {
		if a, err := Verify(s, "shop.example", testKeySource(), testNow); err == nil {
			t.Errorf("%s accepted as %s", name, a.ID)
		}
	}
	if errs := fmt.Sprint(Verify(extra, "shop.example", testKeySource(), testNow)); !strings.Contains(errs, ErrUnsupportedComponent.Error()) {
		t.Errorf("extra component error: %s", errs)
	}
}

func FuzzVerify(f *testing.F) {
	s := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	f.Add(s.SignatureAgent, s.SignatureInput, s.Signature)
	g := signWBA(wbaReq{label: "g", origin: "https://agent.bot.goog", authority: "shop.example", dict: true})
	f.Add(g.SignatureAgent, g.SignatureInput, g.Signature)
	f.Fuzz(func(t *testing.T, sa, si, sig string) {
		ks := testKeySource()
		a, err := Verify(Signed{SignatureAgent: sa, SignatureInput: si, Signature: sig}, "shop.example", ks, testNow)
		if err == nil && a.ID == "" {
			t.Fatal("nil error without an agent")
		}
	})
}

func TestVerifyRequiresCoveredComponents(t *testing.T) {
	ks := testKeySource()
	sign := func(comps string) Signed {
		params := fmt.Sprintf("(%s);created=%d;keyid=%q;tag=\"web-bot-auth\"", comps, testNow.Unix()-10, testKeyID)
		var lines []string
		for _, c := range strings.Fields(comps) {
			switch c {
			case `"@authority"`:
				lines = append(lines, `"@authority": shop.example`)
			case `"signature-agent"`:
				lines = append(lines, `"signature-agent": "https://chatgpt.com"`)
			}
		}
		base := strings.Join(append(lines, `"@signature-params": `+params), "\n")
		return Signed{
			Authority:      "shop.example",
			SignatureAgent: `"https://chatgpt.com"`,
			SignatureInput: "sig1=" + params,
			Signature:      "sig1=:" + base64.StdEncoding.EncodeToString(ed25519.Sign(testPriv, []byte(base))) + ":",
		}
	}
	for _, comps := range []string{``, `"signature-agent"`, `"@authority"`, `"@authority" "@authority" "signature-agent"`} {
		if a, err := Verify(sign(comps), "shop.example", ks, testNow); err == nil {
			t.Errorf("(%s) accepted as %s", comps, a.ID)
		}
	}
	if _, err := Verify(sign(`"@authority" "signature-agent"`), "shop.example", ks, testNow); err != nil {
		t.Errorf("full set rejected: %v", err)
	}
}

func TestVerifyBoundsWork(t *testing.T) {
	s := signWBA(wbaReq{origin: "https://chatgpt.com", authority: "shop.example"})
	var members []string
	for i := range 40 {
		members = append(members, fmt.Sprintf("m%d=()", i))
	}
	s.SignatureInput = strings.Join(members, ", ") + ", " + s.SignatureInput
	if _, err := Verify(s, "shop.example", testKeySource(), testNow); err == nil {
		t.Error("a 41-member Signature-Input was accepted")
	}
}
