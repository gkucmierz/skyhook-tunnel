# Stage 1: Build Frontend UI
FROM node:22-alpine AS ui-builder
WORKDIR /app
COPY package*.json ./
COPY ui/package*.json ./ui/
RUN npm ci --workspace=ui --ignore-scripts
COPY ui/ ./ui/
RUN npm --prefix ui run build

# Stage 2: Build Go Server with embedded UI
FROM golang:1.23-alpine AS server-builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY server/go.mod server/go.sum* ./server/
WORKDIR /app/server
RUN go mod download || true
COPY server/ ./
COPY --from=ui-builder /app/ui/dist ./dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/skyhook-server .

# Stage 3: Minimal production runtime
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata && mkdir -p /data
WORKDIR /app
COPY --from=server-builder /app/skyhook-server /app/skyhook-server

EXPOSE 80
EXPOSE 4443/udp

ENV HTTP_PORT=80
ENV QUIC_PORT=4443
ENV DOMAIN=skyhook.7u.pl
ENV DATA_PATH=/data/telemetry.json

CMD ["/app/skyhook-server"]
