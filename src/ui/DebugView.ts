// ------------------------------------------------------------
// Shows the detector input canvas (with the face box and FPS)
// in a corner, like the original OpenCV preview window.
// ------------------------------------------------------------

export class DebugView {
  private readonly container: HTMLElement;
  private readonly onChange: (visible: boolean) => void;

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    onChange: (visible: boolean) => void,
  ) {
    this.container = container;
    this.onChange = onChange;
    this.container.appendChild(canvas);

    onChange(this.visible);
  }

  get visible(): boolean {
    return !this.container.hidden;
  }

  setVisible(visible: boolean): void {
    this.container.hidden = !visible;
    this.onChange(visible);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }
}
