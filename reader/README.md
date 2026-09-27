# 原神剧情编年 · 阅读器

双击 `index.html` 就能阅读当前已编译的剧情文档。网页本身不依赖服务器；正文与目录由 `story-data.js` 提供，文中引用的远程 CG 图片需要联网。白天／夜晚主题、字号、行宽、侧边栏状态和阅读进度保存在当前浏览器的 `localStorage`。通过侧栏可导出或导入阅读记录。

## 后续加入版本

1. 在 `../story-summaries/N.x/` 放入 `N.M-章节号-章节名.md`，例如 `7.1-第七章第三幕-示例.md`。没有主线时使用 `N.M-无.md` 或 `N.M-无-支线名.md`。
2. 正文首行用 `# 版本号｜标题`，每个「幕」或重要世界支线用 `##` 标题；`###` 可在同一页内划分小节。末尾的 `## 资料` 会成为最后一页的可展开来源。
3. 在项目根目录执行：

   ```powershell
   python -m pip install markdown-it-py==3.0.0
   python reader/build.py
   ```

构建脚本自动扫描所有 `N.x` 文件夹，按版本号数值排序，生成 `story-data.js`。新增文档不会改变已有页面的标识，只要旧文档的版本号与幕顺序不变，已有阅读记录就能继续使用。直接打开 `reader/index.html` 检查结果。

## 部署到 GitHub Pages

将整个项目上传到 GitHub 仓库。在仓库 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。推送到 `main` 或 `master` 分支，或在 Actions 页手动运行 **Deploy reader to GitHub Pages**。工作流会在 GitHub 上重新生成数据并发布网页；发布地址见 Actions 部署结果或 Pages 设置页。

GitHub Pages 上的阅读进度只存储于访问者自己的浏览器。跨设备阅读可使用侧栏的导出／导入记录。

## 操作

- 点击页面下方按钮、按键盘 `←`／`→` 或在手机上横向轻扫翻页。
- 左上角按钮收起或打开目录；手机上点击空白遮罩可关闭目录。
- 未读版本与未读幕在侧栏显示占位标题，进入该页后才揭示。
- 来源链接在每篇版本的最后一页底部展开。
