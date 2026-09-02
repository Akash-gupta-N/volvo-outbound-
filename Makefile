# Outbound Workflow Monitoring System
#
# One command to install dependencies and run the app:
#
#     make dev
#
# The dependency install is tracked against package.json/package-lock.json, so
# it runs on first use and is skipped on every run after that.

.DEFAULT_GOAL := help
SHELL := /bin/bash

.PHONY: help install dev tunnel sample test test-api test-persistence \
        rebuild reset-db clean distclean

help:
	@echo ''
	@echo 'Outbound Workflow Monitoring System'
	@echo ''
	@echo '  make dev              Install dependencies, then run the server'
	@echo '                        Mentor dashboard: http://localhost:3000'
	@echo '                        Phone scanner:    /operator.html'
	@echo '  make tunnel           Keep a public HTTPS tunnel alive for phones'
	@echo ''
	@echo '  make install          Install dependencies only'
	@echo '  make sample           Regenerate test_picklists.xlsx'
	@echo ''
	@echo '  The three test suites are ordered and not independent:'
	@echo '  make test             1. Engine tests (backs up and resets the database)'
	@echo '  make test-api         2. API tests (needs make dev running; seeds PL101/PL102)'
	@echo '  make test-persistence 3. Restart check (needs make test-api to have run)'
	@echo ''
	@echo '  make rebuild          Rebuild better-sqlite3 after copying node_modules'
	@echo '                        between operating systems'
	@echo '  make reset-db         Back up and delete outbound.db'
	@echo '  make distclean        Remove node_modules'
	@echo ''

# Marker target: npm install only re-runs when a manifest or lockfile changes.
node_modules: package.json package-lock.json
	npm install
	@touch $@

install: node_modules
	@echo 'Dependencies are up to date.'

dev: install
	npm start

tunnel: install
	node keep_tunnel_alive.js

sample: install
	node create_sample_excel.js

# test_engine.js asserts against a clean database, and src/db/database.js points
# every suite at the real outbound.db. Any existing database is preserved as a
# timestamped backup rather than deleted.
test: install reset-db
	node tests/test_engine.js

test-api: install
	@curl -sf http://127.0.0.1:3000/api/system-info >/dev/null 2>&1 || { \
	  echo 'Server is not responding on port 3000. Run "make dev" in another terminal first.'; \
	  exit 1; }
	node tests/test_api_integration.js

test-persistence: install
	@curl -sf http://127.0.0.1:3000/api/system-info >/dev/null 2>&1 || { \
	  echo 'Server is not responding on port 3000. Run "make dev" in another terminal first.'; \
	  exit 1; }
	node tests/test_persistence.js

# better-sqlite3 ships a compiled binary. Copying node_modules between a
# Windows machine and macOS/Linux leaves an unloadable one behind.
rebuild:
	rm -rf node_modules/better-sqlite3
	npm install better-sqlite3

reset-db:
	@if [ -f outbound.db ]; then \
	  backup="outbound.db.backup-$$(date +%Y%m%d-%H%M%S)"; \
	  mv outbound.db "$$backup"; \
	  echo "Existing database saved as $$backup"; \
	  echo "Restore it later with: mv $$backup outbound.db"; \
	fi
	@rm -f outbound.db-shm outbound.db-wal
	@echo 'Database will be recreated on next start.'

clean:
	rm -f Outbound_Confirmation_*.xlsx

distclean: clean
	rm -rf node_modules

