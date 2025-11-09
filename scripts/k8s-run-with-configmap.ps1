# Create ConfigMap from payload.json and run the Job manifest
param(
  [string]$PayloadPath = "$PWD\payload.json",
  [string]$Namespace = "default"
)

if (-not (Test-Path $PayloadPath)) {
  Write-Error "Payload file not found: $PayloadPath"
  exit 1
}

Write-Host "Creating ConfigMap 'run-worker-payload' from $PayloadPath in namespace $Namespace"
kubectl create configmap run-worker-payload --from-file=payload.json=$PayloadPath -n $Namespace --dry-run=client -o yaml | kubectl apply -f -

Write-Host "Applying Job manifest"
kubectl apply -f k8s/run-worker-job-configmap.yaml -n $Namespace

Write-Host "Watch job status and logs (follow):"
Write-Host "kubectl get jobs -n $Namespace && kubectl logs job/cts-run-worker-canary-cm -n $Namespace --follow"

Write-Host "To delete after run: kubectl delete job cts-run-worker-canary-cm -n $Namespace && kubectl delete configmap run-worker-payload -n $Namespace"
