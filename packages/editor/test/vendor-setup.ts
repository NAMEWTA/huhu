// 上游 app 测试（vendor）的公共前置：t`…` 宏需要已激活的 locale（上游由 test-support 预加载完成，这里最小复刻）。
import { i18n } from "@lingui/core";

i18n.load("en", {});
i18n.activate("en");
