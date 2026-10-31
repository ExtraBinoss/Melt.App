import { expect, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

/** Inspect browser-presented pixels outside all moving windows, after cadence measurement. */
export async function checkBloomBackdrop(canvas: Locator, folder: string) {
  await mkdir(folder, { recursive: true });
  for (let index = 0; index < 8; index++) {
    await canvas.screenshot({ path: `${folder}/${index}.png` });
    await canvas.page().waitForTimeout(80);
  }
  const samples = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys,json
from PIL import Image,ImageStat
p=sys.argv[1];samples=[]
for i in range(8):
 im=Image.open(f'{p}/{i}.png').convert('RGB')
 strip=im.crop((0,0,max(1,round(im.width*.12)),im.height))
 samples.append(sum(ImageStat.Stat(strip).mean)/3)
print(json.dumps(samples))
`,
        folder,
      ],
      { encoding: "utf8" },
    ),
  ) as number[];
  await writeFile(`${folder}/luminance.json`, JSON.stringify(samples));
  expect(Math.min(...samples)).toBeGreaterThan(40);
}
