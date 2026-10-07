# Bangumi 原站外观宿主契约

> 证据：2026-10-03 用户保存的首页运行后 DOM（`/tmp/Bangumi 番组计划.html`）及同名 `_files` 资源，以及匿名抓取的原站 JS。保存页不是原始 SSR；源码分析不证明视觉呈现或实际 GPU 开销。实时页面与本文冲突时，以实时页面为准并更新本文。

## 来源与挂载边界

- 此样本的 Live2D 是 **Bangumi 原站集成的 OhMyLive2D**：`chiiLib.ukagaka.initLive2D()` 加载 `/js/oml-cubism4.min.js?v3` 并调用 `OML2D.loadOhMyLive2D()`。不能因 `oml-*` 名称或页面启用了超合金组件，就归因为某个已安装组件。
- 首页样本结构为 `#robot > #ukagaka_shell > .ui_12`；`.ui_12` 内包含 `#robot_balloon` 与 `.ukagaka_body > #ukagaka_voice`。`#oml-stage > #oml-canvas` 挂在 `#ukagaka_shell` 下，是 `.ui_12` 的兄弟。
- CSS 为 `.shell_1` 至 `.shell_25` 提供角色背景，为 `#ukagaka_shell div.ui_1` 至 `div.ui_12` 提供布局尺寸；**ui 编号与 shell 编号不是同一映射**。此次材料没有完整壳→ui 对照表，也不证明所有传统壳 SSR 结构完全一致。
- **只隐藏 `.ukagaka_body` 不会隐藏 Live2D；隐藏整个 `#robot` 则会连气泡一起隐藏。** 气泡菜单包含吐槽、短信、调教和春菜设置等站内操作，语音入口也不是模型的一部分。
- 静态 body 背景仍然存在；Live2D ready 回调用 500ms 动画将其淡出。恢复 body 的可见性不能只撤销外加隐藏规则，还须考虑原站已经设置的淡出动画。

## 显隐与初始化

- `g=js` 在 document ready 调用 `chiiLib.ukagaka.init()`。`SHOW_ROBOT == 1` 直接显示，否则依据 `robot` cookie 是否存在决定显隐；**`SHOW_ROBOT = 0` 不是强制关闭**，不能只读该全局判定用户偏好。
- `#showrobot` 调 `toggleDisplay()`：召唤时 fadeIn、保存偏好并初始化 Live2D；隐藏时 fadeOut，完成后调用 `disposeLive2D()`。`isDisplay()` 本身只处理显隐和按钮文案。
- 站内 `presentSpeech()` 可主动召唤隐藏中的伪春菜，并初始化模型；故只监听开关点击不足以覆盖全部出现路径。自动 dismiss 等路径也会显隐及延时销毁。
- `_isLive2DShell()` 识别 `.shell_1/23/24/25`。shell_1 根据 `html[data-theme]` 明暗换装；23 为旧模型，24/25 固定明暗。主题变化及 640px 断点变化可触发 dispose 后重新 init。
- `initLive2D()` 在调用时检查 robot 是否隐藏、是否已有 stage；异步脚本 done 回调**不重新检查，也不取消在途加载**。因此加载中隐藏、并发 init 可能出现晚挂载或重复挂载；这是静态推导，未做运行时复现。

## 几何与窄屏

- 原站 CSS：`#robot` fixed、bottom 0、right 50px、z-index 90；`.ui_12` 内容宽 150px、高 310px、左右 padding 各 10px。其他 ui 容器各有尺寸，声明高度为 180–355px；ui_1 另有上下各 4px padding，内容高度与外框高度须区分。
- ui 容器的布局尺寸不依赖模型启动，但**不等于原角色实际可见高度**：传统背景存在对齐、留白及个别缩放，Live2D stage 另有模型尺寸。隐藏祖先时矩形可为零，不可将零当作目标高度。
- `.ukagaka_body` absolute、top/left 0、宽高 100%；ui 容器未被上述规则显式设为定位包含块，不能将 body 的 100% 直接视为 ui 内容高度。
- 粉色气泡 relative、z-index 90、宽 340px、margin-left -320px；另有四种固定尺寸气泡及 ui_3 的偏移覆盖。增宽正常流角色容器可移动气泡；角色外观仅绝对定位溢出，则不因图片宽度增加流内占位（仍需真实 DOM 验证）。
- 640px 以下：robot right 5px；仅 ui_10/ui_12 的内容宽高被改为 75×170／90×170，原 padding 保留；粉色气泡宽 250px、margin-left -230px。**原站并非一律在窄屏隐藏角色，也不是所有传统壳都缩小到同一高度。**
- companion 注入的 stage 为 fixed、bottom 0、right 40px、z-index 80；canvas 宽高 100%、z-index 81；窄屏原站 CSS 将 stage right 改为 0 `!important`。不能将 stage 的固定偏移当成 robot 自身的偏移。
- 窄屏模型配置 scale 0.5、stage 90×175；桌面 stage 随模型尺寸变化。快照 stage 约 164×323，canvas 绘制分辨率 328×646，符合 PIXI resolution=2；**这些不是跨模型固定尺寸**。

