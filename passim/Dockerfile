FROM golang:1.23-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o /passim ./cmd/passim/

FROM alpine:3.20

RUN apk add --no-cache ca-certificates iperf3

COPY --from=builder /passim /usr/local/bin/passim
COPY templates/ /etc/passim/templates/

VOLUME /data
EXPOSE 8443 80

ENTRYPOINT ["passim"]
