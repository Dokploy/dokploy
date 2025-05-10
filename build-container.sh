#! /bin/bash
docker build -f Dockerfile -t dokploy-containerized .
docker build -f Dockerfile.local -t dokploy .
docker push alexdev404/dokploy