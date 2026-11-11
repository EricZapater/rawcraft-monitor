# Build stage
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /server ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /rawcraft-agent ./cmd/agent

# Final minimal stage
FROM alpine:3.20
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /server .
COPY --from=builder /rawcraft-agent .
COPY --from=builder /app/migrations ./migrations
EXPOSE 8080
CMD ["./server"]
