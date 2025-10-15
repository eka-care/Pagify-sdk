#!/bin/bash

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
TAG="pagify-prod-$VERSION"

echo "🚀 Deploying to PROD S3 + NPM"
echo "📦 Version: $VERSION"
echo ""

# Create and push prod tag
echo "Creating PROD tag: $TAG"
git tag $TAG
git push origin $TAG

echo ""
echo "Publishing to NPM..."
cd src
npm publish --access public

echo ""
echo "Done! Package deployed to:"
echo "   - EKA Prod S3 bucket"
echo "   - NPM registry"