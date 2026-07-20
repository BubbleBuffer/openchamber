# Contract module index

Each TypeScript module in this directory owns runtime-neutral OpenChamber wire
contracts for the named domain. `common` provides shared parsing and safe error
responses; `route-inventory` is the authoritative route ownership inventory.
SDK proxy, find, and tool payloads are pass-through and intentionally excluded.

Contract modules must not import server or browser runtime dependencies. Their
domain tests and `contract-matrix.test.ts` exercise parser compatibility.
