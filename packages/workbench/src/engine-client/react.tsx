import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { EngineClient, EventStream, type EngineEndpoint } from "./client.js";
import { invalidateForEvent, queryKey } from "./query.js";

const Ctx = createContext<EngineClient | null>(null);

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
  const qc = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5_000 } } }), [endpoint.vaultId]);
  useEffect(() => {
    // 引擎重启后端点（令牌/端口）变化：新事件流没有旧序号，无法补发，必须让全部缓存失效
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === endpoint.vaultId });
  }, [endpoint.baseUrl, endpoint.token, endpoint.vaultId, qc]);
  useEffect(() => {
    const stream = new EventStream(endpoint, {
      onEvent: (e) => void invalidateForEvent(qc, endpoint.vaultId, e),
      onResync: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === endpoint.vaultId }),
      ...(onConnection ? { onState: onConnection } : {}),
    });
    stream.start();
    return () => stream.close();
  }, [endpoint, qc, onConnection]);
  return (
    <Ctx.Provider value={client}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
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
