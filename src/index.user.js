// ==UserScript==
// @name         把伪春菜换成奶龙
// @namespace    https://github.com/imagebuilder1837/replace-ukagaka-with-nailong
// @version      0.1.3
// @description  把 Bangumi Live2D 伪春菜、页头站娘和默认用户头像换成奶龙。
// @author       imagebuilder1837
// @match        https://bgm.tv/*
// @match        https://bangumi.tv/*
// @match        https://chii.in/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/imagebuilder1837/replace-ukagaka-with-nailong/refs/heads/main/src/index.user.js
// @updateURL    https://raw.githubusercontent.com/imagebuilder1837/replace-ukagaka-with-nailong/refs/heads/main/src/index.user.js
// ==/UserScript==

(() => {
  "use strict";

  const INSTANCE_KEY = "__bangumiNailongTakeover__";

  // 自包含入口可在当前窗口直接调用，也可在同源祖先窗口原地执行。
  function installDocument(key) {
    "use strict";

    const win = window;
    const doc = win.document;
    const existing = win[key];
    if (existing?.document === doc) {
      existing.refresh();
      return;
    }
    const IMAGE_URL = "https://lsky.ry.mk/i/2026/10/03/8a0ced722f2a1.webp";
    const HEADER_IMAGE_URL =
      "https://lsky.ry.mk/i/2026/10/07/97f25f2f55869.webp";
    const HEADER_SELECTOR =
      "#headerNeue2 div.bg:is(.musume_0, .musume_1, .musume_2, .musume_3, .musume_4, .musume_5, .musume_6)";
    const STATE_ATTRIBUTE = "data-nailong-state";
    const FALLBACK_ATTRIBUTE = "data-nailong-static-fallback";

    function rollbackSteps(...steps) {
      const errors = [];
      for (const step of steps) {
        try {
          step();
        } catch (error) {
          errors.push(error);
        }
      }
      return errors;
    }

    function isolate(win, name, rollback) {
      let running = false;
      const target = {
        disabled: false,
        run(action) {
          if (target.disabled || running) return;
          running = true;
          try {
            action();
          } catch (error) {
            // 先停用，确保迟到的图片回调及未能恢复的包装入口不再接管。
            target.disabled = true;
            let errors;
            try {
              errors = rollback() || [];
            } catch (cleanupError) {
              errors = [cleanupError];
            }
            // 警告本身也不能阻断另一目标。
            rollbackSteps(() =>
              win.console.warn(
                `[奶龙] ${name}接管异常，已尽力恢复宿主；本目标停用至页面刷新。`,
                error,
                ...errors,
              ),
            );
          } finally {
            running = false;
          }
        },
      };
      return target;
    }

    function createHeaderTarget(win) {
      const doc = win.document;
      let requested = false;
      let image = null;
      let style = null;
      const target = isolate(win, "页头站娘", () => {
        const previous = image;
        image = null;
        return rollbackSteps(
          () => previous?.remove(),
          () => style?.remove(),
        );
      });

      function refresh() {
        if (requested || !doc.querySelector(HEADER_SELECTOR)) return;
        // 每个宿主文档只尝试一次；成功前保留原背景。
        requested = true;
        const next = new win.Image();
        image = next;
        next.addEventListener(
          "load",
          () =>
            target.run(() => {
              if (image !== next) return;
              style = doc.createElement("style");
              // 保留原占位，裁掉 40×75 图像底部的 25px。
              style.textContent = `
              ${HEADER_SELECTOR} {
                  background: url("${HEADER_IMAGE_URL}") center top / 40px 75px no-repeat !important;
              }
      `;
              (doc.head || doc.documentElement).append(style);
              image = null;
            }),
          { once: true },
        );
        next.addEventListener(
          "error",
          () =>
            target.run(() => {
              if (image === next) image = null;
            }),
          { once: true },
        );
        next.src = HEADER_IMAGE_URL;
      }

      return { refresh: () => target.run(refresh) };
    }

    function createAvatarTarget(win) {
      const doc = win.document;
      const attribute = "data-nailong-avatar";
      const selector = `img, [style*="background"], [class*="avatar"], [class*="Avatar"], [${attribute}]`;
      const stylesheetSelector = "style, link[rel~='stylesheet']";
      const marked = new Set();
      const placeholders = new Map();
      let styleDirty = true;
      let requested = false;
      let ready = false;
      let image = null;
      let style = null;
      const target = isolate(win, "默认头像", () => {
        const previous = image;
        image = null;
        ready = false;
        const errors = rollbackSteps(
          () => previous?.remove(),
          () => style?.remove(),
        );
        for (const node of marked)
          errors.push(...rollbackSteps(() => node.removeAttribute(attribute)));
        marked.clear();
        return errors;
      });

      function isDefaultURL(value) {
        if (!value) return false;
        try {
          const url = new win.URL(value, doc.baseURI);
          return (
            ["https:", "http:"].includes(url.protocol) &&
            url.host === "lain.bgm.tv" &&
            /^\/pic\/user\/[sml]\/icon\.jpg$/.test(url.pathname)
          );
        } catch {
          return false;
        }
      }

      function isDefaultAvatar(node) {
        if (node.localName === "img") {
          // srcset / picture 以浏览器实际选择的资源为准；不改写宿主的加载属性。
          const responsive =
            node.hasAttribute("srcset") ||
            node.parentElement?.localName === "picture";
          return isDefaultURL(
            responsive ? node.currentSrc : node.getAttribute("src"),
          );
        }
        const background = win.getComputedStyle(node).backgroundImage;
        const match = /^url\((?:"([^"]*)"|'([^']*)'|([^'"]*))\)$/.exec(
          background,
        );
        return Boolean(match && isDefaultURL(match[1] ?? match[2] ?? match[3]));
      }

      function ensureStyle() {
        style ||= doc.createElement("style");
        if (styleDirty) {
          // 160px 宽原图以 200% 显示，对应顶部中央的 80×80 头部窗口。
          style.textContent = `
          [${attribute}] {
              background-image: url("${HEADER_IMAGE_URL}") !important;
              background-size: 200% auto !important;
              background-position: center top !important;
              background-repeat: no-repeat !important;
              background-origin: content-box !important;
              background-clip: content-box !important;
          }
          ${Array.from(placeholders.values()).join("\n")}
    `;
          styleDirty = false;
        }
        if (!style.isConnected) (doc.head || doc.documentElement).append(style);
      }

      function avatarValue(node) {
        if (node.localName !== "img") return "background";
        const width = node.naturalWidth || node.width || node.height;
        const height = node.naturalHeight || node.height || node.width;
        // 无固有尺寸、也无占位的图片先等原图加载，不能把布局缩成 1px。
        if (!width || !height) return null;
        const value = `${width}x${height}`;
        if (!placeholders.has(value)) {
          // 同尺寸空白占位隐藏原 img 内容；src、srcset 和固有比例保持不变。
          placeholders.set(
            value,
            `
          img[${attribute}="${value}"] {
              content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'/%3E") !important;
          }`,
          );
          styleDirty = true;
        }
        return value;
      }

      function requestImage() {
        requested = true;
        const next = new win.Image();
        image = next;
        next.addEventListener(
          "load",
          () =>
            target.run(() => {
              if (image !== next) return;
              image = null;
              ready = true;
              refreshRoots([doc]);
            }),
          { once: true },
        );
        next.addEventListener(
          "error",
          () =>
            target.run(() => {
              if (image === next) image = null;
            }),
          { once: true },
        );
        // 与页头共用图片地址，但不依赖页头 DOM 或页头目标的加载状态。
        next.src = HEADER_IMAGE_URL;
      }

      function refreshRoots(roots) {
        if (requested && !ready) return;
        const candidates = new Set();
        for (const root of roots) {
          if (!root || !doc.contains(root)) continue;
          if (root.nodeType === 1 && root.matches(selector))
            candidates.add(root);
          for (const node of root.querySelectorAll(selector))
            candidates.add(node);
        }
        for (const node of marked) {
          if (!doc.contains(node)) {
            node.removeAttribute(attribute);
            marked.delete(node);
          }
        }
        if (!candidates.size) return;
        if (ready) ensureStyle();
        const sheet = Array.from(candidates).some(
          (node) => node.localName !== "img",
        )
          ? style?.sheet
          : null;
        const updates = [];
        // 同步读取宿主原背景；CSSOM 开关不会制造属性观察回环，也不会保存过期背景。
        if (sheet) sheet.disabled = true;
        try {
          for (const node of candidates) {
            if (isDefaultAvatar(node)) {
              if (!ready) {
                requestImage();
                return;
              }
              updates.push([node, avatarValue(node)]);
            } else if (marked.has(node)) {
              updates.push([node, null]);
            }
          }
        } finally {
          if (sheet) sheet.disabled = false;
        }
        // 完成原样式读取后再统一写入，避免更新占位规则时读到自己的奶龙背景。
        if (ready) ensureStyle();
        for (const [node, value] of updates) {
          if (value === null) {
            node.removeAttribute(attribute);
            marked.delete(node);
          } else {
            marked.add(node);
            if (node.getAttribute(attribute) !== value)
              node.setAttribute(attribute, value);
          }
        }
      }

      function containsStylesheet(node) {
        return (
          node.nodeType === 1 &&
          (node.matches(stylesheetSelector) ||
            node.querySelector(stylesheetSelector))
        );
      }

      return {
        refresh(records) {
          target.run(() => {
            if (!records) {
              refreshRoots([doc]);
              return;
            }
            const roots = new Set();
            for (const record of records) {
              const node = record.target;
              if (node === style) continue;
              if (record.type === "attributes") {
                roots.add(
                  node.localName === "source"
                    ? node.parentElement
                    : node.localName === "link"
                      ? doc
                      : node,
                );
              } else {
                if (node.localName === "style") roots.add(doc);
                if (node.localName === "picture") roots.add(node);
                for (const added of record.addedNodes) {
                  if (added.nodeType !== 1 || added === style) continue;
                  roots.add(containsStylesheet(added) ? doc : added);
                }
                if (Array.from(record.removedNodes).some(containsStylesheet))
                  roots.add(doc);
              }
            }
            refreshRoots(roots);
          });
        },
        imageLoaded(node) {
          target.run(() => refreshRoots([node]));
        },
      };
    }

    function createRobotTarget(win) {
      const doc = win.document;
      let style = null;
      let robot = null;
      let frame = null;
      let image = null;
      let state = "idle";
      let wasVisible = false;
      let retryPending = false;
      let hostApi = null;
      let hook = null;
      let hookCallDepth = 0;
      let rejectedHook = null;
      let hookRestoreWarned = false;
      let lastDisposedModel = null;
      let resizeObserver = null;
      const target = isolate(win, "伪春菜", rollback);

      function ensureStyle() {
        if (style) return;
        style = doc.createElement("style");
        const active = `#robot:is([${STATE_ATTRIBUTE}="loading"], [${STATE_ATTRIBUTE}="ready"])`;
        style.textContent = `
          ${active} {
              pointer-events: none !important;
          }
          ${active} #robot_balloon,
          ${active} #robot_balloon * {
              pointer-events: auto !important;
          }
          ${active} .ukagaka_body,
          ${active} .ukagaka_body *,
          ${active} #oml-stage,
          ${active} #oml-stage * {
              visibility: hidden !important;
              pointer-events: none !important;
          }
          #robot[${FALLBACK_ATTRIBUTE}] .ukagaka_body {
              animation: none !important;
              opacity: 1 !important;
          }
          #robot > img[data-nailong-image] {
              display: none !important;
              position: absolute !important;
              height: var(--nailong-height, 0px) !important;
              width: auto !important;
              max-width: none !important;
              max-height: none !important;
              right: var(--nailong-right, 0px) !important;
              bottom: var(--nailong-bottom, 0px) !important;
              margin: 0 !important;
              padding: 0 !important;
              border: 0 !important;
              z-index: 80;
              pointer-events: none !important;
          }
          #robot[${STATE_ATTRIBUTE}="ready"] > img[data-nailong-image] {
              display: block !important;
          }
    `;
        (doc.head || doc.documentElement).append(style);
      }

      function findFrame() {
        const shell = robot?.querySelector("#ukagaka_shell");
        const body = shell?.querySelector(".ukagaka_body");
        if (!body) return null;
        for (
          let node = body.parentElement;
          node && node !== shell;
          node = node.parentElement
        ) {
          if (Array.from(node.classList).some((name) => /^ui_\d+$/.test(name)))
            return node;
        }
        return null;
      }

      function hasModel() {
        return Boolean(
          win.CHII_LIVE_2D_MODEL &&
          !win.CHII_LIVE_2D_MODEL.destroyed &&
          robot?.querySelector("#ukagaka_shell #oml-stage canvas"),
        );
      }

      function restoreHook() {
        if (!hook) return;
        try {
          if (hook.api.initLive2D === hook.wrapper) {
            hook.api.initLive2D = hook.original;
            if (hook.api.initLive2D === hook.wrapper)
              throw new Error("原站未接受入口恢复");
          }
          hook = null;
        } catch (error) {
          // 留住记录，避免下一周期将残留包装入口再包一层。
          if (!target.disabled && !hookRestoreWarned) {
            hookRestoreWarned = true;
            win.console.warn(
              "[奶龙] 无法恢复 Live2D 入口；未接管时包装入口仍会放行。",
              error,
            );
          }
        }
      }

      function isActive() {
        return (
          !target.disabled &&
          Boolean(robot?.isConnected && frame) &&
          (state === "loading" || state === "ready")
        );
      }

      function installHook() {
        if (!hostApi || typeof hostApi.initLive2D !== "function") return;
        if (hook?.api === hostApi && hostApi.initLive2D === hook.wrapper)
          return;
        restoreHook();
        if (hook) return;
        const api = hostApi;
        const original = api.initLive2D;
        if (rejectedHook?.api === api && rejectedHook.original === original)
          return;
        const wrapper = function (...args) {
          hookCallDepth++;
          try {
            target.run(refresh);
          } finally {
            hookCallDepth--;
          }
          if (hostApi === api && isActive()) return;
          return original.apply(this, args);
        };
        try {
          api.initLive2D = wrapper;
          if (api.initLive2D !== wrapper) throw new Error("原站未接受入口包装");
          hook = { api, original, wrapper };
          rejectedHook = null;
          hookRestoreWarned = false;
        } catch (error) {
          rejectedHook = { api, original };
          win.console.warn("[奶龙] Live2D 入口接管失败，退回外观隐藏。", error);
        }
      }

      function disposeExistingModel() {
        const model = win.CHII_LIVE_2D_MODEL;
        if (
          !model ||
          model === lastDisposedModel ||
          typeof hostApi?.disposeLive2D !== "function"
        )
          return;
        if (!robot?.querySelector("#ukagaka_shell #oml-stage canvas")) return;
        // 不先删 canvas：原站清理入口依赖它；同一模型不反复销毁。
        lastDisposedModel = model;
        try {
          hostApi.disposeLive2D();
        } catch (error) {
          win.console.warn("[奶龙] 原模型清理失败，继续隐藏外观。", error);
        }
      }

      function resumeHost() {
        try {
          // 不召唤宿主；原入口自行检查显隐。
          hostApi?.initLive2D?.();
        } catch (error) {
          win.console.warn("[奶龙] 原角色初始化失败，保留静态外观。", error);
        }
      }

      function rollback() {
        const previous = image;
        image = null;
        state = "failed";
        return rollbackSteps(
          () => resizeObserver?.disconnect(),
          () => robot?.removeAttribute(STATE_ATTRIBUTE),
          () => robot?.removeAttribute(FALLBACK_ATTRIBUTE),
          () => previous?.remove(),
          () => style?.remove(),
          restoreHook,
          () => {
            // 移除替换样式后也恢复已被原站淡出的静态外观。
            if (hasModel()) return;
            const body = frame?.querySelector(".ukagaka_body");
            if (body) {
              body.style.animation = "none";
              body.style.opacity = "1";
            }
          },
          () => {
            // 包装入口的调用者会自行放行，避免异常回退重复启动原模型。
            if (hookCallDepth === 0) hostApi?.initLive2D?.();
          },
        );
      }

      function startLoading() {
        state = "loading";
        retryPending = false;
        robot.setAttribute(STATE_ATTRIBUTE, state);
        robot.removeAttribute(FALLBACK_ATTRIBUTE);
        installHook();
        disposeExistingModel();
        image?.remove();
        const next = new win.Image();
        image = next;
        next.setAttribute("data-nailong-image", "");
        next.setAttribute("aria-hidden", "true");
        next.alt = "";
        next.draggable = false;
        next.decoding = "async";
        next.addEventListener(
          "load",
          () =>
            target.run(() => {
              if (image !== next) return;
              state = "ready";
              refresh();
            }),
          { once: true },
        );
        next.addEventListener(
          "error",
          () =>
            target.run(() => {
              if (image !== next) return;
              // 先同步加载期间的显隐；此次失败本身不能被当作新周期重试。
              refresh();
              state = "failed";
              retryPending = false;
              refresh();
              resumeHost();
            }),
          { once: true },
        );
        robot.append(next);
        next.src = IMAGE_URL;
      }

      function positionImage() {
        const bounds = frame.getBoundingClientRect();
        if (bounds.height <= 0) return;
        const parent = robot.getBoundingClientRect();
        const values = {
          "--nailong-height": `${bounds.height}px`,
          "--nailong-right": `${parent.right - bounds.right}px`,
          "--nailong-bottom": `${parent.bottom - bounds.bottom}px`,
        };
        for (const [name, value] of Object.entries(values)) {
          if (image.style.getPropertyValue(name) !== value)
            image.style.setProperty(name, value);
        }
      }

      function refresh() {
        const nextRobot = doc.getElementById("robot");
        if (nextRobot !== robot) {
          robot?.removeAttribute(STATE_ATTRIBUTE);
          robot?.removeAttribute(FALLBACK_ATTRIBUTE);
          image?.remove();
          robot = nextRobot;
          wasVisible = false;
          retryPending = false;
        }
        hostApi = win.chiiLib?.ukagaka || null;
        const nextFrame = findFrame();
        if (nextFrame !== frame) {
          resizeObserver?.disconnect();
          frame = nextFrame;
          if (frame && typeof win.ResizeObserver === "function") {
            resizeObserver ||= new win.ResizeObserver(() =>
              target.run(refresh),
            );
            resizeObserver.observe(frame, { box: "border-box" });
          }
        }
        if (!robot) {
          restoreHook();
          return;
        }

        const computed = win.getComputedStyle(robot);
        const visible =
          robot.getClientRects().length > 0 &&
          computed.display !== "none" &&
          computed.visibility !== "hidden" &&
          !robot.hidden;
        const entered = visible && !wasVisible;
        wasVisible = visible;
        if (!visible) retryPending = false;
        if (entered && state === "failed") retryPending = true;
        if (!frame) {
          // 解析中或未知结构不算接管成功，不施加隐藏或点击拦截。
          robot.removeAttribute(STATE_ATTRIBUTE);
          robot.removeAttribute(FALLBACK_ATTRIBUTE);
          image?.remove();
          restoreHook();
          return;
        }
        ensureStyle();
        // 失败回退不是新周期；等下一周期（及其角色结构就绪）才重试。
        if (
          visible &&
          (state === "idle" || (state === "failed" && retryPending))
        )
          startLoading();

        if (isActive()) {
          if (robot.getAttribute(STATE_ATTRIBUTE) !== state)
            robot.setAttribute(STATE_ATTRIBUTE, state);
        } else {
          robot.removeAttribute(STATE_ATTRIBUTE);
        }
        robot.toggleAttribute(
          FALLBACK_ATTRIBUTE,
          state === "failed" && !hasModel(),
        );
        if (state === "failed") {
          restoreHook();
        } else {
          installHook();
          if (isActive()) disposeExistingModel();
        }
        if (image && isActive()) {
          if (image.parentElement !== robot) robot.append(image);
          if (visible) positionImage();
        } else {
          image?.remove();
        }
      }

      return {
        refresh(records) {
          target.run(() => {
            // 忽略自有图片的样式变化，避免观察回环；异步 API 和新角色仍会发现。
            if (
              records &&
              doc.getElementById("robot") === robot &&
              (win.chiiLib?.ukagaka || null) === hostApi &&
              !records.some(
                ({ target: node, type }) =>
                  node !== image &&
                  node !== style &&
                  robot &&
                  (node === robot ||
                    robot.contains(node) ||
                    (type === "attributes" && node.contains(robot))),
              )
            )
              return;
            refresh();
          });
        },
      };
    }

    const header = createHeaderTarget(win);
    const robot = createRobotTarget(win);
    const avatars = createAvatarTarget(win);
    const refresh = () => {
      header.refresh();
      robot.refresh();
      avatars.refresh();
    };
    // 按宿主文档登记，多个 iframe／安装入口复用；不跟随来源 iframe 的卸载清理。
    win[key] = { document: doc, refresh };
    refresh();
    let observer;
    try {
      observer = new win.MutationObserver((records) => {
        header.refresh();
        robot.refresh(records);
        avatars.refresh(records);
      });
      observer.observe(doc, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "style",
          "class",
          "hidden",
          "data-theme",
          "src",
          "srcset",
          "sizes",
          "media",
          "type",
        ],
      });
    } catch (error) {
      rollbackSteps(
        () => observer?.disconnect(),
        () =>
          win.console.warn(
            "[奶龙] 无法监听文档变化，退回加载／缩放事件触发。",
            error,
          ),
      );
    }
    doc.addEventListener(
      "load",
      (event) => {
        if (event.target instanceof win.HTMLScriptElement) refresh();
        else if (event.target instanceof win.HTMLImageElement)
          avatars.imageLoaded(event.target);
        else if (event.target instanceof win.HTMLLinkElement) avatars.refresh();
      },
      true,
    );
    doc.addEventListener(
      "error",
      (event) => {
        if (event.target instanceof win.HTMLImageElement)
          avatars.imageLoaded(event.target);
      },
      true,
    );
    doc.addEventListener("DOMContentLoaded", refresh, { once: true });
    win.addEventListener("load", refresh, { once: true });
    win.addEventListener("resize", refresh);
  }

  function install(win) {
    const doc = win.document;
    const existing = win[INSTANCE_KEY];
    if (existing?.document === doc) {
      existing.refresh();
      return;
    }
    if (win === window) {
      installDocument(INSTANCE_KEY);
      return;
    }
    // 祖先的回调也必须在祖先执行环境创建，不能依赖会导航的来源 iframe。
    // 只注入本脚本自带的安装入口；不获取外部代码、不绕过宿主脚本策略。
    const script = doc.createElement("script");
    script.textContent = `(${installDocument.toString()})(${JSON.stringify(INSTANCE_KEY)});`;
    try {
      (doc.head || doc.documentElement).append(script);
    } finally {
      script.remove();
    }
    if (win[INSTANCE_KEY]?.document !== doc)
      throw new Error("宿主未执行安装入口，请检查其脚本安全策略");
  }

  // 超展开的组件入口在 iframe，角色却在顶层；只沿可访问的同源祖先查找。
  const origin = window.location.origin;
  let host = window;
  while (host) {
    let parent;
    try {
      if (host.location.origin !== origin) break;
      if (!["bgm.tv", "bangumi.tv", "chii.in"].includes(host.location.hostname))
        break;
      parent = host.parent;
      void host.document;
    } catch {
      break;
    }
    try {
      install(host);
    } catch (error) {
      host.console.warn(
        "[奶龙] 无法建立文档监听，继续尝试其他同源宿主。",
        error,
      );
    }
    if (parent === host) break;
    host = parent;
  }
})();
