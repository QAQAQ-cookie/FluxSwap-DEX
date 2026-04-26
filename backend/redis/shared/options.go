package shared

import "time"

type Options struct {
	Enabled      bool          `json:",optional"`
	Addr         string        `json:",optional"`
	Username     string        `json:",optional"`
	Password     string        `json:",optional"`
	DB           int           `json:",optional"`
	KeyPrefix    string        `json:",optional"`
	DialTimeout  time.Duration `json:",optional"`
	ReadTimeout  time.Duration `json:",optional"`
	WriteTimeout time.Duration `json:",optional"`
	PoolTimeout  time.Duration `json:",optional"`
	MinIdleConns int           `json:",optional"`
	MaxIdleConns int           `json:",optional"`
	PoolSize     int           `json:",optional"`
}
