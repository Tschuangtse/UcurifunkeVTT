import test from "node:test";
import assert from "node:assert/strict";
import { activeEncounterForScene, getEncounterChoices, openTimeline, sceneEncounters, updateTimelineScale } from "../../src/tick/timelineControls.js";

test("timeline redraws and closes without constructing or closing a context menu", async () => {
  let prepared = 0;
  let closed = 0;
  globalThis.foundry = { applications: { api: {
    ApplicationV2: class {
      async _preRender() { prepared++; }
      async _onClose() { closed++; }
      async _prepareContext() { return {}; }
    },
    HandlebarsApplicationMixin: Base => Base
  } } };
  const { TimelineApp } = await import("../../src/tick/timeline.js");
  const app = new TimelineApp();
  await app._preRender({}, {});
  await app._preRender({}, {});
  await app._onClose({});
  assert.equal(prepared, 2);
  assert.equal(closed, 1);
});

test("starting combat updates the timeline without opening a context menu first", async () => {
  const { TimelineApp } = await import("../../src/tick/timeline.js");
  let startedDisplay = false;
  let starts = 0;
  const app = new TimelineApp();
  app.render = async function () {
    await this._preRender({}, {});
    startedDisplay = game.combat.started;
  };
  globalThis.game = {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    combat: {
      started: false, combatants: [], totalTicks: 15,
      getFlag(_scope, key) { return key === "events" ? [] : this.totalTicks; },
      async setFlag(_scope, _key, value) { this.totalTicks = value; },
      async startCombat() { starts++; this.started = true; }
    }
  };
  await TimelineApp._onStartCombat.call(app);
  assert.equal(startedDisplay, true);
  assert.equal(game.combat.totalTicks, 0);
  game.combat.totalTicks = 12;
  await TimelineApp._onStartCombat.call(app);
  assert.equal(starts, 1);
  assert.equal(game.combat.totalTicks, 12);
});

test("dice buttons are offered only to GMs and owners before combat starts", async () => {
  const { TimelineApp } = await import("../../src/tick/timeline.js");
  const combat = {
    started: false,
    getFlag() { return [{ id: "event", isEvent: true, ticks: 0 }]; }
  };
  combat.combatants = [true, false].map((isOwner, index) => ({
    id: String(index), name: String(index), parent: combat, isOwner,
    getFlag() { return { ticks: 0 }; }
  }));
  globalThis.game = {
    combat, user: { isGM: false },
    settings: { get: (_scope, key) => key === "scale" ? 1 : 0 }
  };
  const app = new TimelineApp();
  const visibility = async () => (await app._prepareContext({})).list
    .flatMap(group => group.items).map(item => [item.id, item.canRollInitiative])
    .sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(await visibility(), [["0", true], ["1", false], ["event", false]]);
  game.user.isGM = true;
  assert.deepEqual(await visibility(), [["0", true], ["1", true], ["event", false]]);
  combat.started = true;
  assert.deepEqual(await visibility(), [["0", false], ["1", false], ["event", false]]);
});

test("opening the timeline restores a minimized window and brings it to the front", async () => {
  const calls = [];
  const app = {
    minimized: true,
    async render(options) { calls.push(["render", options]); },
    async maximize() { calls.push(["maximize"]); this.minimized = false; },
    fitToTimeline() { calls.push(["fit"]); },
    bringToFront() { calls.push(["front"]); }
  };
  await openTimeline(app);
  assert.deepEqual(calls, [["render", { force: true }], ["maximize"], ["fit"], ["front"]]);
  calls.length = 0;
  await openTimeline(app);
  assert.deepEqual(calls, [["render", { force: true }], ["fit"], ["front"]]);
});

test("changing scale updates both window position and rendered toolbar", async () => {
  let displayedScale = 0.75;
  const app = {
    rendered: true,
    setPosition(position) { this.scale = position.scale; },
    async render(options) {
      assert.deepEqual(options.parts, ["main"]);
      displayedScale = this.scale;
    }
  };
  await updateTimelineScale(app, 0.5);
  assert.equal(app.scale, 0.5);
  assert.equal(displayedScale, 0.5);
  await updateTimelineScale(app, 1.25);
  assert.equal(displayedScale, 1.25);
  app.rendered = false;
  await updateTimelineScale(app, 1.5);
  assert.equal(displayedScale, 1.25);
});

test("unnamed encounters use descriptive labels instead of internal IDs", () => {
  const choices = getEncounterChoices([
    { id: "secret-id-1", name: "Brückenkampf", started: true },
    { id: "secret-id-2", scene: { name: "Wald" } },
    { id: "secret-id-3" }
  ]);
  assert.deepEqual(choices.map(choice => choice.label), [
    "Brückenkampf (in progress)", "Wald (not started)", "Encounter 3 (not started)"
  ]);
  assert.equal(choices[2].id, "secret-id-3");
});
test("only active encounters in the selected scene compete for the timeline", () => {
  const combat = (id, scene, active, started, ticks = 0) => ({
    id, scene: { id: scene }, active, started, getFlag: () => ticks
  });
  const entries = [
    combat("archive", "a", false, true, 300),
    combat("draft", "a", true, false),
    combat("in-progress", "a", true, true, 200),
    combat("other-scene", "b", true, true, 500)
  ];
  assert.deepEqual(sceneEncounters(entries, "a").map(entry => entry.id), ["archive", "draft", "in-progress"]);
  assert.equal(activeEncounterForScene(entries, "a").id, "in-progress");
  assert.equal(activeEncounterForScene(entries, "b").id, "other-scene");
  assert.equal(activeEncounterForScene(entries, "c"), undefined);
});
