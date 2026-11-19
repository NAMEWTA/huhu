// Tailwind adds utilities before this plugin scopes the OK stylesheet.
// The source-specific layers let the build guard find OK rules after CSS chunking.
import selectorParser from "postcss-selector-parser";

const TARGET = /ok-globals\.css$/;
const OK_TARGET = selectorParser().astSync(":where(.ok-root, .ok-root *)").first.first;
const LEGACY_PSEUDO_ELEMENT = /^:(before|after|first-line|first-letter)$/i;

const scopeSelectors = selectorParser((selectors) => {
  for (const selector of selectors.nodes) {
    const first = selector.nodes.find((node) => node.type !== "comment");
    if (first && ((first.type === "tag" && ["html", "body"].includes(first.value)) || (first.type === "pseudo" && [":root", ":host"].includes(first.value) && !first.length))) {
      first.replaceWith(selectorParser.className({ value: "ok-root" }));
    }

    // Filter the target compound even when the selector looks outside the root
    // for an ancestor or sibling. :where() preserves the utility's specificity.
    const target = selector.nodes.slice(selector.nodes.findLastIndex((node) => node.type === "combinator") + 1);
    if (target.some((node) => node.type === "class" && node.value === "ok-root")) continue;
    const pseudoElement = target.find((node) => node.type === "pseudo" && (node.value.startsWith("::") || LEGACY_PSEUDO_ELEMENT.test(node.value)));
    if (pseudoElement) selector.insertBefore(pseudoElement, OK_TARGET.clone());
    else selector.append(OK_TARGET.clone());
  }
});

export default function okScopePlugin() {
  return {
    postcssPlugin: "huhu-ok-scope",
    Once(root, { AtRule }) {
      if (!TARGET.test(root.source?.input?.file ?? "")) return;
      root.walkRules((rule) => {
        if (rule.parent?.type === "atrule" && rule.parent.name.endsWith("keyframes")) return;
        // Keep the existing descendant-only universal defaults and resets.
        rule.selectors = rule.selectors.map((selector) => (/^\*?(::?(before|after))?$/.test(selector.trim()) ? `.ok-root ${selector.trim()}` : selector));
        rule.selector = scopeSelectors.processSync(rule.selector);
      });

      const wrap = new AtRule({ name: "layer", params: "vendor.ok-rules" });
      root.each((node) => {
        if (node.type === "atrule" && node.name === "layer" && node.nodes) {
          // Keep each layer in its original top-level cascade position.
          if (!node.params.startsWith("vendor.ok-")) node.params += ".huhu-ok";
        } else if (node.type === "rule" || (node.type === "atrule" && node.nodes && !node.name.endsWith("keyframes") && node.name !== "property")) {
          wrap.append(node);
        }
      });
      root.append(wrap);
    },
  };
}
okScopePlugin.postcss = true;
