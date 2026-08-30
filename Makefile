# HERMES — development commands.
#
#   make          list every target
#   make dev      run the whole thing locally
#
# Targets that need dependencies install them on first use, so a fresh clone
# only ever needs `make dev`.

SHELL := /bin/bash
.DEFAULT_GOAL := help

BACKEND  := backend
FRONTEND := frontend
FIRMWARE := firmware

VENV   := $(BACKEND)/venv
PYTHON := $(VENV)/bin/python
PIP    := $(VENV)/bin/pip

# Marker files, so `make` skips an install that already happened.
VENV_STAMP := $(VENV)/.installed
NODE_STAMP := $(FRONTEND)/node_modules/.package-lock.json

DEMO_DB := hermes-demo.db

API_PORT  ?= 5001
DASH_PORT ?= 5173

.PHONY: help setup dev demo backend frontend serve build check test typecheck \
        lint format firmware seed ports clean clean-all

# ----------------------------------------------------------------- overview

help:
	@echo "HERMES"
	@echo
	@echo "  make dev        Run backend + dashboard locally, with hot reload"
	@echo "  make demo       Same, against 21 days of generated readings"
	@echo "  make serve      Run the production build the way the Pi does"
	@echo
	@echo "  make setup      Install dependencies and the git hooks (implied above)"
	@echo "  make check      Tests, type checks, lint and format check, both sides"
	@echo "  make format     Reformat the dashboard with Prettier"
	@echo "  make build      Compile the dashboard into frontend/dist"
	@echo "  make firmware   Compile the firmware for all three node types"
	@echo
	@echo "  make seed       Regenerate the demo database"
	@echo "  make clean      Remove build output and caches"
	@echo "  make clean-all  ...and the virtualenv and node_modules"

# ------------------------------------------------------------------- setup

setup: hooks $(VENV_STAMP) $(NODE_STAMP)

$(VENV_STAMP): $(BACKEND)/requirements-dev.txt
	@echo "==> Creating the Python environment"
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install --quiet --upgrade pip
	@$(PIP) install --quiet -r $(BACKEND)/requirements-dev.txt
	@touch $@

$(NODE_STAMP): $(FRONTEND)/package-lock.json
	@echo "==> Installing dashboard dependencies"
	@cd $(FRONTEND) && npm install --silent
	@touch $@

# ------------------------------------------------------------------- hooks

# Blocks a commit that stages a secret. `core.hooksPath` is per-clone config,
# never cloned with the repository, so every checkout has to opt in once.
hooks:
	@git config core.hooksPath .githooks
	@command -v gitleaks >/dev/null 2>&1 || \
		echo "==> gitleaks is not installed: the pre-commit scan will be skipped (brew install gitleaks)"

# --------------------------------------------------------------- run it all

# A busy port would otherwise leave one server silently dead while the other
# kept running, and the browser would quietly talk to whatever was already
# listening.
ports:
	@command -v lsof >/dev/null 2>&1 || exit 0; \
	for port in $(API_PORT) $(DASH_PORT); do \
		if lsof -nP -iTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "Port $$port is already in use by:"; \
			lsof -nP -iTCP:$$port -sTCP:LISTEN | awk 'NR>1 {print "    PID " $$2 "\t" $$1}' | sort -u; \
			echo; \
			echo "Stop it, or pick another port:  make $(MAKECMDGOALS) API_PORT=5002"; \
			exit 1; \
		fi; \
	done

# Both servers run in one process group; Ctrl-C stops both.
define run_both
	trap 'kill 0' EXIT INT TERM; \
	(cd $(BACKEND) && PORT=$(API_PORT) $(1) ../$(PYTHON) app.py) & \
	(cd $(FRONTEND) && VITE_API_TARGET=http://localhost:$(API_PORT) \
		npm run dev --silent -- --port $(DASH_PORT) --strictPort) & \
	wait
endef

