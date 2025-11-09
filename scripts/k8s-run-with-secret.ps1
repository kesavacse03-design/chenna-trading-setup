# Create Secret from payload.json and run the Job manifest which mounts the secret
param(
  [string]$PayloadPath = "$PWD\payload.json",
  [string]$Namespace = "default"
)

if (-not (Test-Path $PayloadPath)) {
  Write-Error "Payload file not found: $PayloadPath"
  exit 1
}

# Create or update secret (binary data allowed)
Write-Host "Creating secret 'run-worker-payload-secret' from $PayloadPath in namespace $Namespace"
kubectl create secret generic run-worker-payload-secret --from-file=payload.json=$PayloadPath -n $Namespace --dry-run=client -o yaml | kubectl apply -f -

Write-Host "Applying Job manifest (secret-backed)"
kubectl apply -f k8s/run-worker-job-secret.yaml -n $Namespace

Write-Host "Watch job status and logs (follow):"
Write-Host "kubectl get jobs -n $Namespace && kubectl logs job/cts-run-worker-canary-secret -n $Namespace --follow"

Write-Host "To delete after run: kubectl delete job cts-run-worker-canary-secret -n $Namespace && kubectl delete secret run-worker-payload-secret -n $Namespace"
