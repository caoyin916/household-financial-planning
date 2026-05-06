# 家庭财务网页工具（本地离线版）

本仓库是一个**纯静态网页**，无构建步骤。整合了三个功能：

1. **家庭现金流估算**（Monthly / Annual 现金流场景）
2. **家庭净资产**（资产矩阵、投资房、房贷、本地持久化）
3. **Retirement Simulator**（退休后 50 年年度现金流与假设模拟）

主入口文件：`household-pl-calculator.html`。

---

## 如何运行

### 方式 A：直接双击打开（最简单）

在资源管理器中双击 `household-pl-calculator.html`，用浏览器打开即可。

### 方式 B：本地静态服务器（推荐，部分浏览器对 `file://` 更严格）

任选一种：

```bash
# Python 3
python -m http.server 8080
```

然后在浏览器打开：

`http://localhost:8080/household-pl-calculator.html`

### 一键发布到 GitHub Pages（给朋友直接发 URL）

本仓库已内置工作流：`.github/workflows/deploy-pages.yml`。  
完成下面一次性设置后，以后每次 push 到 `main` 都会自动更新网页。

1. 在 GitHub 新建仓库并上传本项目（确保默认分支是 `main`）。
2. 进入仓库 **Settings → Pages**。
3. 在 **Build and deployment / Source** 选择 **GitHub Actions**，保存。
4. 回到仓库首页，push 一次代码（或在 **Actions** 页手动运行 `Deploy static site to GitHub Pages`）。
5. 第一次部署成功后，在 **Settings → Pages** 会看到公开地址：  
   `https://<你的GitHub用户名>.github.io/<仓库名>/`

打开后建议把链接补全到入口页：

`https://<你的GitHub用户名>.github.io/<仓库名>/household-pl-calculator.html`

> 注意：GitHub Pages 域名和你本地 `localhost/file://` 不是同一 origin，浏览器 `localStorage` 不会自动同步。若要分享你的已填数据，请按下文导出并导入对应 localStorage keys。

### 导出合并 PDF

点击工具栏 **「导出 PDF…」** 会弹出对话框，可勾选 **一项或多项**：「家庭现金流估算」「家庭净资产」「Retirement Simulator」。确认后会临时仅展开所选模块（按固定顺序自上而下排版，多块之间自动分页），并打开系统打印对话框；在 **目标打印机** 中选「**另存为 PDF**」或「**Microsoft Print to PDF**」即可保存。退休模拟表较宽时打印样式会略缩小字号；若裁切不理想，可在打印预览里调整边距或缩放。

---

## 页面与 Tab 说明

### 主页面结构

- **`household-pl-calculator.html`**  
  顶部 Tab 切换三大功能；内容由 `app-tabs.js` / `app-tabs.css` 控制哈希路由。

### URL 哈希（可收藏链接）

| 哈希 | 打开的 Tab |
|------|------------|
| （无哈希或空） | 家庭现金流估算 |
| `#networth` | 家庭净资产 |
| `#projection` | Retirement Simulator |
| `#retirement` | 同上（`#retirement` → `#projection` 的别名） |

历史入口 `net-worth.html` 会跳转到合并页的净资产 Tab。

---

## 文件清单（便于整包复制）

同一目录下应保持这些文件一并复制，否则样式或脚本会缺失：

| 文件 | 用途 |
|------|------|
| `household-pl-calculator.html` | 主页面（三 Tab 外壳 + 现金流 UI + 净资产 UI + Simulator UI） |
| `app.js` | 现金流计算器逻辑 |
| `labels-defaults.js` | 现金流界面默认文案标签 |
| `styles.css` | 全局与现金流样式 |
| `net-worth.js` | 净资产表格、投资房、本地存储 |
| `net-worth.css` | 净资产样式 |
| `projection.js` | Retirement Simulator 计算、列拖拽、税务、Brokerage、401(k) 等 |
| `projection.css` | Simulator 样式 |
| `app-tabs.js` | Tab 切换与哈希路由 |
| `app-tabs.css` | Tab 外壳样式 |
| `export-pdf.js` | 「导出 PDF」：对话框勾选模块后调用浏览器打印 |
| `export-pdf.css` | 导出对话框样式与打印样式（分页、隐藏按钮等） |
| `net-worth.html` | 跳转用（重定向到 `#networth`） |
| `tools/sim-year.mjs` | 可选：在 Node 中复现单年结果（不读 localStorage，需与下方说明一致地手改参数） |
| `tools/roth-conversion-window.py` | 可选：在 Python 中逐日历年输出 ordinary/边际档，用于粗看 Roth 转换窗口 |

