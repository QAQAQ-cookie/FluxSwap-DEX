package shared

import "errors"

var (
	ErrDisabled    = errors.New("redis is disabled")
	ErrMissingAddr = errors.New("redis address is required")
	ErrEmptyKey    = errors.New("redis key is required")
)

func IsDisabled(err error) bool {
	return errors.Is(err, ErrDisabled)
}
