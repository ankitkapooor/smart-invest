# Bounded company loading

The browser previously had no total request deadline, loaded a saved Apple example
before a requested company, and restored existing data after a failed request.
The API also fetched up to four peer companies sequentially before returning the
requested company. Individual upstream timeouts were not an end-to-end limit;
edge-cache operations had no deadline. An open Apple tab was independently
observed running an older UI version.

The corrected flow requests core company data with `includePeers=0`, then fetches
peer comparisons separately through `/api/peers`. Peer failures leave the company
visible with a quality warning. Late responses and cancelled searches cannot
overwrite a newer company; user-edited assumptions are preserved when peers arrive.
The server core request has a 30-second deadline, the browser has a 35-second
whole-operation deadline, and peers have separate bounds. Cache reads/writes are
bounded to one second. The loading message shows elapsed time. Errors show the
requested company and an explicit retry button, without silently displaying a
saved example or the previous company. Startup no longer loads `/example.json`.

The client handles HTML 503 pages as readable service errors. A release check
offers a reload when a later deployment is detected, and HTML/JS assets require
cache revalidation. Open pages need one reload to obtain this new code.

Four regression tests cover a never-resolving request, a never-resolving body,
HTML errors, cancellation, the server 504 deadline and an actual normalized
Costco response that completes without any peer request. A subsequent simulated
peer HTTP 503 is isolated from the core data. The existing valuation and research
tests remain in place.

This patch addresses request lifecycle and stale-display behavior. It does not
change economic assumptions or reprice Apple. The remaining valuation limitations
are documented in `../2026-10-21-valuation-audit/REPORT.md`.
