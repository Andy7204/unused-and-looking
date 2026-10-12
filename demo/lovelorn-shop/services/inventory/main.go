package main

import (
	"fmt"
	"strings"
)

type Stock struct {
	SKU   string
	Count int
}

func (s Stock) String() string {
	return fmt.Sprintf("%s x%d", s.SKU, s.Count)
}

func init() {
	fmt.Println("warming up the warehouse")
}

func main() {
	fmt.Println(restock(Stock{SKU: "MUG-1", Count: 2}))
}

func restock(s Stock) Stock {
	s.Count += 10
	return s
}

// normalizeSKU upper-cases and trims a SKU. Replaced by the barcode scanner.
func normalizeSKU(raw string) string {
	return strings.ToUpper(strings.TrimSpace(raw))
}

func (s Stock) isLow() bool {
	return s.Count < 3
}
