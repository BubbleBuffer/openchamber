#!/bin/bash
# OpenChamber dev service control — wraps systemctl --user with the
# XDG_RUNTIME_DIR env var the user session needs.
export XDG_RUNTIME_DIR=/run/user/1000
case "${1:-status}" in
  start)   systemctl --user start openchamber-dev ;;
  stop)    systemctl --user stop openchamber-dev ;;
  restart) systemctl --user restart openchamber-dev ;;
  status)  systemctl --user status openchamber-dev --no-pager ;;
  logs)    journalctl --user -u openchamber-dev -f ;;
  log)     journalctl --user -u openchamber-dev -n 100 --no-pager ;;
  health)  curl -s http://127.0.0.1:3002/health | python3 -m json.tool ;;
  *)       echo "Usage: $0 {start|stop|restart|status|logs|log|health}" ; exit 1 ;;
esac
