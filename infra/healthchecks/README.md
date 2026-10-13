# Infrastructure health checks

The canonical checks are defined directly in `docker-compose.yml`.

- PostgreSQL: `pg_isready`
- Keycloak: `/health/ready` on the internal management port 9000
- MinIO: `/minio/health/ready`
- ClamAV: `clamdscan --ping`
- LiveKit: HTTP/TCP availability of the signaling/API listener on 7880
- `minio-init` is a one-shot initialization job and is considered successful only when it exits with code 0

Application probes already exist separately:
- API liveness: `GET /health/live`
- API readiness: `GET /health/ready`

These checks are infrastructure readiness signals. They are not a substitute for end-to-end tests.
