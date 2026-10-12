package main

import "testing"

func TestRestock(t *testing.T) {
	if restock(Stock{Count: 1}).Count != 11 {
		t.Fatal("restock is broken")
	}
}
