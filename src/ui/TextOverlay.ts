import type { Config } from '../config';

// ------------------------------------------------------------
// Typewriter text shown while a face is being tracked.
// Rendered as a plain HTML element instead of a texture.
// ------------------------------------------------------------

export class TextOverlay {
  private readonly element: HTMLElement;
  private readonly settings: Config['text'];

  private targetText = '';
  private visibleText = '';
  private visible = false;
  private lastCharacterTime = performance.now();

  constructor(element: HTMLElement, settings: Config['text']) {
    this.element = element;
    this.settings = settings;

    // Cap by viewport width so the line fits on narrow screens.
    element.style.fontSize = `min(${settings.fontSizePx}px, 6.5vw)`;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }

    this.visible = visible;

    if (!visible) {
      this.visibleText = '';
      this.targetText = '';
      this.element.textContent = '';
      this.element.hidden = true;
    } else {
      this.element.hidden = false;
    }

    this.lastCharacterTime = performance.now();
  }

  update(fullText: string): void {
    if (!this.visible) {
      return;
    }

    if (this.targetText !== fullText) {
      this.targetText = fullText;
      this.visibleText = '';
      this.element.textContent = '';
      this.lastCharacterTime = performance.now();
    }

    if (this.visibleText.length >= this.targetText.length) {
      return;
    }

    const now = performance.now();
    const elapsed = (now - this.lastCharacterTime) / 1000;

    if (elapsed >= this.settings.charDelaySeconds) {
      this.visibleText += this.targetText[this.visibleText.length];
      this.element.textContent = this.visibleText;
      this.lastCharacterTime = now;
    }
  }
}
