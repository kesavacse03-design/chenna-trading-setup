<#
Push the built image to a registry. Usage:
.
# Build locally first: npm run docker:build-runworker
# Then:
.
.
PS> .\scripts\push-image.ps1 -Registry "myregistry.example.com" -Repo "myteam/cts-run-worker" -Tag "v1.0.0"
#>
param(
  [Parameter(Mandatory=$true)]
  [string]$Registry,
  [Parameter(Mandatory=$true)]
  [string]$Repo,
  [Parameter(Mandatory=$true)]
  [string]$Tag
)

$fullImage = "$Registry/$Repo:$Tag"
Write-Host "Tagging local image cts-run-worker -> $fullImage"
docker tag cts-run-worker:latest $fullImage

Write-Host "Pushing $fullImage (ensure you're logged in: docker login $Registry)"
docker push $fullImage
Write-Host "Done. Update k8s manifests to use image: $fullImage"
