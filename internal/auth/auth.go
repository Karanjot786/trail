// Package auth guards the dashboard with a single password and a signed session cookie.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	cookieName = "trail_session"
	ttl        = 30 * 24 * time.Hour
	failDelay  = 300 * time.Millisecond // slows password guessing
)

// Auth checks the owner password and issues/verifies HMAC-signed cookies.
type Auth struct {
	pwHash [32]byte
	secret []byte
	now    func() time.Time
	bearer bearer
}

// New returns an Auth for password. secret signs cookies; a random per-boot
// secret means a restart logs the owner out.
func New(password string, secret []byte) *Auth {
	return NewHashed(sha256.Sum256([]byte(password)), secret)
}

// NewHashed is New for a password known only by its SHA-256, such as the one
// Trail generates on first start when TRAIL_PASSWORD is unset.
func NewHashed(pwHash [32]byte, secret []byte) *Auth {
	return &Auth{pwHash: pwHash, secret: secret, now: time.Now}
}

// Login handles POST /api/login {"password": "..."}: 204 plus cookie, or 401.
func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	got := sha256.Sum256([]byte(body.Password))
	if body.Password == "" || subtle.ConstantTimeCompare(got[:], a.pwHash[:]) != 1 {
		time.Sleep(failDelay)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	exp := a.now().Add(ttl)
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    a.sign(exp.Unix()),
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(ttl / time.Second),
		HttpOnly: true,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
		SameSite: http.SameSiteStrictMode,
	})
	w.WriteHeader(http.StatusNoContent)
}

// Require rejects requests without a valid, unexpired session cookie with 401.
func (a *Auth) Require(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil || !a.valid(c.Value) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// sign returns "<expiry>.<hex hmac-sha256("ok|<expiry>")>".
func (a *Auth) sign(exp int64) string {
	e := strconv.FormatInt(exp, 10)
	return e + "." + hex.EncodeToString(a.mac(e))
}

func (a *Auth) mac(exp string) []byte {
	m := hmac.New(sha256.New, a.secret)
	m.Write([]byte("ok|" + exp))
	return m.Sum(nil)
}

func (a *Auth) valid(v string) bool {
	e, sig, ok := strings.Cut(v, ".")
	if !ok {
		return false
	}
	got, err := hex.DecodeString(sig)
	if err != nil || !hmac.Equal(got, a.mac(e)) {
		return false
	}
	exp, err := strconv.ParseInt(e, 10, 64)
	return err == nil && a.now().Unix() < exp
}
