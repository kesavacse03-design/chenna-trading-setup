Kubernetes manifests for CTS run-worker

Files:

- `run-worker-job.yaml` - Job manifest suitable for single-run canary/test (hostPath payload at `/var/cts/run-payload`).
- `run-worker-deployment.yaml` - Deployment for a long-running pool with resource limits.
- `run-worker-job-configmap.yaml` - Example using a ConfigMap to inject a small payload.
- `run-worker-job-secret.yaml` - Example using Secrets for env and payload.
- `secrets.sample.yaml` - Template secrets for `TOKENS_ENCRYPTION_KEY` and `ADMIN_SHARED_SECRET`.

Image build:

1. Build image from repo root:
   - npm run docker:build-runworker
2. Push/tag as needed for your cluster registry.

Usage:

- Ensure the image is available in the cluster (push to registry or load to kind/minikube).
- Provide a payload via hostPath, ConfigMap, or Secret (see manifests).
- Apply a job for a canary:
  - kubectl apply -f k8s/run-worker-job.yaml

Secrets:

- Create a secret `cts-secrets` with keys:
  - `tokens-encryption-key`: base64 32B key used by `TokenManager` to encrypt the access token at rest
  - `admin-shared-secret`: shared header for `/admin/store-token`
- No refresh token is required or used.

Runtime notes:

- Access tokens are provided at runtime via the admin endpoint (`/admin/store-token`) and stored encrypted; don’t mount token files.
- By default, the runner operates in DRY_RUN mode unless you set `ALLOW_LIVE=1` (keep DRY_RUN for canaries).

Security notes:

- Pod runs as non-root and disallows privilege escalation.
- Prefer imagePullSecrets and least-privileged registries.
