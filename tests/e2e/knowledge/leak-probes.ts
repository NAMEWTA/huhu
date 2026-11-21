import type { CDPSession } from "@playwright/test";

export function buildPdf(text: string): Buffer {
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R] /Count 1 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export function installLeakProbes() {
  const urls = new Set<string>();
  const workers = new Set<Worker>();
  const editorObservers = new WeakMap<MutationObserver, WeakRef<MutationObserver>>();
  const observerRefs = new Set<WeakRef<MutationObserver>>();
  const storageCalls: string[] = [];
  const networkChannels: string[] = [];
  let urlsCreated = 0;
  let urlsRevoked = 0;
  let workersCreated = 0;

  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    const url = create(object);
    urls.add(url);
    urlsCreated++;
    return url;
  };
  URL.revokeObjectURL = (url) => {
    if (urls.delete(url)) urlsRevoked++;
    revoke(url);
  };

  window.Worker = class extends Worker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      workers.add(this);
      workersCreated++;
    }
    override terminate() {
      workers.delete(this);
      super.terminate();
    }
  };
  window.WebSocket = class extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      networkChannels.push(String(url));
      super(url, protocols);
    }
  };
  window.EventSource = class extends EventSource {
    constructor(url: string | URL, options?: EventSourceInit) {
      networkChannels.push(String(url));
      super(url, options);
    }
  };

  const openDatabase = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (name, version) {
    storageCalls.push(name);
    return openDatabase.call(this, name, version);
  };

  const observe = MutationObserver.prototype.observe;
  const disconnect = MutationObserver.prototype.disconnect;
  MutationObserver.prototype.observe = function (target, options) {
    observe.call(this, target, options);
    if (!(target instanceof Element) || !target.closest(".ProseMirror, .cm-editor, .cm-content")) return;
    if (editorObservers.has(this)) return;
    const ref = new WeakRef(this);
    editorObservers.set(this, ref);
    observerRefs.add(ref);
  };
  MutationObserver.prototype.disconnect = function () {
    const ref = editorObservers.get(this);
    if (ref) observerRefs.delete(ref);
    editorObservers.delete(this);
    disconnect.call(this);
  };

  Object.assign(window, {
    readLeakProbes: () => {
      let domObservers = 0;
      for (const ref of observerRefs) {
        const observer = ref.deref();
        if (observer && editorObservers.has(observer)) domObservers++;
        else observerRefs.delete(ref);
      }
      return { urlsCreated, urlsRevoked, urlsLive: urls.size, workersCreated, workersLive: workers.size, domObservers, storageCalls, networkChannels };
    },
  });
}

export async function capturePrototype(cdp: CDPSession, expression: string): Promise<string> {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression: `Object.getPrototypeOf(${expression})`, objectGroup: "leak-prototypes" });
  if (exceptionDetails || !result.objectId) throw new Error(`无法取得对象原型: ${expression}`);
  return result.objectId;
}

export async function countInstances(cdp: CDPSession, prototypeObjectId: string, functionDeclaration: string): Promise<number> {
  const objectGroup = "leak-sample";
  try {
    const { objects } = await cdp.send("Runtime.queryObjects", { prototypeObjectId, objectGroup });
    if (!objects.objectId) throw new Error("CDP 未返回实例集合");
    const { result, exceptionDetails } = await cdp.send("Runtime.callFunctionOn", { objectId: objects.objectId, functionDeclaration, returnByValue: true });
    const count: unknown = result.value;
    if (exceptionDetails || typeof count !== "number" || !Number.isSafeInteger(count)) throw new Error("CDP 未返回有效的实例计数");
    return count;
  } finally {
    await cdp.send("Runtime.releaseObjectGroup", { objectGroup });
  }
}
