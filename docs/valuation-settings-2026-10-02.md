# Valuation settings and request diagnostics — 2026-10-02

## Report and scope

Enabling cowbell/task-token asset values followed by crafted keys and ignoring
cowbells in chest returns reportedly made MWITools stop working; the CN site
also reportedly refused access. No exact HTTP error or failing response was
available. Excessive API calls were suggested as a possible cause.

## Evidence

- Ego Space 13, logged-in international character: enabled all four switches
  using the settings UI. No page error/unhandled rejection was captured.
  Instrumented outgoing game WebSocket messages contained only normal pings
  during the diagnostic window (19 pings). This observation does not cover
  userscript-manager HTTP traffic or prove that other accounts cannot fail.
- The CN homepage opened normally in the same browser; that site was not logged
  in. No access-control bypass, guest account creation or repeated retry was
  attempted. The reported refusal is not reproduced.
- An offline copy of public game definitions and available market prices valued
  cowbells and task tokens and projected all 22 openable items with crafted keys
  and cowbell exclusion. No recursion failure; slowest chest approximately
  11 ms on this machine. This is not a complete simulation of character buffs.
- The market request layer lacked both in-flight coalescing and error backoff.
  A mock returning HTTP 429 to 50 concurrent callers generated 100 requests
  (primary plus fallback per caller). Ten additional calls immediately produced
  20 more requests. This is a confirmed amplification defect, but its connection
  to the reported outage remains unproven.

## Fix and verification

- Coalesce concurrent price fetches per environment, including startup's forced
  fetch. Test, CN and international request state remains separate.
- Keep a local cache-excluded retry deadline across reloads. Successful forced
  refreshes have a 30-second minimum gap; failures wait at least one minute;
  HTTP 403/429 wait at least five minutes. Longer Retry-After values, including
  HTTP dates, are respected. Cached data remains available during the delay.
- The same mocked 50-call scenario now sends two requests total. Subsequent calls
  during cooldown send none; a successful response is accepted after expiry.
- Tests cover forced refreshes, stale-cache reuse, persistent deadlines in a new
  module, HTTP-date Retry-After, and test-server isolation.

The live four-switch test did not establish a crash or account restriction.
Do not describe this patch as a verified fix for every reported failure. Exact
failure text/status and the failing URL are still needed if it recurs. Original
switch values were restored after testing; no game resources were consumed.
