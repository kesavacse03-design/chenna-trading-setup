CI secrets and setup

Required secrets for pushing images and deploying:
- DOCKER_REGISTRY: registry host (e.g., ghcr.io or myregistry.example.com)
- DOCKER_USERNAME: username for registry
- DOCKER_PASSWORD: password/token for registry
- KUBECONFIG (optional): base64-encoded kubeconfig to deploy from Actions

Add these in GitHub repository Settings -> Secrets -> Actions.

Notes
- The Actions workflow will skip the docker push and deploy steps for pull requests.
- Ensure the registry user has push rights and the KUBECONFIG has access to the target namespace.
