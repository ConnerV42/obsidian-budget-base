# Budget Flow Plugin - Makefile
# Set VAULT to your Obsidian vault path

VAULT_PATH_FILE ?= .vault-path

ifneq ($(wildcard $(VAULT_PATH_FILE)),)
VAULT ?= $(strip $(shell cat $(VAULT_PATH_FILE)))
else
VAULT ?= $(HOME)/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault
endif

.PHONY: build deploy dev clean test

# Build production bundle
build:
	npm run build

# Build + deploy to vault
deploy: build
	@mkdir -p "$(VAULT)/.obsidian/plugins/budgetbase"
	cp main.js manifest.json styles.css "$(VAULT)/.obsidian/plugins/budgetbase/"
	@echo "✅ Deployed to $(VAULT)/.obsidian/plugins/budgetbase/"
	@echo "👉 Reload Obsidian (Cmd+R) to pick up changes"

# Development mode (watch + auto-rebuild)
dev:
	npm run dev

# Run tests
test:
	npm test

# Clean build artifacts
clean:
	rm -f main.js

# Install dependencies
install:
	npm install

# Full setup: install + build + deploy
setup: install deploy
