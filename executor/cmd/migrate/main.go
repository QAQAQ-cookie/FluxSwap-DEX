package main

import (
	"flag"
	"fmt"
	"log"
	"strings"

	"fluxswap-executor/internal/config"
	"fluxswap-executor/internal/repo"

	"github.com/zeromicro/go-zero/core/conf"
)

var configFile = flag.String("f", "rpc/etc/executor.yaml", "the config file")

// main 执行一次性的数据库结构初始化命令。
func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	if !strings.EqualFold(strings.TrimSpace(c.Database.Driver), "postgres") {
		log.Fatalf("unsupported database driver: %s", c.Database.Driver)
	}

	db, err := repo.OpenPostgres(c.Database.DSN)
	if err != nil {
		log.Fatalf("open database failed: %v", err)
	}

	if err := repo.AutoMigrate(db); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}

	fmt.Println("Database migration completed successfully.")
}
