type ResizeObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void

class TestResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this)
  }

  unobserve(): void {}

  disconnect(): void {}
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ""
  readonly thresholds = [0]

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

export function installBrowserMocks(): void {
  globalThis.ResizeObserver = TestResizeObserver
  globalThis.IntersectionObserver = TestIntersectionObserver
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)
  globalThis.cancelAnimationFrame = (id: number) => window.clearTimeout(id)
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
  window.HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() {
    return false
  }
  window.HTMLElement.prototype.setPointerCapture = function setPointerCapture() {}
  window.HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {}
}

export function setViewport(width: number, height = 900): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
  window.dispatchEvent(new Event("resize"))
}

export function installMatchMedia(matches = false): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  })
}
