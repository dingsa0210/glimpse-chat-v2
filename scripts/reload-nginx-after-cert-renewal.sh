#!/bin/sh
set -eu
kill -HUP "$(cat /root/glimpse-chat/nginx/nginx.pid)"
