package main

import (
	"fmt"

	"example.com/app/internal/store"
)

type Temp float64

// String satisfies fmt.Stringer -> alive even though never called directly
func (t Temp) String() string {
	return fmt.Sprintf("%.1f°", float64(t))
}

func init() {
	fmt.Println("boot")
}

func main() {
	s := store.New()
	fmt.Println(s.Get("k"), Temp(21))
	fmt.Println(greet("go"))
}

func greet(name string) string {
	return "hi " + name
}

// oldGreet is the pre-i18n greeting.
func oldGreet(name string) string {
	return "hello " + name
}

// ExportedButUnused is exported in package main, so nobody outside can use it.
func ExportedButUnused() interface{} {
	return struct{}{}
}

//export CallbackFromC
func CallbackFromC() {}
