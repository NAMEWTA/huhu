// HUHU STUB（P-S2a-srv）：上游此处是 OTel / 日志 / 影子仓库等服务端基础设施；Huhu 本地宿主不需要，保留同名同签名的空实现。
export const LOSS_EVENT_GUARD_DEFER = 'guard-defer';
export const LOSS_EVENT_DETECTOR_TRIP = 'detector-trip';
export const LOSS_EVENT_BACKSTOP_TRIP = 'backstop-trip';
export const LOSS_EVENT_CHECKPOINT_WRITE = 'checkpoint-write';
export const LOSS_EVENT_PERSISTENCE_HOLD = 'persistence-hold';
export const LOSS_EVENT_REPAIR_REBUILD = 'repair-rebuild';
export interface LossCaptureRing { record(event: unknown): void }
