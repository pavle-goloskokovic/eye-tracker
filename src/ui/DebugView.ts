// ------------------------------------------------------------
// Shows the detector input canvas (with the face box and FPS)
// in a corner, like the original OpenCV preview window.
// ------------------------------------------------------------

export class DebugView {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.container.appendChild(canvas);
  }

  get visible(): boolean {
    return !this.container.hidden;
  }

  setVisible(visible: boolean): void {
    this.container.hidden = !visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }
}
