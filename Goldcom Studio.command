#!/usr/bin/env bash
# Goldcom Studio launcher for macOS: double-click in Finder. Same as goldcom-studio.sh.
exec bash "$(cd "$(dirname "$0")" && pwd)/goldcom-studio.sh" "$@"