dev: setup ports
	@echo "==> API       http://localhost:$(API_PORT)"
	@echo "==> Dashboard http://localhost:$(DASH_PORT)    (Ctrl-C stops both)"
	@echo
	@$(call run_both,)

demo: setup ports $(BACKEND)/$(DEMO_DB)
	@echo "==> API       http://localhost:$(API_PORT)     (demo data)"
	@echo "==> Dashboard http://localhost:$(DASH_PORT)    (Ctrl-C stops both)"
	@echo
	@$(call run_both,DATABASE_PATH=$(DEMO_DB))

backend: setup
	@cd $(BACKEND) && ../$(PYTHON) app.py

frontend: setup
	@cd $(FRONTEND) && npm run dev

# Exactly what runs on the Pi: gunicorn serving the API and the built
# dashboard from a single origin, no Vite in the picture.
serve: build
	@echo "==> http://localhost:$(API_PORT)"
	@cd $(BACKEND) && PORT=$(API_PORT) ../$(VENV)/bin/gunicorn -c gunicorn.conf.py wsgi:app

# ------------------------------------------------------------------- checks

check: test typecheck lint
	@echo "==> All checks passed"

test: $(VENV_STAMP)
	@echo "==> Backend tests"
	@cd $(BACKEND) && ../$(PYTHON) -m pytest

typecheck: setup
	@echo "==> Backend types"
	@cd $(BACKEND) && ../$(PYTHON) -m mypy hermes app.py wsgi.py
	@echo "==> Dashboard types"
	@cd $(FRONTEND) && npm run typecheck --silent

lint: $(NODE_STAMP)
	@echo "==> Dashboard lint"
	@cd $(FRONTEND) && npm run lint --silent
	@echo "==> Dashboard format"
	@cd $(FRONTEND) && npm run format:check --silent

format: $(NODE_STAMP)
	@cd $(FRONTEND) && npm run format --silent

# -------------------------------------------------------------------- build

build: $(NODE_STAMP)
	@echo "==> Building the dashboard"
	@cd $(FRONTEND) && npm run build

# PlatformIO installs itself outside the PATH of a non-interactive shell.
PIO := $(shell command -v pio 2>/dev/null || echo $(HOME)/.platformio/penv/bin/pio)

firmware:
	@test -x "$(PIO)" || { \
		echo "PlatformIO not found. Install it with:  pip install platformio"; \
		exit 1; \
	}
	@echo "==> Compiling all three node types"
	@cd $(FIRMWARE) && \
	cp src/main.cpp src/main.cpp.orig && \
	trap 'mv -f src/main.cpp.orig src/main.cpp' EXIT; \
	for node in 1 2 3; do \
		echo "    NODE_TYPE $$node"; \
		sed -i '' "s/^#define NODE_TYPE .*/#define NODE_TYPE $$node/" src/main.cpp 2>/dev/null || \
			sed -i "s/^#define NODE_TYPE .*/#define NODE_TYPE $$node/" src/main.cpp; \
		"$(PIO)" run --silent || exit 1; \
	done
	@echo "==> All three node types compile"

# --------------------------------------------------------------- demo data

seed: $(VENV_STAMP)
	@cd $(BACKEND) && ../$(PYTHON) scripts/seed_demo.py

$(BACKEND)/$(DEMO_DB): $(VENV_STAMP) $(BACKEND)/scripts/seed_demo.py
	@cd $(BACKEND) && ../$(PYTHON) scripts/seed_demo.py

# ------------------------------------------------------------------ tidying

clean:
	@rm -rf $(FRONTEND)/dist $(BACKEND)/.mypy_cache $(BACKEND)/.pytest_cache
	@find $(BACKEND) -name __pycache__ -type d -prune -exec rm -rf {} +
	@echo "==> Cleaned build output and caches"

clean-all: clean
	@rm -rf $(VENV) $(FRONTEND)/node_modules $(BACKEND)/$(DEMO_DB)*
	@echo "==> Removed the virtualenv, node_modules and the demo database"
