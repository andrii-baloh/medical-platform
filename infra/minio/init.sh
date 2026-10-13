#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${S3_BUCKET_MEDICAL:?S3_BUCKET_MEDICAL is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"

if [ "$S3_ACCESS_KEY" = "$MINIO_ROOT_USER" ]; then
  echo "S3_ACCESS_KEY must not equal MINIO_ROOT_USER" >&2
  exit 1
fi

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$S3_BUCKET_MEDICAL"

sed "s/__BUCKET__/$S3_BUCKET_MEDICAL/g" /opt/medicare/app-policy.template.json > /tmp/medicare-app-policy.json
mc admin policy create local medicare-app-policy /tmp/medicare-app-policy.json >/dev/null 2>&1 || \
  mc admin policy info local medicare-app-policy >/dev/null

if mc admin user info local "$S3_ACCESS_KEY" >/dev/null 2>&1; then
  mc admin user enable local "$S3_ACCESS_KEY" >/dev/null
else
  mc admin user add local "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
fi

mc admin policy attach local medicare-app-policy --user "$S3_ACCESS_KEY"
echo "MinIO bucket and least-privilege application user are ready."
