#!/bin/sh
set -e

# O volume do Docker é criado como root:root, independentemente do chown feito no
# build da imagem. Como o backend roda como usuário não-root "konnix" (uid 1001),
# os uploads falhariam com permissão negada. Aqui garantimos o dono correto antes
# de abandonar os privilégios e iniciar a aplicação.
UPLOADS_DIR="${KONNIX_UPLOADS_DIR:-/app/uploads}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOADS_DIR"
  chown -R konnix:konnix "$UPLOADS_DIR" || true
fi

exec setpriv --reuid=konnix --regid=konnix --init-groups java $JAVA_OPTS -jar /app/app.jar
