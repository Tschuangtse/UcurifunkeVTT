import { footprintOptions, portraitPosition, portraitScale } from "./token-footprint-data.js";

const footprints = new Map();

function removeFootprint(token) {
  const state = footprints.get(token);
  if (!state) return;
  if (!state.shadow.destroyed) state.shadow.destroy();
  footprints.delete(token);
}

export function refreshFootprint(token) {
  const mesh = token.mesh;
  if (token.destroyed || !mesh || mesh.destroyed) { removeFootprint(token); return; }
  const options = footprintOptions(token.document);
  if (!options.enabled) {
    if (footprints.has(token)) {
      removeFootprint(token);
      // Reapply Foundry's saved fitting and anchor without changing document data.
      token._refreshMesh();
      token._refreshPosition();
    }
    return;
  }

  const { width, height } = token.document.getSize();
  const side = Math.min(width, height);
  let { scaleX, scaleY } = portraitScale(token.document.texture);
  if (token.hasDynamicRing) {
    token.ring.configureSize({ fit: "contain" });
    if (CONFIG.Token.ring.isGridFitMode) {
      scaleX *= token.ring.subjectScaleAdjustment;
      scaleY *= token.ring.subjectScaleAdjustment;
    }
  }
  mesh.resize(side, side, { fit: "contain", scaleX, scaleY });
  mesh.anchor.set(0.5, 0.5);
  const position = portraitPosition(token.x, token.y, width, height, mesh.height);
  mesh.position.set(position.x, position.y);

  let state = footprints.get(token);
  if (!state || state.shadow.destroyed || state.shadow.parent !== canvas.primary) {
    removeFootprint(token);
    const shadow = canvas.primary.addChild(new foundry.canvas.primary.PrimaryGraphics({
      name: `ucurifunke-footprint-${token.objectId}`, object: token
    }));
    shadow.eventMode = "none";
    state = { shadow };
    footprints.set(token, state);
  }
  const { shadow } = state;
  shadow.visible = mesh.visible && mesh.renderable;
  shadow.renderable = mesh.renderable;
  shadow.alpha = mesh.alpha * options.opacity;
  shadow.elevation = mesh.elevation;
  // Keep shadows below portraits, including portraits of overlapping tokens.
  shadow.sortLayer = mesh.sortLayer - 0.01;
  shadow.sort = mesh.sort;
  shadow.zIndex = mesh.zIndex;
  shadow.position.set(token.x, token.y);
  const key = [width, height, options.color].join("|");
  if (key !== state.key) {
    shadow.clear().beginFill(Number.parseInt(options.color.slice(1), 16))
      .drawEllipse(width / 2, height / 2, width / 2, height / 2).endFill();
    state.key = key;
  }
}

function renderFootprintOptions(app, html) {
  const tab = html.querySelector('[data-application-part="appearance"]');
  if (!tab || tab.querySelector(".ucurifunke-footprint-options")) return;
  const options = footprintOptions(app.token ?? app.document);
  const prefix = `${app.id}-uc-footprint`;
  const section = document.createElement("fieldset");
  section.className = "ucurifunke-footprint-options";
  section.innerHTML = `<legend>Belegte Fläche</legend>
    <div class="form-group"><label for="${prefix}-enabled">Unverzerrtes Bild mit Schatten</label>
      <div class="form-fields"><input id="${prefix}-enabled" type="checkbox" name="flags.ucurifunke.footprint.enabled"></div>
      <p class="hint">Das Bild bleibt proportional und steht unten mittig. Die Ellipse kennzeichnet die gesamte belegte Fläche.</p></div>
    <div class="form-group"><label for="${prefix}-color">Schattenfarbe</label>
      <div class="form-fields"><input id="${prefix}-color" type="color" name="flags.ucurifunke.footprint.color"></div></div>
    <div class="form-group"><label for="${prefix}-opacity">Deckkraft</label>
      <div class="form-fields"><input id="${prefix}-opacity" type="range" name="flags.ucurifunke.footprint.opacity" min="0" max="1" step="0.05" data-dtype="Number"><output></output></div></div>`;
  const enabled = section.querySelector('input[type="checkbox"]');
  enabled.checked = enabled.defaultChecked = options.enabled;
  section.querySelector('input[type="color"]').value = options.color;
  const opacity = section.querySelector('input[type="range"]');
  opacity.value = String(options.opacity);
  const update = () => { section.querySelector("output").textContent = Number(opacity.value).toLocaleString("de-DE"); };
  opacity.addEventListener("input", update);
  update();
  const editable = app.isEditable ?? app.actor?.isOwner ?? app.document?.isOwner ?? false;
  for (const input of section.querySelectorAll("input")) input.disabled = !editable;
  tab.append(section);
}

Hooks.on("drawToken", refreshFootprint);
Hooks.on("refreshToken", refreshFootprint);
Hooks.on("destroyToken", removeFootprint);
Hooks.on("canvasTearDown", () => { for (const token of footprints.keys()) removeFootprint(token); });
Hooks.on("updateToken", (document, changes) => {
  if (changes.flags?.ucurifunke || Object.keys(changes).some(key => key.startsWith("flags.ucurifunke."))) {
    document.object?.renderFlags.set({ refreshMesh: true, refreshPosition: true });
  }
});
Hooks.on("renderTokenConfig", renderFootprintOptions);
Hooks.on("renderPrototypeTokenConfig", renderFootprintOptions);
