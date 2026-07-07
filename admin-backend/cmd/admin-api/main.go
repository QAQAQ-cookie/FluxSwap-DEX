package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fluxswap-admin-backend/internal/config"
	"fluxswap-admin-backend/internal/database"
	"fluxswap-admin-backend/internal/httpserver"
	"fluxswap-admin-backend/internal/repo"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := database.Open(cfg.DatabaseDSN)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("auto migrate database: %v", err)
	}
	repos := repo.New(db)
	now := time.Now().UTC()
	if err := repos.AuthNonce.DeleteExpired(now); err != nil {
		log.Printf("cleanup expired auth nonces: %v", err)
	}
	if err := repos.AdminSession.DeleteExpired(now); err != nil {
		log.Printf("cleanup expired admin sessions: %v", err)
	}
	defer func() {
		if err := database.Close(db); err != nil {
			log.Printf("close database: %v", err)
		}
	}()

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           httpserver.NewRouter(cfg, repos),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("admin api listening on %s", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen and serve: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown server: %v", err)
	}
}
