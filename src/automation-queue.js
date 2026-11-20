const scope = "ucurifunke";
const handlers = new Map();
let running = false;
let tasks = Promise.resolve();
export function serializeAutomation(fn) {
  const next = tasks.catch(() => {}).then(fn);
  tasks = next;
  return next;
}
export const automationAuthority = () => Boolean(globalThis.game?.user?.isGM
  && (!game.users.activeGM || game.users.activeGM.id === game.user.id));

export function registerAutomation(kind, handler) { handlers.set(kind, handler); }

export async function requestAutomation(kind, target, payload = {}) {
  if (!game.user?.isGM && !game.users.activeGM) throw new Error("Für diese Änderung muss eine Spielleitung verbunden sein.");
  const id = foundry.utils.randomID();
  await game.user.setFlag(scope, `automationRequests.${id}`, { kind, target, payload, status: "pending", at: Date.now() });
  void processAutomation();
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = game.user.getFlag(scope, "automationRequests")?.[id];
    if (result?.status === "done") {
      await game.user.unsetFlag(scope, `automationRequests.${id}`);
      return result.result;
    }
    if (result?.status === "error") {
      await game.user.unsetFlag(scope, `automationRequests.${id}`);
      throw new Error(result.error);
    }
    await new Promise(resolve => setTimeout(resolve, 125));
  }
  ui.notifications.warn("Die Änderung ist vorgemerkt und wartet auf die Spielleitung.");
  return null;
}

export async function processAutomation() {
  if (running || !automationAuthority()) return;
  running = true;
  try {
    let request;
    do {
      request = [...game.users].flatMap(user => Object.entries(user.getFlag(scope, "automationRequests") ?? {})
        .filter(([id, entry]) => /^[a-zA-Z0-9]{16}$/.test(id) && entry?.status === "pending" && handlers.has(entry.kind))
        .map(([id, entry]) => ({ ...entry, user, id }))).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))[0];
      if (!request || !automationAuthority()) break;
      const { user, id } = request;
      try {
        if (typeof request.target !== "string" || request.target.length > 512) throw new Error("Ungültiges Ziel.");
        const document = await fromUuid(request.target);
        if (!document) throw new Error("Das Ziel ist nicht mehr vorhanden.");
        if (!user.isGM && !document.canUserModify(user, "update")) throw new Error("Keine Berechtigung für dieses Ziel.");
        request.plan = [...game.users].filter(owner => owner.isGM).map(owner => owner.getFlag(scope, "automationPlans")?.[user.id + id]).find(Boolean);
        const savePlan = async plan => {
          await game.user.setFlag(scope, `automationPlans.${user.id + id}`, plan);
          request.plan = plan;
          return plan;
        };
        const result = await serializeAutomation(() => handlers.get(request.kind)({ ...request, document, savePlan }));
        await user.setFlag(scope, `automationRequests.${id}`, { ...user.getFlag(scope, "automationRequests")[id], status: "done", result: result ?? true });
      } catch (error) {
        console.error("Ucurifunke automation", request.kind, error);
        await user.update({ [`flags.${scope}.automationRequests.${id}.status`]: "error",
          [`flags.${scope}.automationRequests.${id}.error`]: error.message ?? "Die Änderung ist fehlgeschlagen." });
      }
    } while (request);
  } finally { running = false; }
}

// A request may be resumed after a GM disconnect. Each resource write carries its
// receipt in the same Actor update as the changed values.
export async function updateActorOnce(actor, receipt, changes) {
  const applied = actor.getFlag(scope, "automationApplied") ?? [];
  if (applied.includes(receipt)) return false;
  await actor.update({ ...changes, [`flags.${scope}.automationApplied`]: [...applied.slice(-511), receipt] }, { uqAutomation: true });
  return true;
}

Hooks.on("updateUser", (_user, changes) => {
  if (changes.flags?.ucurifunke?.automationRequests) void processAutomation();
});
Hooks.on("userConnected", () => void processAutomation());
Hooks.once("ready", () => void processAutomation());
