FROM golang:1.25 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/rpc ./rpc
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/executor ./cmd/executor
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/indexer ./cmd/indexer
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/migrate ./cmd/migrate

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /out/rpc /usr/local/bin/rpc
COPY --from=builder /out/executor /usr/local/bin/executor
COPY --from=builder /out/indexer /usr/local/bin/indexer
COPY --from=builder /out/migrate /usr/local/bin/migrate
COPY rpc/etc/executor.yaml /app/rpc/etc/executor.yaml

CMD ["rpc", "-f", "/app/rpc/etc/executor.yaml"]
