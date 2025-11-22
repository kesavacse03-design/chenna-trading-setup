# Apply the k8s Job manifest for a smoke test. Assumes kubectl is configured.
param(
  [string]$KubeNamespace = "default",
  [string]$PayloadHostPath = "/var/cts/run-payload/payload.json"
)

# Copy payload to host path expected by manifest (warning only)
if (-not (Test-Path $PayloadHostPath)) {
  Write-Host "Ensure the payload is available at $PayloadHostPath on the cluster node(s)." -ForegroundColor Yellow
}

Write-Host "Applying k8s Job manifest..."
kubectl apply -f k8s/run-worker-job.yaml -n $KubeNamespace
Write-Host "Watch job status: kubectl get jobs -n $KubeNamespace && kubectl logs job/cts-run-worker-canary -n $KubeNamespace --follow"
