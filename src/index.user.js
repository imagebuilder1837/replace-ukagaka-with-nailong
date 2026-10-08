// ==UserScript==
// @name         把伪春菜换成奶龙
// @namespace    https://github.com/imagebuilder1837/replace-ukagaka-with-nailong
// @version      0.1.1
// @description  把 Bangumi 右下角的 Live2D 伪春菜和左上角的站娘换成奶龙。
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

  const IMAGE_URL = "https://lsky.ry.mk/i/2026/10/03/8a0ced722f2a1.webp";
  const HEADER_IMAGE_URL = "https://lsky.ry.mk/i/2026/10/07/97f25f2f55869.webp";
  const HEADER_SELECTOR =
    "#headerNeue2 div.bg:is(.musume_0, .musume_1, .musume_2, .musume_3, .musume_4, .musume_5, .musume_6)";
  const STATE_ATTRIBUTE = "data-nailong-state";
  const FALLBACK_ATTRIBUTE = "data-nailong-static-fallback";
  const style = document.createElement("style");
  style.textContent = `
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) {
            pointer-events: none !important;
        }
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) #robot_balloon,
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) #robot_balloon * {
            pointer-events: auto !important;
        }
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) .ukagaka_body,
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) .ukagaka_body *,
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) #oml-stage,
        #robot[${STATE_ATTRIBUTE}]:not([${STATE_ATTRIBUTE}="failed"]) #oml-stage * {
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
  (document.head || document.documentElement).append(style);

  let robot = null;
  let frame = null;
  let image = null;
  let state = "idle";
  let wasVisible = false;
  let hostApi = null;
  let hook = null;
  let headerImageRequested = false;
  let lastDisposedModel = null;
  const resizeObserver = new ResizeObserver(refresh);

  function loadHeaderImage() {
    if (headerImageRequested || !document.querySelector(HEADER_SELECTOR))
      return;
    // 每页只尝试一次；成功前不覆盖原背景，也不与伪春菜的加载状态耦合。
    headerImageRequested = true;
    const next = new Image();
    next.addEventListener(
      "load",
      () => {
        // 保留原占位，以背景绘制窗口裁掉 40×75 图像底部的 25px。
        style.textContent += `
          ${HEADER_SELECTOR} {
              background: url("${HEADER_IMAGE_URL}") center top / 40px 75px no-repeat !important;
          }
        `;
      },
      { once: true },
    );
    next.src = HEADER_IMAGE_URL;
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

  function restoreHook() {
    if (!hook) return;
    try {
      if (hook.api.initLive2D === hook.wrapper)
        hook.api.initLive2D = hook.original;
    } catch (error) {
      console.warn(
        "[奶龙] 无法恢复 Live2D 入口；包装入口仍会在失败状态放行。",
        error,
      );
    }
    hook = null;
  }

  function installHook() {
    if (!hostApi || typeof hostApi.initLive2D !== "function") return;
    if (hook?.api === hostApi && hostApi.initLive2D === hook.wrapper) return;
    restoreHook();
    const api = hostApi;
    const original = api.initLive2D;
    const wrapper = function (...args) {
      refresh();
      if (state !== "failed" && robot?.isConnected && frame) return;
      return original.apply(this, args);
    };
    try {
      api.initLive2D = wrapper;
      if (api.initLive2D === wrapper) hook = { api, original, wrapper };
    } catch (error) {
      // 接口不可写时仍通过限定到角色外观的 CSS 接管。
      console.warn("[奶龙] Live2D 入口接管失败，退回外观隐藏。", error);
    }
  }

  function disposeExistingModel() {
    const model = window.CHII_LIVE_2D_MODEL;
    if (
      !model ||
      model === lastDisposedModel ||
      typeof hostApi?.disposeLive2D !== "function"
    )
      return;
    if (!robot?.querySelector("#ukagaka_shell #oml-stage canvas")) return;
    // 不先删 canvas：原站清理入口依赖它；同一模型失败后也不反复销毁。
    lastDisposedModel = model;
    try {
      hostApi.disposeLive2D();
    } catch (error) {
      console.warn("[奶龙] 原模型清理失败，继续隐藏外观。", error);
    }
  }

  function startLoading() {
    state = "loading";
    robot.setAttribute(STATE_ATTRIBUTE, state);
    robot.removeAttribute(FALLBACK_ATTRIBUTE);
    installHook();
    disposeExistingModel();
    image?.remove();
    const next = new Image();
    image = next;
    next.setAttribute("data-nailong-image", "");
    next.setAttribute("aria-hidden", "true");
    next.alt = "";
    next.draggable = false;
    next.decoding = "async";
    next.addEventListener(
      "load",
      () => {
        if (image !== next) return;
        state = "ready";
        refresh();
      },
      { once: true },
    );
    next.addEventListener(
      "error",
      () => {
        if (image !== next) return;
        state = "failed";
        refresh();
        // 只恢复外观及初始化，不召唤宿主；原入口自己判断是否需要模型。
        try {
          hostApi?.initLive2D?.();
        } catch (error) {
          console.warn("[奶龙] 原角色初始化失败，保留静态外观。", error);
        }
      },
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
    loadHeaderImage();
    const nextRobot = document.getElementById("robot");
    if (nextRobot !== robot) {
      robot?.removeAttribute(STATE_ATTRIBUTE);
      robot?.removeAttribute(FALLBACK_ATTRIBUTE);
      image?.remove();
      robot = nextRobot;
      wasVisible = false;
    }
    hostApi = window.chiiLib?.ukagaka || null;
    const nextFrame = findFrame();
    if (nextFrame !== frame) {
      resizeObserver.disconnect();
      frame = nextFrame;
      if (frame) resizeObserver.observe(frame, { box: "border-box" });
    }
    if (!robot) {
      restoreHook();
      return;
    }

    const computed = getComputedStyle(robot);
    const visible =
      robot.getClientRects().length > 0 &&
      computed.display !== "none" &&
      computed.visibility !== "hidden" &&
      !robot.hidden;
    const entered = visible && !wasVisible;
    wasVisible = visible;
    // 失败回退不是新周期；只有宿主下一次从隐藏变为显示才重试。
    if (
      frame &&
      visible &&
      (state === "idle" || (state === "failed" && entered))
    )
      startLoading();

    if (robot.getAttribute(STATE_ATTRIBUTE) !== state)
      robot.setAttribute(STATE_ATTRIBUTE, state);
    const hasModel = Boolean(
      window.CHII_LIVE_2D_MODEL &&
      !window.CHII_LIVE_2D_MODEL.destroyed &&
      robot.querySelector("#ukagaka_shell #oml-stage canvas"),
    );
    robot.toggleAttribute(FALLBACK_ATTRIBUTE, state === "failed" && !hasModel);
    if (state === "failed" || !frame) {
      restoreHook();
    } else {
      installHook();
      disposeExistingModel();
    }
    if (image && frame) {
      if (image.parentElement !== robot) robot.append(image);
      if (visible) positionImage();
    } else {
      image?.remove();
    }
  }

  // 发现解析中的角色、异步挂载和新全局 API；忽略自有图片样式，避免观察回环。
  const observer = new MutationObserver((records) => {
    loadHeaderImage();
    if (
      document.getElementById("robot") !== robot ||
      (window.chiiLib?.ukagaka || null) !== hostApi
    ) {
      refresh();
      return;
    }
    if (
      robot &&
      records.some(
        ({ target, type }) =>
          target !== image &&
          target !== style &&
          (target === robot ||
            robot.contains(target) ||
            (type === "attributes" && target.contains(robot))),
      )
    )
      refresh();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "data-theme"],
  });
  // 原站在 script 执行后、document ready 时初始化；尽早包装入口但不劫持全局变量。
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLScriptElement) refresh();
    },
    true,
  );
  document.addEventListener("DOMContentLoaded", refresh, { once: true });
  window.addEventListener("load", refresh, { once: true });
  window.addEventListener("resize", refresh);
  refresh();
})();