**字体**：页面通过 Google Fonts CDN 加载 `Noto Sans SC` / `DM Sans`；完全离线环境可复制网页后断网使用，但字体可能回退到系统字体（功能不受影响）。

---

## 本地数据（localStorage）

所有数据保存在**当前浏览器域名 + 协议**下的 `localStorage`（例如本地打开时多为 `null` origin，换浏览器或清空站点数据会丢）。

与本工具相关的典型键：

| Key | 说明 |
|-----|------|
| `household-pl-estimate-v3` | 家庭现金流估算主存档（分项数值） |
| `household-pl-cashflow-scenarios-v1` | 现金流「方案快照」列表（多份完整快照：数值 + 备注 + 标签覆盖） |
| `household-pl-labels-v1` | 现金流各行的自定义文案 / 合并后的标签 JSON |
| `household-net-worth-v2` | 家庭净资产主存档（人数、资产矩阵、投资房卡片等） |
| `household-net-worth-scenarios-v1` | 净资产「方案快照」列表（多份完整 v2 数据，可切换） |
| `household-net-worth-v1` | 旧版净资产存档（一般不必手改） |
| `retirement-simulator-v1` | Retirement Simulator 假设、表头文案、表格列顺序等 |
| `retirement-simulator-scenarios-v1` | 退休模拟「方案快照」列表（多份完整持久化结构） |

以下为历史兼容：`household-pl-estimate-v2`（若在旧数据中仍存在，可读入后升级到 v3）。

### 备份 / 迁移「整站内容」的步骤

1. 用同一浏览器在正常使用的协议下打开本工具（固定一种打开方式）。
2. 打开开发者工具 → **Application**（Chrome）/ **存储**（Firefox）。
3. 在 **Local Storage** 中导出或复制上表所列 key（建议至少备份：**household-pl-estimate-v3、household-pl-labels-v1、household-pl-cashflow-scenarios-v1、household-net-worth-v2、household-net-worth-scenarios-v1、retirement-simulator-v1、retirement-simulator-scenarios-v1**；若未使用方案快照可省略对应 scenarios 键）。
4. 在目标电脑上同样打开本工具页面，粘贴回对应 key。

**与 `tools/` 脚本的关系**：命令行脚本**不会**读取浏览器的 `localStorage`。若要在终端里复现你在网页上看到的某一年数字，需把 `sim-year.mjs` / `roth-conversion-window.py` 里的假设与初值（401(k)、Brokerage、成员日期、孩子等）改成与当前页面一致，或从 Application → Local Storage 自行导出 `retirement-simulator-v1` 再人工对齐。

---

## 三大功能简述

### 1. 家庭现金流估算

- 收入、开销、月供、结余等分项输入；支持年度/月度折算展示。
- 文案与默认值部分来自 `labels-defaults.js`。
- 样式：`styles.css`，逻辑：`app.js`。

### 2. 家庭净资产

- 成员分列资产矩阵；投资房多套对比；房贷与净值计算。
- 数据持久化：`household-net-worth-v2`。
- 逻辑：`net-worth.js`，样式：`net-worth.css`。

### 3. Retirement Simulator（`projection.js`）

