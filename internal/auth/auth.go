// Package auth guards the dashboard with a single password and a signed session cookie.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"net"
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

	lim      loginLimiter
	clientIP func(*http.Request) string // the visitor's address, not the proxy's
	sleep    func(time.Duration)
}

// New returns an Auth for password. secret signs cookies; a random per-boot
// secret means a restart logs the owner out.
func New(password string, secret []byte) *Auth {
	return NewHashed(sha256.Sum256([]byte(password)), secret)
}

// NewHashed is New for a password known only by its SHA-256, such as the one
// Trail generates on first start when TRAIL_PASSWORD is unset.
func NewHashed(pwHash [32]byte, secret []byte) *Auth {
	return &Auth{pwHash: pwHash, secret: secret, now: time.Now, sleep: time.Sleep, clientIP: remoteHost}
}

func remoteHost(r *http.Request) string {
	if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return h
	}
	return r.RemoteAddr
}

// SetClientIP sets how Login finds the client address that failed logins are
// counted against; behind a proxy it should return the forwarded visitor.
func (a *Auth) SetClientIP(f func(*http.Request) string) { a.clientIP = f }

// Login handles POST /api/login {"password": "..."}: 204 plus cookie, or 401, or 429 when the client is locked.
func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	key := clientKey(a.clientIP(r))
	// One password check at a time, so parallel requests cannot multiply the
	// rate. The lock is tested after taking the mutex, with a fresh clock, so a
	// burst that queued while the client had no failures is still stopped.
	a.lim.check.Lock()
	now := a.now()
	if retry, ok := a.lim.locked(key, now); !ok {
		a.lim.check.Unlock()
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
		http.Error(w, "too many failed logins", http.StatusTooManyRequests)
		return
	}
	got := sha256.Sum256([]byte(body.Password))
	if body.Password == "" || subtle.ConstantTimeCompare(got[:], a.pwHash[:]) != 1 {
		a.lim.fail(key, now)
		a.sleep(a.lim.delay(now))
		_, ok := a.lim.locked(key, now)
		a.lim.check.Unlock()
		log.Printf("auth: failed login from %s", key)
		if !ok {
			log.Printf("auth: login locked for %s for %s", key, failWindow)
		}
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	a.lim.check.Unlock()
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

// sign returns "<expiry>.<hex hmac-sha256("ok|<expiry>|<hex pwHash>")>", so a
// new password invalidates every older cookie.
func (a *Auth) sign(exp int64) string {
	e := strconv.FormatInt(exp, 10)
	return e + "." + hex.EncodeToString(a.mac(e))
}

func (a *Auth) mac(exp string) []byte {
	m := hmac.New(sha256.New, a.secret)
	m.Write([]byte("ok|" + exp + "|" + hex.EncodeToString(a.pwHash[:])))
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
