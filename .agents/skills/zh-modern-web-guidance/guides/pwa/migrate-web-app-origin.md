<a id="migrating-the-origin-of-an-installed-web-app"></a>

# 迁移已安装 Web 应用的源

将已安装的 Web 应用（PWA）迁移到新源，通常需要用户手动卸载旧应用并重新安装新应用。这往往会丢失任务栏快捷方式、通知权限等操作系统级集成。Web App Origin Migration 通过在新旧源之间建立安全交接，自动完成这一转换。

迁移包含两步验证：新站点声明旧站点是其前身，旧站点授权新站点作为后继。

<a id="important-constraints"></a>

### 重要限制

> [!WARNING]
> **数据与权限不会迁移。**
> 此特性只迁移**安装信息**，例如快捷方式和主屏幕图标。用户数据，包括 LocalStorage、IndexedDB、Cookie，以及通知、地理位置等浏览器权限都与源绑定，不会转移。必须另外通过跨源消息传递或服务端同步迁移数据。

<a id="implementation-steps"></a>

## 实现步骤

<a id="1-verification-of-same-site-status"></a>

### 1. 验证“同站”状态

必须：新旧源**必须同站（Same-Site）**，共享相同的**可注册域名（eTLD+1）**。

* **允许**：从 `app.example.com` 迁移到 `new.example.com`，两者共享 `example.com`。
* **允许**：从 `example.com/app1` 迁移到 `example.com/app2`。
* **禁止**：从 `example.com` 迁移到 `example.org`，因为可注册域名不同。

<a id="2-configure-the-new-application"></a>

### 2. 配置新应用

新应用必须声明其前身，并且必须有 `id`。

在**新**站点的 `manifest.json` 中添加 `migrate_from`：

```json
{
  "name": "My New App",
  "id": "/demo.html",
  "start_url": "/demo.html",
  "migrate_from": [
    {
      "id": "https://old-app.example.com/"
    }
  ]
}
```

<a id="3-authorize-the-migration-on-the-old-origin"></a>

### 3. 在旧源上授权迁移

旧源必须显式授权迁移，防止源被劫持。在 `.well-known` 目录提供一个配置文件。

文件位置：`https://old-app.example.com/.well-known/web-app-origin-association`

```json
{
  "https://new-app.example.com/demo.html": {
    "allow_migration": true
  }
}
```

<a id="4-proactively-signal-the-migration-optional"></a>

### 4. 主动告知迁移（可选）

要让浏览器从旧安装发现迁移，而不必等待用户访问新站点，在**旧**站点的 `manifest.json` 中添加 `migrate_to`，将其中的 `id` 设为新应用的 manifest ID：

```json
{
  "migrate_to": {
    "id": "https://new-app.example.com/demo.html",
    "install_url": "https://new-app.example.com/demo.html"
  }
}
```

<a id="5-require-users-to-migrate-optional"></a>

### 5. 要求用户迁移（可选）

默认情况下，浏览器会建议用户迁移。若要强制转换，在**新**应用的 manifest 中将 `behavior` 设为 `force`。

```json
{
  "migrate_from": [
    {
      "id": "https://old-app.example.com/",
      "behavior": "force"
    }
  ]
}
```

**注意**：`behavior: "force"` 不会静默删除旧应用。浏览器会向用户显示对话框，要求选择**更新**到新版本，或完全**移除**应用。

<a id="fallbacks--browser-support"></a>

## 回退与浏览器支持

Web app origin migration 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 149（2026 年 6 月）和 Edge 149（2026 年 6 月）。
不支持的浏览器：Firefox 和 Safari。

<a id="manual-reinstallation-prompt"></a>

### 手动重新安装提示

不支持自动迁移的浏览器会让用户继续停留在旧安装上。应在旧源中提供 UI 元素，例如通知横幅，引导用户前往新站点。

用户设置不会迁移，旧应用也不会自动卸载。
