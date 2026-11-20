---
title: Backups
description: Back up and restore the single SQLite file that holds all Trail data.
sidebar:
  order: 2
---

Everything Trail records, plus your goals, is in one SQLite file (`TRAIL_DB`). Back up that file and you have backed up Trail.

## Online snapshot

`sqlite3 .backup` takes a consistent copy while Trail keeps running. Run it from cron on the host:

```sh title="crontab -e"
0 3 * * * sqlite3 /var/lib/trail/trail.db ".backup /backups/trail-$(date +\%F).db"
```

Inside a crontab `%` must be written as `\%`.

The Docker image is distroless and has no shell or `sqlite3`. Back up from the host by mounting the volume into a throwaway container:

```sh
docker run --rm -v trail-data:/data -v /backups:/backups alpine \
  sh -c 'apk add -q sqlite && sqlite3 /data/trail.db ".backup /backups/trail-$(date +%F).db"'
```

## Cold copy

When Trail is stopped, a plain `cp` of the `.db` file is a complete backup. While it runs, use `.backup` above instead: a copy of the file alone can miss recent writes that are still in the `-wal` file next to it.

## Restore

1. Stop Trail.
2. Replace the file at `TRAIL_DB` with the backup, and delete any `-wal` and `-shm` files beside it.
3. Start Trail.

Moving to a new server is the same: copy the file over and point `TRAIL_DB` at it.

## What a backup does not hold

The private-mode daily key and the sessions of private visitors live only in memory. After a restart or a restore, a private visitor who comes back the same day is counted as new.
