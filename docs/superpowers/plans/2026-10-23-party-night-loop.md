# Party Night Loop — approved implementation scope

User: “好，按你说的做，其实没什么主线剧情，这块暂时搁置”。The prior concrete sample is approved: recipe draw, two nightly strategies, combo feedback, one party and one cameo. No story campaign or new manufacturer character designs.

## Constraints
- Frontend only, browser direct real LLM; secrets never enter source/assets/saves/reports.
- Fullscreen modern tavern, human mouse-controlled owner; current employee placeholders remain.
- All delegated agents explicitly GPT-6.1-Sol maximum. Shared current checkout on feature branch; agents own disjoint files.
- Preserve older v1 saves and economic invariants. Gameplay does not wait for model; no fabricated AI success or reply text.

## Product decisions
- Permanent inspiration currency; start with30, a recipe draw costs10. Six recipe variants over existing ale/citrus/tea bases; one equipped recipe per night. Duplicate returns4 inspiration. Fifth draw without rare/epic guarantees at least rare. Visible odds and pity. No paid currency.
- Two ready-phase-only strategies: quick service (faster prep/lower unit price) and premium (slower prep/higher price). Recipe choice is likewise before opening; draws available any phase.
- Combo shared by owner/staff: timely service chains within55 game seconds; 3/6/10 tiers boost income and capped customer flow. Visible expiry meter. First reach3/6/10 rewards inspiration once per day; simple daily goals, no story quests.
- Party once per day,60 gold, ready/early-open schedules at300s; later open starts now when>=120s remain. Duration120s, themed lights/music/confetti, faster capped arrivals and higher payout. Earn completion reward once, explicit service goal.
- Fictional Jensen paying for all guests cameo: automatic once per day at120s, active60s, adds a real drink receipts deferred into a bill pot, pays once at exit or early closing. Not a second AI; pixel guest/sprite, no LLM delay.
- AI: player speech preempts ambient chatter; real streamed reply with immediate visual acknowledgement, partial text never persists as final. Context includes recipe, combo, strategy, party/cameo and real recent events. Proposals accept only whitelisted actions, spending through explicit UI.
- Feel: preserve in-progress manual preparation when walking away; return to bar/table to resume. Ground destination indicator, work gestures, coin particles, low volume procedural WebAudio after mouse interaction, mute/reduced-motion controls.

## Interfaces
`src/progression.js` owns RECIPES/STRATEGIES, createProgression(), publicProgression(p), parseProgression(raw,state), drinkInfo(s,id), progression economic helpers. `s.progression` schema documented there and shared before integration. Engine act adds draw-recipe/equip-recipe/set-strategy/start-party. Existing event action aliases party; existing action return shape {ok,message,...} preserved.
`createInteractions` API remains, status adds partial string; real client options.onPartial(text). requestStaffReply still returns structured {speech,memory,suggestion}. Old nonstream JSON tests remain compatible. DOM integration owned by root.
Renderer draw/paint/project/hitTest interfaces stay; effects derive only emitted events and progression state. New event-atlas source PNG, manifest frames0..3 cameo,4bill,5ticket,6recipe,7inspiration,8..11drink variants,12confetti,13disc,14coins,15glass.

## Tasks and acceptance
- [x] A. Progression/engine: tests first for draws/pity/dupes, strategy actual effects, combo/timeouts, party and cameo bounded once-only payouts, reset/migration, manual resume.
- [x] B. AI: streamed parsing/cancellation/preemption tests; meaningful event context; preserve memory and asynchronous safety.
- [x] C. Art/render/feel: new16-frame transparent source, manifest/gallery, cameo, party/coins, actionable mouse hints and gestures; no obstruction of main room.
- [x] D. Root integration: save migration and whitelist, small recipe/strategy/party panels, HUD combo/inspiration, draw reveal, AI partial/UI confirmation, mute and sound hook.
- [x] E. Browser end-to-end real model plus offline/no-key, real frame-loop full day, recipe/strategy/party/cameo/old-save/reload and no-credentials checks; screenshots visual check.
- [x] F. One fresh independent review, fix meaningful findings, full tests, docs/release package. Deliver running local sample; main story deferred.

## Progress / rulings
- Ruling: feature branch in current checkout, no new worktree, to retain current launcher and shared asset paths; file ownership prevents concurrent edits.
- Ruling: one equipped recipe slot avoids inventory expansion and keeps every draw immediately understandable; base stock remains three kinds.
