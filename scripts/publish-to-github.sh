#!/bin/bash
VERSION=$(jq -r '.version' package.json)
npm --no-git-tag-version version "$VERSION-$GITHUB_RUN_NUMBER"
npm publish
