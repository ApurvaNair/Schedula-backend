#!/bin/bash

ORG_BRANCH="intern/apurva-main"         
PERSONAL_BRANCH="main"         

git fetch upstream

git checkout $PERSONAL_BRANCH

git merge upstream/$ORG_BRANCH

git push origin $PERSONAL_BRANCH

echo "Sync and deploy process completed!"
