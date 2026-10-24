# Service pressure and uncluttered tavern

Goal: immersive readable scene with a meaningful service pipeline and growth pressure.
Architecture: retain browser ES modules/Canvas, existing sprites and real streaming AI. No backend or key persistence.
User request is authorization for implementation; numerical rules below are builder decisions and can be tuned.

Approach: extend existing simulation rather than replace it. Dense dashboard would obscure the tavern; pure automation would remove owner decisions. Use light HUD, direct management, human intervention plus specialized employees.

Shared contracts (agents must report any deviation):
- content.js: retain all existing IDs; TABLE_LAYOUT expands to6 with t5/t6 at x765,y470/705, existing four unchanged. export TABLE_COSTS=[0,0,240,720,2160,6480], MAX_STAFF=3, REQUESTS definitions and RARITIES (if placed progression export there instead; tell coordinator).
- tables retain full6 fixed layout entries. enabled true only first2 in fresh game; locked rest. New table fields patienceMax:number, request:null|{id,fulfilled:boolean}, order.ready:boolean optional. New status 'ready' means kitchen has prepared meal, waiting pickup. Existing status 'preparing' remains for jobs.
- roles retain all/bar/floor IDs. bar cooks only (ready output), floor picks/delivers/cleans only, all is slower generalist and can whole-service for old compatibility. Distinct traits on STAFF definitions affect actual simulation. Max3 active of4; fire-staff ready only, cannot fire last employee, charged hiring sunk cost.
- New actions expand-table (next disabled table only, ready phase), fulfill-request {table}, player-pickup {table}, fire-staff {id}. Use existing role, hire, player-work/clean/deliver. Explicit requests alter preparation/reward/patience; refusal/timeout causes missed guest and breaks combo. No LLM awaited by economic rules.
- Customers navigate obstacle-aware aisle then short seating transition; no warping through tables, coherent pair motion. Closing clears guest/order/work locks instantly after one-time accounting; closed save migration clears legacy guests too.
- Recipes expand to12, drinks9, rarity common/rare/epic/legendary with different effective prices. Draw remains10 inspiration random, probability55/30/13/2, fifth after4commons rare+ (75/23/2). Duplicate refund4. Keep single equipped as previous; menu explains.
- UI direct visit opensPanel, no player route changes. Still walks for physical staff/table interaction. HUD no station labels/table numbers/chat buttons floating over every object. Show contextual hints via hover, order icon+patience ring only; fewer persistent cards. Body16px+, labels14px+, numbers tabular sans30px+. Charcoal/glass, warm ivory modal, amber accent, no sage green panels.

Tasks (shared checkout, disjoint owners):
- [x] Engine/content/progression + meaningful pipeline/economic regression tests: worker A.
- [x] UI app/views/party-views/index/style/party.css: worker B.
- [x] Canvas renderer/navigation + render/navigation tests: worker C.
- [x] Coordinator storage migration/AI context/browserQA/docs/integration/review.

Review focus: ready dish saving/cancellation, paid once under sponsored bills, partial staff saves, old4table saves, request timeouts locked jobs, expansion reachability, no HUD overlap at1366x768/1920x1080, no credentials in saves/reports.

## Completion ledger
- [x] Engine/content/progression and service regressions.
- [x] UI, direct actions, role/request/expansion controls.
- [x] Canvas/navigation, room camera, patience and customer facing.
- [x] Storage migration, reserve memory, AI live context.
- [x] Native16drink asset and source-coordinate regression.
- [x] Final98JS/3Python; browser13core latest checks + realAI independently verified.
Rulings after integration: pending requests wait before cooking; table details open instantly; physical prep/pickup/delivery remain walking. Expanded demand grows12% per purchased table plus3% each day capped10 days and1.75 total growth. Fourth legacy staff moves to reserve with memory retained. Equipped recipes enable their base menu but grant no free stock. Camera deadzone centers room and retains edge following. No main story implemented.
