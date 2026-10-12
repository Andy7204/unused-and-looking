package main

import "testing"

func TestGreet(t *testing.T) {
	if greet("x") != "hi x" {
		t.Fatal("bad greet")
	}
}

func BenchmarkGreet(b *testing.B) {
	for i := 0; i < b.N; i++ {
		greet("x")
	}
}