## 隐藏不等于停止渲染

- companion 用 canvas 创建 PIXI Application，`autoStart: true`、`resizeTo: stage`；stage 的滑入／滑出或 visibility hidden 不停止应用 ticker。
- 原站 `disposeLive2D()` 解绑主题／睡眠监听和定时器；在兼容壳、stage 和全局模型存在时销毁模型、移除 canvas/stage、删除 `CHII_LIVE_2D_MODEL`。
- **这不是完整的应用销毁接口**：没有调用 PIXI app.stop/app.destroy，不取消在途加载；模型未 ready 时可跳过清理。外部先删 canvas 再调用它，还可能在 `.remove()` 处因空引用抛错。销毁也不负责恢复静态 body 的淡出状态。
- 模型 destroy 会停止其自身 autoUpdate 并释放内部模型，但应用渲染 ticker 是独立的。`loadOhMyLive2D()` 返回空对象，没有暴露 app 引用或完整 dispose API；不应将通用上游 OML 文档当成此定制 bundle 的可用接口。
- CSS 隐藏、移除 DOM 均不构成完整资源释放的证据。尚未做浏览器性能测量，不宣称销毁后仍绘制已销毁模型，也不保证所有 RAF/WebGL 开销已归零。

## 页头站娘（`#headerNeue2`）

> 以下取自用户提供的同名保存首页及 `_files/bangumi.min.css`，未做实时浏览器验证；不据此推定其他路由或三个域名结构一致。

- 样本结构：`#headerNeue2 > .headerNeueInner > div.bg.musume_6`，为空装饰节点；首页链接 `a.logo` 是其兄弟，不应随装饰一起替换。样本只出现 6 号；每次随机返回 0–6 是用户提供的原站行为，未通过多次请求核实。
- `#headerNeue2 div.bg` 声明宽高 **40×50 CSS px**，背景 `/img/rc3/bg_musume_2x.png`，`background-size:280px 75px`、默认位置 `0 -10px`。页头 `musume_1` 至 `musume_6` 将位置改为 `-40px 0` 至 `-240px 0`（步长 40px）；没有单独的页头 `musume_0` 规则。**只换图片 URL 会继承精灵图缩放和差分偏移，不能直接用于单张正面图。**
- inner 为 flex、纵向居中；装饰未显式禁止 flex 收缩，40×50 是声明尺寸而非所有窄屏的实测值。640px 以下调整 inner padding 等布局，未发现隐藏该装饰的规则；高 DPI 规则仍使用同一背景和 280×75 缩放，未发现暗色专属差分图。
- 保存 CSS/JS 未检出针对该装饰的事件处理；不等于排除了通用委托或其他线上脚本。保留原节点与兄弟 logo/导航可避免无意改变结构，但交互仍需实际验证。
- CSS 另有 `#headerNeue`、旧 `#top/#logo` 和 `#rakuenHeader` 样式，不能将上述选择器直接推广到这些页头；样本未证明它们当前在哪些路由使用。

## 一手证据

1. 保存首页：OML 注入样式与 `#robot/#ukagaka_shell` 运行后结构；本次只证明该首页样本，不证明三域名、所有页面或其他扩展的行为一致。
2. [`/min/g=js?r771`](https://bgm.tv/min/g=js?r771)：匿名抓取与保存的 `_files/g=js` 逐字一致；锚点为 `chiiLib.ukagaka` 的 init/isDisplay/toggleDisplay/presentSpeech/initLive2D/reloadLive2D/disposeLive2D 及 document ready 调用。
3. [`/css/dist/bangumi.min.css?r771`](https://bgm.tv/css/dist/bangumi.min.css?r771)：几何结论取自保存的 `_files/bangumi.min.css` 对应选择器和 640px media 规则；未将脱离 media 层级的摘录视为最终 computed style。
4. [`/js/oml-cubism4.min.js?v3`](https://bgm.tv/js/oml-cubism4.min.js?v3)：本次公开抓取；锚点为 `VE.mountElement/listenModelEvent/omlStatus`、`jE` 加载器、Live2DModel.destroy 和 PIXI Application/ticker。保存资源中无该 bundle 副本，不能保证它与快照执行时逐字相同。
