//go:build !unix

package store

func freeBytes(string) (uint64, bool) { return 0, false }
