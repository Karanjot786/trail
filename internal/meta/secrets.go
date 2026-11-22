package meta

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"fmt"
)

const (
	keySessionSecret = "session_secret"
	keyPasswordHash  = "password_sha256"
	passwordLen      = 24 // base62 characters, about 143 bits
)

// SessionSecret returns the cookie-signing secret stored in the database,
// creating a random 32-byte one on first use. It lets logins survive restarts
// without TRAIL_SECRET.
func SessionSecret(db *sql.DB) ([]byte, error) {
	fresh := make([]byte, 32)
	if _, err := rand.Read(fresh); err != nil {
		return nil, fmt.Errorf("session secret: %w", err)
	}
	if _, err := db.Exec(`INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)`, keySessionSecret, fresh); err != nil {
		return nil, fmt.Errorf("session secret: %w", err)
	}
	var secret []byte
	if err := db.QueryRow(`SELECT value FROM settings WHERE key=?`, keySessionSecret).Scan(&secret); err != nil {
		return nil, fmt.Errorf("session secret: %w", err)
	}
	if len(secret) < 32 {
		return nil, fmt.Errorf("session secret: stored value is %d bytes, want 32", len(secret))
	}
	return secret, nil
}

// GeneratedPassword returns the SHA-256 of the dashboard password generated
// when TRAIL_PASSWORD is unset. On first use it creates one; plain is then the
// password, to be shown once, and is empty on every later call.
func GeneratedPassword(db *sql.DB) (hash [32]byte, plain string, err error) {
	var stored []byte
	err = db.QueryRow(`SELECT value FROM settings WHERE key=?`, keyPasswordHash).Scan(&stored)
	switch {
	case err == sql.ErrNoRows:
		return ResetPassword(db)
	case err != nil:
		return hash, "", fmt.Errorf("password: %w", err)
	case len(stored) != len(hash):
		return hash, "", fmt.Errorf("password: stored hash is %d bytes, want %d", len(stored), len(hash))
	}
	copy(hash[:], stored)
	return hash, "", nil
}

// ResetPassword replaces the generated dashboard password with a new random
// one and returns it with its hash. Only the hash is stored.
func ResetPassword(db *sql.DB) (hash [32]byte, plain string, err error) {
	plain, err = randomString(base62, passwordLen)
	if err != nil {
		return hash, "", err
	}
	hash = sha256.Sum256([]byte(plain))
	if _, err := db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		keyPasswordHash, hash[:]); err != nil {
		return hash, "", fmt.Errorf("password: %w", err)
	}
	return hash, plain, nil
}
