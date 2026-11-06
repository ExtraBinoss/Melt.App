import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { MODEL_ID, MODEL_REVISION } from "../apps/web/src/services/selection/model/manifest";

const baseURL = process.env.MUSART_BASE_URL ?? "http://127.0.0.1:6100";
const moduleURL =
  process.env.MUSART_SEGMENTATION_MODULE ?? `${baseURL}/src/services/selection/sam.ts`;
const encodeURL = new URL("encode-mask" + (moduleURL.endsWith(".js") ? ".js" : ".ts"), moduleURL)
  .href;
const output = process.env.MUSART_SEGMENTATION_OUTPUT ?? "artifacts/segmentation.json";
const imageURL =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/corgi.jpg";
const started = performance.now();
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  baseURL,
  model: process.env.MUSART_SEGMENTATION_MODEL_ID ?? MODEL_ID,
  revision: process.env.MUSART_SEGMENTATION_REVISION ?? MODEL_REVISION,
  imageSource: imageURL,
  notes: [
    "Real production SAM module and real pinned ONNX weights. No model/inference mocks.",
    "Headless Chromium with Vulkan enabled. Adapter information is recorded separately; timings are environment-specific.",
  ],
  attempts: [],
};
const errors: string[] = [];
const requests: Array<{ url: string; status?: number; failure?: string }> = [];
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text().slice(0, 1000));
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.url().startsWith("https://")) {
    const url = new URL(response.url());
    requests.push({ url: url.origin + url.pathname, status: response.status() });
  }
});
page.on("requestfailed", (request) => {
  const url = new URL(request.url());
  requests.push({
    url: url.origin + url.pathname,
    failure: request.failure()?.errorText ?? "Unknown failure",
  });
});
await page.route(`${baseURL}/__segmentation_check__`, (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><title>Melt real segmentation verification</title><button style="width:160px;height:80px">Input probe</button></html>',
  }),
);
await page.goto(`${baseURL}/__segmentation_check__`);
report.adapter = await page.evaluate(async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return null;
  const { vendor, architecture, device, description, isFallbackAdapter } = adapter.info;
  return { vendor, architecture, device, description, isFallbackAdapter };
});
await page.exposeFunction("samProgress", (phase: unknown) =>
  console.log(JSON.stringify({ segmentation: phase })),
);
const workerSource = `
const moduleURL=${JSON.stringify(moduleURL)};
self.onmessage=async({data})=>{
 try{
  if(data.forceWasm){
   const original=navigator;
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:new Proxy(original,{has:(target,key)=>key==='gpu'?false:Reflect.has(target,key),get:(target,key)=>key==='gpu'?undefined:Reflect.get(target,key,target)})});
  }
  const {prepareSam,segmentObject,segmentPrompt,releaseSam}=await import(moduleURL);
  const {encodeMask}=await import(${JSON.stringify(encodeURL)});
  const begin=performance.now();
  self.postMessage({phase:'preparing',mode:data.mode});
  let submissions=0;
  if(typeof GPUQueue!=='undefined'){
   const submit=GPUQueue.prototype.submit;
   GPUQueue.prototype.submit=function(commands){submissions++;return submit.call(this,commands);};
  }
  const loaded=await prepareSam();
  let encoderRuns=0;
  const encode=loaded.encoder.run.bind(loaded.encoder);
  loaded.encoder.run=async(...args)=>{
   encoderRuns++;const outputs=await encode(...args);
   if(!Object.values(outputs).every(tensor=>tensor.location==='gpu-buffer'))throw Error('Image embeddings did not remain on GPU');
   return outputs;
  };
  const prepared=performance.now();
  self.postMessage({phase:'model-ready',mode:data.mode,prepareMs:prepared-begin});
  const masks=[];
  for(const point of [[340,250],[345,255],[350,260],[338,252],[342,252],[344,249],[341,251],[339,253],[343,254],[340,250]]){
   const start=performance.now();
   const result=await segmentObject(data.image,point[0],point[1]);
   let selected=0,transparent=0;const histogram={};
   for(let index=3;index<result.data.length;index+=4){const alpha=result.data[index];if(alpha>0)selected++;else transparent++;histogram[alpha]=(histogram[alpha]??0)+1;}
   if(result.data.length!==result.width*result.height*4||selected===0||transparent===0)throw new Error('Real model returned invalid, empty or fully opaque mask');
   const encoded=await encodeMask(result);if(encoded.blob.type!=='image/png'||encoded.blob.size===0)throw new Error('Worker PNG encoding failed');
   const durationMs=performance.now()-start;
   const png=data.capture?Array.from(new Uint8Array(await encoded.blob.arrayBuffer())):undefined;
   masks.push({point,png,pngBytes:encoded.blob.size,width:result.width,height:result.height,pixels:result.width*result.height,selected,transparent,alphaHistogram:histogram,durationMs});
   self.postMessage({phase:'mask-ready',mode:data.mode,index:masks.length,durationMs:masks.at(-1).durationMs});
  }
  const sessions=Object.entries(loaded.model.sessions??{}).map(([name,session])=>({name,config:session.config??null}));
  const checks=[];
  for(const [name,prompt] of [
   ['exclude',{points:[{x:340,y:250,label:1},{x:50,y:50,label:0}]}],
   ['exclude-warm',{points:[{x:340,y:250,label:1},{x:55,y:50,label:0}]}],
   ['rectangle',{points:[],box:{x:220,y:130,right:560,bottom:340}}],
   ['rectangle-warm',{points:[],box:{x:215,y:130,right:565,bottom:340}}],
  ]){
   const start=performance.now();const mask=await segmentPrompt(data.image,prompt);
   const alpha=(x,y)=>mask.data[(y*mask.width+x)*4+3];
   if(alpha(340,250)!==255||alpha(50,50)!==0)throw new Error('Point/rectangle refinement did not keep the subject and exclude the background');
   checks.push({name,durationMs:performance.now()-start,foreground:alpha(340,250),background:alpha(50,50)});
  }
  const cache=await caches.open('transformers-cache');
  const cacheKeys=(await cache.keys()).map(request=>{const url=new URL(request.url);return url.origin+url.pathname;});
  if(encoderRuns!==1||submissions===0)throw Error('Real refinement did not reuse one GPU image encoding');
  await releaseSam();
  self.postMessage({done:true,result:{mode:data.mode,forceWasm:data.forceWasm,prepareMs:prepared-begin,totalMs:performance.now()-begin,masks,checks,encoderRuns,submissions,sessions,cacheKeys}});
 }catch(error){self.postMessage({done:true,error:error instanceof Error?{message:error.message,stack:error.stack}:String(error)});}
};`;
try {
  if (process.env.MUSART_SEGMENTATION_WEIGHTS_BASE) {
    const primedAt = performance.now();
    await page.evaluate(async (base) => {
      const response = await fetch(`${base}/manifest.json`);
      if (!response.ok) throw Error("Pinned verification manifest is unavailable.");
      const manifest = (await response.json()) as {
        id: string;
        revision: string;
        files: Record<string, number>;
      };
      const cache = await caches.open("transformers-cache");
      for (const file of Object.keys(manifest.files)) {
        const weights = await fetch(`${base}/${file.split("/").at(-1)}`);
        if (!weights.ok) throw Error("Pinned verification weights are unavailable.");
        await cache.put(
          `https://huggingface.co/${manifest.id}/resolve/${manifest.revision}/${file}`,
          weights,
        );
      }
    }, process.env.MUSART_SEGMENTATION_WEIGHTS_BASE);
    report.cachePrimingMs = performance.now() - primedAt;
    report.notes = [
      ...(report.notes as string[]),
      "Download cache primed from local pinned bytes before session timing; production SHA-256 verification remains active. WAN download speed is not measured.",
    ];
  }
  const imageResponse = await fetch(imageURL);
  if (!imageResponse.ok) throw new Error(`Official image unavailable: ${imageResponse.status}`);
  const image = `data:image/jpeg;base64,${Buffer.from(await imageResponse.arrayBuffer()).toString("base64")}`;
  report.imageDataUrlCharacters = image.length;
  const run = async (mode: string, forceWasm: boolean) => {
    console.log(JSON.stringify({ segmentation: { phase: "run-start", mode } }));
    await page.evaluate(() => {
      const probe = {
        samples: [] as number[],
        frames: [] as number[],
        running: true,
        last: performance.now(),
      };
      Object.assign(window, { __samInput: probe });
      document.querySelector("button")!.onclick = (event) => {
        if (!event.isTrusted) throw new Error("The probe requires native input");
        requestAnimationFrame(() => probe.samples.push(performance.now() - event.timeStamp));
      };
      const frame = (now: number) => {
        probe.frames.push(now - probe.last);
        probe.last = now;
        if (probe.running) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    let completed = false;
    const inference = page.evaluate(
      async ({ source, image, mode, forceWasm, capture }) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
          const worker = new Worker(url, { type: "module" });
          const timer = setTimeout(() => {
            worker.terminate();
            URL.revokeObjectURL(url);
            reject(new Error("Real segmentation exceeded two minutes"));
          }, 120000);
          worker.onmessage = ({ data }) => {
            if (!data.done) {
              const bridge = (window as unknown as { samProgress: (phase: unknown) => void })
                .samProgress;
              bridge(data);
              return;
            }
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(url);
            if (data.error) resolve({ mode, ok: false, error: data.error });
            else resolve({ ok: true, ...data.result });
          };
          worker.onerror = (event) => {
            clearTimeout(timer);
            worker.terminate();
            URL.revokeObjectURL(url);
            reject(new Error(event.message));
          };
          worker.postMessage({ image, mode, forceWasm, capture });
        }),
      {
        source: workerSource,
        image,
        mode,
        forceWasm,
        capture: process.env.MUSART_SEGMENTATION_CAPTURE === "1",
      },
    );
    void inference
      .finally(() => {
        completed = true;
      })
      .catch(() => {});
    while (!completed) {
      await page.mouse.click(80, 40);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const result = await inference;
    if (Array.isArray(result.masks)) {
      for (const [index, mask] of (result.masks as Record<string, unknown>[]).entries()) {
        if (!Array.isArray(mask.png)) continue;
        const file = join(dirname(output), `${mode}-${index}.png`);
        await writeFile(file, new Uint8Array(mask.png as number[]));
        delete mask.png;
        mask.capture = file;
      }
    }
    const responsiveness = await page.evaluate(() => {
      const probe = (
        window as unknown as {
          __samInput: { running: boolean; samples: number[]; frames: number[] };
        }
      ).__samInput;
      probe.running = false;
      const sorted = [...probe.samples].sort((a, b) => a - b);
      return {
        nativeInputCount: sorted.length,
        inputToRafP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
        maxInputToRafMs: Math.max(0, ...sorted),
        maxRafGapMs: Math.max(0, ...probe.frames),
      };
    });
    Object.assign(result, { responsiveness });
    (report.attempts as unknown[]).push(result);
    await writeFile(
      output,
      JSON.stringify({ ...report, requests, consoleErrors: errors }, null, 2),
    );
    console.log(JSON.stringify({ segmentation: { phase: "run-complete", mode, ok: result.ok } }));
    return result;
  };
  await mkdir(dirname(output), { recursive: true });
  const gpu = await run("adapter-selected-cold-and-warm", false);
  if (!gpu.ok) throw new Error(`Model preparation/inference failed: ${JSON.stringify(gpu.error)}`);
  if (process.env.MUSART_SEGMENTATION_SINGLE === "1") {
    report.offlineVerification = "Not requested in this bounded run.";
  } else {
    let blocked = 0;
    await context.route("https://**/*", (route) => {
      blocked++;
      return route.abort("internetdisconnected");
    });
    const wasm = await run("webgpu-fresh-worker-remote-network-blocked", false);
    report.blockedRemoteRequests = blocked;
    if (!wasm.ok)
      throw new Error(
        `Cached WebGPU inference failed with remote network blocked: ${JSON.stringify(wasm.error)}`,
      );
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure =
    error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  process.exitCode = 1;
} finally {
  report.totalMs = performance.now() - started;
  report.requests = requests;
  report.consoleErrors = errors;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(
    JSON.stringify({
      segmentation: {
        phase: "finished",
        ok: report.ok,
        totalMs: report.totalMs,
        report: output,
        failure: report.failure ?? null,
      },
    }),
  );
}
