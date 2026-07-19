#!/bin/sh
set -e
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
BUCKET="${MINIO_BUCKET:-md-collab-uploads}"
if ! mc ls "local/$BUCKET" >/dev/null 2>&1; then
  mc mb "local/$BUCKET"
fi
mc anonymous set none "local/$BUCKET"
echo "MinIO bucket $BUCKET initialized."
