# Ledger Monitor One-Hour Load Test

## Recorded run

- Date: July 19, 2026
- Duration: 60 minutes
- PostgreSQL: PostgreSQL 16 in Docker
- Redis: Redis 7 in Docker
- Streaming engine: `StreamManager`
- SSE source: Local Horizon-compatible HTTP server

The test maintained 50 persistent SSE connections for 25 watched accounts. A
26th account exceeded the connection limit and used the 30-second polling
fallback. The test recorded memory usage and connection counts once per minute.

The SSE server sent connection heartbeats but no ledger events. This exercised
the idle-connection lifecycle, memory stability, polling fallback, cursor-based
restart, and connection cleanup without mixing transaction volume into the
memory-leak measurement.

## Result

```json
{
  "durationMinutes": 60,
  "sseSockets": 50,
  "sseGroups": 25,
  "pollingFallbackGroups": 1,
  "samples": 60,
  "initialHeapMb": 59.67,
  "finalHeapMb": 53.73,
  "heapGrowthMb": -5.94,
  "heapSlopeMbPerMinute": -0.0198,
  "restartCursor": "0",
  "restartDuplicates": 0,
  "shutdownSockets": 0
}
```

All 50 SSE connections remained active throughout the run. Heap usage did not
grow over the hour. Shutdown closed every SSE connection, and the worker restart
resumed from the stored cursor without producing duplicate events.

The PostgreSQL and Redis containers used for the run were temporary and were
removed after verification.
