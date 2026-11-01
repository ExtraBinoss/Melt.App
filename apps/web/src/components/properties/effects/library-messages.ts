import { messages as material } from "./library/material/messages";
import { messages as bevel } from "./library/bevel/messages";
import { messages as displace } from "./library/displace/messages";
import { messages as thermal } from "./library/thermal/messages";
import { registerFeatureTranslations } from "../../../state/i18n/feature-resources";
import { messages as ascii } from "./library/ascii/messages";
import shadow from "./library/shadow/messages.json";
import morph from "./library/morph/messages.json";
import ripple from "./library/ripple/messages.json";
import shatter from "./library/shatter/messages.json";
import noise from "./library/noise/messages.json";

import flashlight from "./library/flashlight/messages.json";
import circle from "./library/circle/messages.json";
import cyanotype from "./library/cyanotype/messages.json";
import crt from "./library/crt/messages.json";
import datamosh from "./library/datamosh/messages.json";
import bitDither from "./library/bit-dither/messages.json";
import receipt from "./library/receipt/messages.json";
import pinkPhosphor from "./library/pink-phosphor/messages.json";
/** UI resources stay on the web side; the core catalog only contains stable label keys. */
export const libraryMessages = {
  bevel,
  displace,
  thermal,
  ascii,
  morph,
  shadow,
  ripple,
  shatter,
  noise,
  flashlight,
  circle,
  cyanotype,
  crt,
  datamosh,
  "bit-dither": bitDither,
  receipt,
  "pink-phosphor": pinkPhosphor,
};
for (const [type, messages] of Object.entries(libraryMessages)) {
  registerFeatureTranslations(`${type}Fx`, messages);
}
const labels: Record<string, Record<string, string>> = {};
for (const [type, messages] of Object.entries(libraryMessages)) {
  for (const [language, resource] of Object.entries(messages))
    if (typeof resource.name === "string") (labels[language] ??= {})[type] = resource.name;
}
registerFeatureTranslations("translation", labels);

registerFeatureTranslations("materialFx", material);
