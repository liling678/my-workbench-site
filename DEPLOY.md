# 把工作台部署到云端（手机也能改的版本）

目标：把这套纯前端工作台搬到 GitHub，再用 Vercel（或 Netlify）自动部署，  
拿到一个**固定网址**。之后无论是电脑还是手机，改代码 → 推送 → 网站自动更新。

> 数据安全：GitHub 仓库建议设成**私有**（源码只有你能看），但部署出来的网站  
> 任何人都可访问（静态站本就公开）。你的个人数据仍在各自浏览器本地，不会进仓库。

---

## 第一次准备（需要在电脑上做一次，约 10 分钟）

### 1. 注册 GitHub（若还没有）

打开 <https://github.com> 注册一个账号。

### 2. 新建一个仓库

- 右上角 `+` → New repository
- 名字随便，例如 `my-workbench`
- 选 **Private（私有）** 更安全
- 不要勾选 "Add a README"（我们已经有了）
- 点 Create repository

### 3. 把本地代码推上去

建好仓库后会看到一个网址，类似：  
`https://github.com/你的用户名/my-workbench.git`

在本机工作台目录里执行（把网址换成你自己的）：

```bash
cd 工作台目录/workbench
git remote add origin https://github.com/你的用户名/my-workbench.git
git branch -M main
git push -u origin main
```

> 如果提示要登录，按屏幕提示用浏览器授权一次即可（GitHub 会弹窗）。

### 4. 连 Vercel 自动部署

- 打开 <https://vercel.com> ，用 GitHub 账号登录
- 点 **Add New → Project** → 选刚才的 `my-workbench` 仓库 → Import
- Framework Preset 选 **Other**（纯静态），其他默认 → Deploy
- 几十秒后拿到网址，形如 `my-workbench-xxx.vercel.app`
- 以后只要 `git push`，Vercel 会自动重新部署

> 备选：Netlify（<https://netlify.com）操作类似，拖拽> deploy 或连 GitHub 都行，  
> 免费且同样给固定网址。二选一即可。

---

## 之后怎么改（重点：手机也能改）

### 电脑上改（最稳）

直接改文件 → `git add -A && git commit -m "改了xx" && git push` → 自动部署。

### 手机上改（两种）

**A. 用 GitHub 网页/App 直接编辑**  
手机浏览器打开 github.com → 进仓库 → 点开要改的文件 → 铅笔图标编辑 →  
Commit changes。push 后 Vercel 自动重新部署，手机刷新即新版。  
适合小改动（改个字、改个颜色）。

**B. 手机 WorkBuddy 让我改（最理想，需验证）**  
在手机 WorkBuddy 里，试着把刚才那个 GitHub 仓库作为「云端项目」打开，  
然后直接说"把首页问候语改成 XXX"。如果它能真的改文件并 push，  
那以后手机上跟我说改什么，我改完自动部署，你刷新就看新版——完全不用开电脑。  
（这一步取决于手机端是否支持操作 Git 仓库项目，建议先试一次。）

---

## 关于数据的再次提醒

部署到云端解决的是「代码 + 访问」，**不解决跨设备数据互通**。  
手机上打开新网址，第一次仍是空的。要手机和电脑共用一份数据，  
要么重开 Supabase 云同步，要么用工作台侧边栏的「导出数据 / 导入数据」手动搬。

## 目录结构速览

- index.html            入口
- manifest.webmanifest  PWA 配置（可安装到手机桌面）
- sw.js                 Service Worker（离线缓存）
- css/style.css         样式
- js/app.js             主逻辑 + 模块注册
- js/modules/           各功能模块
- js/cloud-sync.js      云同步（Supabase，可选）
- vendor/supabase.js    本地打包的 Supabase SDK
- icons/                PWA 图标