- 自丈夫达到设定退休年龄起的 **50 个日历年** 投影。
- **假设界面**：分为多块（基础 / 收入 / 成本等）；子女可为多条日程（增删与持久化逻辑见代码）。
- **退休前 401(k)**：可在假设中填年度税前缴存（`projection.js` 默认示例为 **$68,000/年**，含自缴与雇主 match，至退休首年止）；按与 401(k) 相同的年化回报滚到退休起始年；**退休后不再缴存**。
- **现金流规则（摘要）**：在**双方都还不能取 401(k)** 时，用 **Brokerage 卖出**填补「支出 + 税 − 收入」缺口（资本利得税规则见下）；**任一方满取现年龄**后，缺口主要通过**追加 401(k) 提款**关闭；**社安毛额**仍在收入侧，应税部分按设定比例进入 ordinary。
- **Brokerage**：卖出需计资本利得税；模型可将**利得税递延到下一日历年**支付；余额按**毛卖出额**扣减，展示上「提款」列可与**净到手**口径对齐（见 `projection.js` 内注释与实现）。
- **401(k) 与 RMD**：取现比例与 RMD 起始年龄由假设决定；高年龄用 IRS 表除数近似 RMD，并与计划提款取较大者，再与余额上限取 min（细节以代码为准）。
- **税列（Tax）**：联邦 + 可选州税，针对 **ordinary income**（房租 + 401(k) 取出 + 社安**应税**部分等），**先减标准扣除**再走累进档；Brokerage 卖出利得**不**与此列混算，而在资本利得相关列/递延税中体现（全仓视为 LTCG 的简化假设以代码为准）。
- 投资房收入、401(k) 与 Brokerage 初值、社安、生活支出通胀、学费/国际学校等：默认值与键名以 `projection.js` 与页面为准。
- 表格列名可编辑、列可拖拽排序；净资产同步按钮可同时填 **401(k) 总计**与 **Brokerage 总计**（资产行 label 中含 `brokerage` 或 `经纪`）。
- 假设区金额字段为 `$` + 千分位格式（聚焦时去格式便于输入）。

**联邦所得税（模型内建，MFJ 应税 ordinary）**：与 `projection.js` 中 `FEDERAL_BRACKETS_MFJ` 一致，注释为 **2024** 年式档；标准扣除（MFJ）默认例如 `$29,200`（以界面/默认值为准）。以下为**应税 ordinary income** 的边际税率区间（非毛收入）：

| 应税 ordinary（美元） | 边际税率 |
|----------------------|---------|
| $0 – $23,200 | 10% |
| 超过 $23,200 至 $94,300 | 12% |
| 超过 $94,300 至 $201,050 | 22% |
| 超过 $201,050 至 $383,900 | 24% |
| 超过 $383,900 至 $487,450 | 32% |
| 超过 $487,450 至 $731,200 | 35% |
| 超过 $731,200 | 37% |

**Roth 转换（规划思路，非本页自动计算）**：转换额会增加当年 ordinary。一般而言，在模拟里 **ordinary 较低、联邦边际档较低** 的年份（例如退休初期尚不能大举取 401(k)、社安与 RMD 尚未推高收入的年份）更适合「填低档」做 Roth 转换；具体年份随你的假设变化。可用 `tools/roth-conversion-window.py` 在**与网页一致的参数**下粗看逐年 ordinary 与边际档，仍需结合 IRMAA、州税、NIIT、计划条款等现实因素，**不构成报税或投资建议**。

详见代码内常量与注释；税务与 RMD 为**教育/规划用简化模型**，不可替代专业报税建议。

---

## 命令行小工具（`tools/`）

用于在浏览器外快速核对某一年或逐年边际档；**默认参数写在脚本内**，与网页不一致时以网页为准。

| 脚本 | 依赖 | 说明 |
|------|------|------|
| `tools/sim-year.mjs` | [Node.js](https://nodejs.org/) | 打开文件底部 `st` / `nwSnapshot`，修改后与 `computeSchedule` 同逻辑的 `run()` 输出目标年份（如 `2048`）的一行 JSON 及简易税负比例。 |
| `tools/roth-conversion-window.py` | Python 3 | 逐日历年打印 ordinary、应税 ordinary、401(k)/社安、联邦边际档等，便于观察 Roth 转换「窗口」。Windows 终端若中文乱码可设：`PYTHONIOENCODING=utf-8`。 |

本仓库其余页面仍为静态 HTML，**不要求**安装 Node/Python 即可日常使用上述网页工具。

---

## 复制给其他电脑使用

将整个 `household-pl` 文件夹**原样拷贝**即可（保持相对路径不变）。浏览器打开同一 HTML 文件名即可。

若要连同已填数据一起带走，请务必按上文 **localStorage** 小节备份对应 key。

---

## 许可与免责

本项目为个人家庭财务估算工具。**不构成税务、投资或规划建议**。税率、RMD、社安应税比例等均为可配置近似。
