package main

import (
	"flag"
	"log"

	"fluxswap-executor/internal/config"
	fluxrpc "fluxswap-executor/rpc"

	"github.com/zeromicro/go-zero/core/conf"
)

var configFile = flag.String("f", "rpc/etc/executor.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	if err := fluxrpc.Run(c); err != nil {
		log.Fatal(err)
	}
}
