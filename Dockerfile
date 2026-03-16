# syntax=docker/dockerfile:1

ARG GO_VERSION=1.25.0
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION} AS build
WORKDIR /src

COPY Backend/go.mod Backend/go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod/ \
    go mod download -x

COPY Backend/ .

ARG TARGETARCH

RUN --mount=type=cache,target=/go/pkg/mod/ \
    CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -o /bin/server .
    
FROM alpine:latest AS final

RUN --mount=type=cache,target=/var/cache/apk \
    apk --update add \
        ca-certificates \
        tzdata \
        && \
        update-ca-certificates

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    appuser
USER appuser

COPY --from=build /bin/server /bin/

EXPOSE 6969

COPY .env /app/.env
COPY Backend/db /app/db
WORKDIR /app
ENTRYPOINT [ "/bin/server" ]
