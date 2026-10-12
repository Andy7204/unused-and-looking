package store

type Store struct{ data map[string]string }

func New() *Store { return &Store{data: map[string]string{}} }

func (s *Store) Get(k string) string { return s.data[k] }

// Purge is exported but internal/ packages can only be used inside this module.
func (s *Store) Purge() { s.data = map[string]string{} }

func (s *Store) compact() {
	for k, v := range s.data {
		if v == "" {
			delete(s.data, k)
		}
	}
}
