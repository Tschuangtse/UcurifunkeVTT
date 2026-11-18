export const emitsLight = token => token.light.bright > 0 || token.light.dim > 0;

export function suspendLightUpdate(token) {
  if (!emitsLight(token)) return null;
  return {
    "light.bright": 0, "light.dim": 0,
    "flags.ucurifunke.suspendedTokenLight": token.light.toObject()
  };
}

export function restoreLightUpdate(token) {
  const previous = token.getFlag("ucurifunke", "suspendedTokenLight");
  if (!previous || !(previous.bright > 0 || previous.dim > 0)) return null;
  return { light: previous, "flags.ucurifunke.suspendedTokenLight": null };
}
