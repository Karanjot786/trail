package main

import (
	"fmt"
	"os"
)

func main() {
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "serve", "seed":
		fmt.Println("trail:", cmd, "(not implemented yet)")
	default:
		fmt.Fprintln(os.Stderr, "usage: trail [serve|seed]")
		os.Exit(2)
	}
}
