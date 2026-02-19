# Budget Flow Plugin - Makefile
# Set VAULT to your Obsidian vault path

VAULT_PATH_FILE ?= .vault-path
PLUGIN_ID ?= budgetbase

ifneq ($(wildcard $(VAULT_PATH_FILE)),)
VAULT ?= $(strip $(shell cat $(VAULT_PATH_FILE)))
else
VAULT ?= $(HOME)/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault
endif

PLUGIN_DIR := $(VAULT)/.obsidian/plugins/$(PLUGIN_ID)

.PHONY: build deploy verify-deploy release-mobile-ready diagnose-mobile-stale dev clean test

# Build production bundle
build:
	npm run build

# Build + deploy to vault
deploy: build
	@mkdir -p "$(PLUGIN_DIR)"
	cp main.js manifest.json styles.css "$(PLUGIN_DIR)/"
	@echo "✅ Deployed to $(PLUGIN_DIR)"
	@node -e "const fs=require('node:fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));console.log('📦 Version: ' + String(m.version || ''));"
	@node -e "const fs=require('node:fs');const crypto=require('node:crypto');const hash=crypto.createHash('sha256').update(fs.readFileSync('main.js')).digest('hex');console.log('🔒 main.js sha256: ' + hash);"
	@echo "👉 Reload Obsidian (Cmd+R) to pick up changes"

# Verify that deployed plugin files match local build outputs
verify-deploy:
	npm run verify:deploy

# Mobile-safe release flow: bump version + deploy + verify
release-mobile-ready:
	npm run bump:manifest
	$(MAKE) deploy
	$(MAKE) verify-deploy
	@echo "📱 Obsidian Sync checklist:"
	@echo "   1) Let desktop sync finish."
	@echo "   2) Open mobile and wait for sync completion."
	@echo "   3) Disable/enable BudgetBase once on mobile if UI is stale."
	@echo "   4) Force-close/reopen mobile Obsidian if needed."

# Diagnose stale mobile plugin views without changing files
diagnose-mobile-stale:
	@echo "🔎 Plugin directory: $(PLUGIN_DIR)"
	@if [ -f "$(PLUGIN_DIR)/manifest.json" ]; then \
		node -e "const fs=require('node:fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p,'utf8'));console.log('📦 Deployed version: ' + String(m.version || ''));" "$(PLUGIN_DIR)/manifest.json"; \
	else \
		echo "❌ Missing $(PLUGIN_DIR)/manifest.json"; \
	fi
	@if [ -f "$(PLUGIN_DIR)/main.js" ]; then \
		node -e "const fs=require('node:fs');const crypto=require('node:crypto');const p=process.argv[1];const hash=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');console.log('🔒 Deployed main.js sha256: ' + hash);" "$(PLUGIN_DIR)/main.js"; \
	else \
		echo "❌ Missing $(PLUGIN_DIR)/main.js"; \
	fi
	@if [ -f "$(PLUGIN_DIR)/main.js" ] && rg -q "Edit gross pay" "$(PLUGIN_DIR)/main.js"; then \
		echo "✅ New UI marker present (Edit gross pay)"; \
	else \
		echo "❌ New UI marker missing (Edit gross pay)"; \
	fi
	@if [ -f "$(PLUGIN_DIR)/main.js" ] && rg -q "Add deduction" "$(PLUGIN_DIR)/main.js"; then \
		echo "⚠️ Legacy marker found (Add deduction)"; \
	else \
		echo "✅ Legacy marker absent (Add deduction)"; \
	fi

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
