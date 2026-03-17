#!/bin/bash
export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:~/.nvm/versions/node/v20*/bin:~/.nvm/versions/node/v22*/bin:~/.nvm/versions/node/v18*/bin

if [ -f "$HOME/.zshrc" ]; then source "$HOME/.zshrc" 2>/dev/null; fi
if [ -f "$HOME/.bash_profile" ]; then source "$HOME/.bash_profile" 2>/dev/null; fi

cd "$(dirname "$0")"

npm install --cache /tmp/npm-cache-2026
npm run dev
