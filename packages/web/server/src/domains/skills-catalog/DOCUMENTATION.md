# Skills catalog domain

Authoritative wire contract: [`../../contracts/skills.ts`](../../contracts/skills.ts).
Catalog scanning/install implementation lives here; `/api/config/skills*`
route ownership is in `../opencode/routes/skill-routes.ts`.

Repository source, selections, and installed-skill operations are parsed at the
server seam. Repository-relative skill paths must remain contained in the
selected repository. Supporting-file routes receive Express's decoded path and
validate and use that same decoded value exactly once; it must remain contained
in the installed skill directory. Do not validate one path representation and
use another.

Installation preserves installed and skipped items plus conflict/auth/network
states as contracted partial results. Clone, archive, and registry errors are
mapped to safe domain errors; raw repository/provider output is not a browser
contract.
