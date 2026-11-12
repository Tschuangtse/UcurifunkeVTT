function applyMissingDefaults(document, data, defaults, prefix = "") {
  const changes = {};
  for (const [field, value] of Object.entries(defaults)) {
    const path = prefix + field;
    if (data[path] === undefined && foundry.utils.getProperty(data, path) === undefined) {
      changes[path] = value;
    }
  }
  if (Object.keys(changes).length) document.updateSource(changes);
}

function tokenDefaults() {
  return {
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    "sight.enabled": true
  };
}

Hooks.on("preCreateActor", (actor, data) => {
  applyMissingDefaults(actor, data, tokenDefaults(), "prototypeToken.");
});

Hooks.on("preCreateToken", (token, data) => {
  applyMissingDefaults(token, data, tokenDefaults());
});

Hooks.on("preCreateScene", (scene, data) => {
  applyMissingDefaults(scene, data, { padding: 0.1, "environment.globalLight.enabled": true });
});
