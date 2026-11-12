import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import type { HuhuEvent } from "@huhu/contracts";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { EngineClient, EventStream, type EngineEndpoint } from "./client.js";
import { invalidateForEvent, queryKey } from "./query.js";

const Ctx = createContext<EngineClient | null>(null);
const EventsCtx = createContext<{ subscribe(fn: (e: HuhuEvent) => void): () => void } | null>(null);

/** 订阅 Engine 事件（例如主机密钥提示）。组件卸载时自动取消。 */
export function useEngineEvents(handler: (e: HuhuEvent) => void): void {
  const bus = useContext(EventsCtx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => bus?.subscribe((e) => ref.current(e)), [bus]);
}

/** 在没有 EngineProvider 的位置（引擎尚未连接时的外壳）取不到客户端，返回 null。 */
export function useOptionalEngine(): EngineClient | null {
  return useContext(Ctx);
}

export function useEngine(): EngineClient {
  const c = useContext(Ctx);
  if (!c) throw new Error("EngineProvider 缺失");
  return c;
}

export interface EngineProviderProps {
  endpoint: EngineEndpoint;
  children: ReactNode;
  onConnection?(s: "connected" | "reconnecting"): void;
}

/** 提供 Engine 客户端与 React Query；事件到达时让相关查询失效。 */
export function EngineProvider({ endpoint, children, onConnection }: EngineProviderProps) {
  const client = useMemo(() => new EngineClient(endpoint), [endpoint]);
  const listeners = useMemo(() => new Set<(e: HuhuEvent) => void>(), []);
  const bus = useMemo(
    () => ({
      subscribe: (fn: (e: HuhuEvent) => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    }),
    [listeners],
  );
  const qc = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5_000 } } }), [endpoint.vaultId]);
  useEffect(() => {
    // 引擎重启后端点（令牌/端口）变化：新事件流没有旧序号，无法补发，必须让全部缓存失效
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === endpoint.vaultId });
  }, [endpoint.baseUrl, endpoint.token, endpoint.vaultId, qc]);
  useEffect(() => {
    const stream = new EventStream(endpoint, {
      onEvent: (e) => {
        void invalidateForEvent(qc, endpoint.vaultId, e);
        for (const l of listeners) l(e);
      },
      onResync: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === endpoint.vaultId }),
      ...(onConnection ? { onState: onConnection } : {}),
    });
    stream.start();
    return () => stream.close();
  }, [endpoint, qc, onConnection, listeners]);
  return (
    <Ctx.Provider value={client}>
      <EventsCtx.Provider value={bus}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </EventsCtx.Provider>
    </Ctx.Provider>
  );
}

export function useCapability<T>(capability: string, input: unknown = {}) {
  const client = useEngine();
  return useQuery({ queryKey: queryKey(client.vaultId, capability, input), queryFn: () => client.call<T>(capability, input) });
}

export function useCapabilityMutation<T, V>(capability: (v: V) => { name: string; input: unknown }, opts: Omit<UseMutationOptions<T, Error, V>, "mutationFn"> = {}) {
  const client = useEngine();
  return useMutation<T, Error, V>({
    ...opts,
    mutationFn: (v) => {
      const c = capability(v);
      return client.call<T>(c.name, c.input, { write: true });
    },
  });
}

export { useQueryClient };
