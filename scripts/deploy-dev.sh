#!/bin/bash


VERSION=$(date +"%Y%m%d-%H%M%S")
TAG="pagify-dev-$VERSION"

echo "Creating DEV tag: $TAG"


git tag $TAG
git push origin $TAG

echo "Done! Check GitHub Actions"