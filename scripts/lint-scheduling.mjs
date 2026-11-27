function memberName(node) {
  if (node?.type !== "MemberExpression") return undefined;
  return node.computed ? node.property.value : node.property.name;
}

function callableName(node) {
  return node?.type === "Identifier" ? node.name : memberName(node);
}

// A one-shot timeout is legal. A callback that explicitly queues itself is periodic.
function queuesItself(node) {
  const callback = node.arguments[0];
  if (callback?.type !== "Identifier") return false;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "FunctionDeclaration" && parent.id?.name === callback.name) return true;
    if (parent.type === "VariableDeclarator" && parent.id.name === callback.name && ["ArrowFunctionExpression", "FunctionExpression"].includes(parent.init?.type)) return true;
  }
  return false;
}

const timerModule = /^(?:node:)?timers(?:\/promises)?$/;
const notificationCapability = "notifications.create";

export default {
  meta: { name: "huhu-scheduling" },
  rules: {
    "no-private-periodic-timer": {
      create(context) {
        const report = (node) => context.report({ node, message: "业务周期调度使用 Automations 计划端口，技术定时需注明用途。" });
        return {
          CallExpression(node) {
            if ((node.callee.type === "Identifier" && node.callee.name === "setInterval") || (callableName(node.callee) === "setTimeout" && queuesItself(node))) report(node);
          },
          MemberExpression(node) {
            if (memberName(node) === "setInterval") report(node);
          },
          ImportSpecifier(node) {
            if (node.imported.name === "setInterval" && timerModule.test(node.parent.source?.value)) report(node);
          },
          Property(node) {
            if (node.parent.type === "ObjectPattern" && (node.computed ? node.key.value : node.key.name) === "setInterval") report(node);
          },
        };
      },
    },
    "no-direct-notification-fallback": {
      create(context) {
        return {
          CallExpression(node) {
            const name = callableName(node.callee);
            const sink = node.callee.object;
            const target = node.arguments[0]?.value;
            const notification = node.arguments[0];
            const hasTitle = notification?.type === "ObjectExpression" && notification.properties.some(({ key }) => (key?.name ?? key?.value) === "title");
            if (
              (name === "notify" && (sink || hasTitle)) ||
              name === "notifyHistoryFailure" ||
              ((name === "send" || name === "create") && (sink?.name === "notifications" || memberName(sink) === "notifications")) ||
              (target === notificationCapability && ["call", "dispatch", "invoke"].includes(name)) ||
              (target === "notification.created" && ["publish", "emit"].includes(name))
            ) {
              context.report({ node, message: "计划通知通过 Automations 的递送端口与原发生检查点发送。" });
            }
          },
        };
      },
    },
  },
};
