package main

import (
	"flag"
	"fmt"
	"log"
	"strings"

	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/repo"

	"github.com/zeromicro/go-zero/core/conf"
)

var configFile = flag.String("f", "executor.yaml", "the config file")

// main 执行一次性的数据库结构初始化命令。
func main() {
	// 解析命令行参数，读取 -f 指定的配置文件路径。
	flag.Parse()

	// 准备接收完整后端配置。
	var c config.Config
	// 从配置文件加载数据库配置。
	if err := conf.Load(*configFile, &c); err != nil {
		// 配置加载失败时直接退出，避免错误配置继续运行。
		log.Fatal(err)
	}

	// 迁移命令当前只支持 PostgreSQL。
	if !strings.EqualFold(strings.TrimSpace(c.Database.Driver), "postgres") {
		log.Fatalf("unsupported database driver: %s", c.Database.Driver)
	}

	// 建立迁移命令与数据库之间的连接。
	db, err := repo.OpenPostgres(c.Database.DSN)
	if err != nil {
		log.Fatalf("open database failed: %v", err)
	}
	// 命令退出时关闭数据库连接池。
	defer func() {
		if closeErr := repo.ClosePostgres(db); closeErr != nil {
			log.Printf("close database failed: %v", closeErr)
		}
	}()

	// 执行数据库表结构迁移。
	if err := repo.AutoMigrate(db); err != nil {
		log.Fatalf("auto migrate failed: %v", err)
	}

	// 迁移成功后输出完成提示。
	fmt.Println("Database migration completed successfully.")
}

