#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

[ -f runtime/generated/image-tags.env ] && . runtime/generated/image-tags.env
WORLD_IMAGE_TAG="${DUNE_WORLD_IMAGE_TAG:-1960494-0-shipping}"
IMAGE="registry.funcom.com/funcom/self-hosting/seabass-server-rabbitmq:${WORLD_IMAGE_TAG}"

mkdir -p runtime/rabbitmq-admin/config
mkdir -p runtime/rabbitmq-game/config
mkdir -p runtime/rabbitmq-game/certs

cat > runtime/rabbitmq-admin/config/rabbitmq.conf <<'EOF'
listeners.tcp.default = 5672
management.tcp.port = 15672
loopback_users.guest = false

auth_backends.1 = cache
auth_cache.cache_ttl = 5000
auth_cache.cached_backend = http

auth_http.http_method   = post
auth_http.user_path     = http://dune-text-router:5059/v0/auth/user
auth_http.vhost_path    = http://dune-text-router:5059/v0/auth/vhost
auth_http.resource_path = http://dune-text-router:5059/v0/auth/resource
auth_http.topic_path    = http://dune-text-router:5059/v0/auth/topic
EOF

cat > runtime/rabbitmq-game/config/rabbitmq.conf <<'EOF'
listeners.tcp = none
listeners.ssl.default = 5672

ssl_options.cacertfile = /etc/rabbitmq/cacert.pem
ssl_options.certfile   = /etc/rabbitmq/cert.pem
ssl_options.keyfile    = /etc/rabbitmq/key.pem
ssl_options.verify     = verify_none
ssl_options.fail_if_no_peer_cert = false

management.tcp.port = 15672
loopback_users.guest = false

auth_backends.1 = cache
auth_cache.cache_ttl = 5000
auth_cache.cached_backend = http

auth_http.http_method   = post
auth_http.user_path     = http://dune-text-router:5059/v0/auth/user
auth_http.vhost_path    = http://dune-text-router:5059/v0/auth/vhost
auth_http.resource_path = http://dune-text-router:5059/v0/auth/resource
auth_http.topic_path    = http://dune-text-router:5059/v0/auth/topic
EOF

if [ ! -f runtime/rabbitmq-game/certs/key.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout runtime/rabbitmq-game/certs/key.pem \
    -out runtime/rabbitmq-game/certs/cert.pem \
    -days 365 \
    -subj "/CN=dune-rmq-game"

  cp runtime/rabbitmq-game/certs/cert.pem runtime/rabbitmq-game/certs/cacert.pem
fi

chmod 755 runtime/rabbitmq-game runtime/rabbitmq-game/certs runtime/rabbitmq-game/config
chmod 644 runtime/rabbitmq-game/certs/*.pem
cat > runtime/rabbitmq-admin/config/enabled_plugins <<'EOF'
[rabbitmq_management,rabbitmq_prometheus,rabbitmq_auth_backend_http,rabbitmq_auth_backend_cache].
EOF

cat > runtime/rabbitmq-game/config/enabled_plugins <<'EOF'
[rabbitmq_management,rabbitmq_prometheus,rabbitmq_auth_backend_http,rabbitmq_auth_backend_cache].
EOF

chmod 644 runtime/rabbitmq-game/config/rabbitmq.conf
chmod 644 runtime/rabbitmq-admin/config/rabbitmq.conf
chmod 644 runtime/rabbitmq-game/config/enabled_plugins
chmod 644 runtime/rabbitmq-admin/config/enabled_plugins

docker network create dune-net 2>/dev/null || true
docker rm -f dune-rmq-admin dune-rmq-game 2>/dev/null || true

docker run -d \
  --name dune-rmq-admin \
  --network dune-net \
  --restart unless-stopped \
  -p 127.0.0.1:32573:5672 \
  -v "$PWD/runtime/rabbitmq-admin/config/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro" \
  -v "$PWD/runtime/rabbitmq-admin/config/enabled_plugins:/etc/rabbitmq/enabled_plugins:ro" \
  "$IMAGE"

docker run -d \
  --name dune-rmq-game \
  --network dune-net \
  --restart unless-stopped \
  -p 31982:5672/tcp \
  -v "$PWD/runtime/rabbitmq-game/config/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro" \
  -v "$PWD/runtime/rabbitmq-game/config/enabled_plugins:/etc/rabbitmq/enabled_plugins:ro" \
  -v "$PWD/runtime/rabbitmq-game/certs/cacert.pem:/etc/rabbitmq/cacert.pem:ro" \
  -v "$PWD/runtime/rabbitmq-game/certs/cert.pem:/etc/rabbitmq/cert.pem:ro" \
  -v "$PWD/runtime/rabbitmq-game/certs/key.pem:/etc/rabbitmq/key.pem:ro" \
  "$IMAGE"

sleep 8

docker exec dune-rmq-admin rabbitmq-diagnostics -q ping
docker exec dune-rmq-game rabbitmq-diagnostics -q ping

docker ps --filter "name=dune-rmq" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
