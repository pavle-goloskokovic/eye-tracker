import { FileSource } from '../input/FileSource';
import { UrlSource } from '../input/UrlSource';
import { WebcamSource } from '../input/WebcamSource';
import type { VideoSource } from '../input/VideoSource';

// ------------------------------------------------------------
// Small panel for choosing the tracking input. The last choice
// is remembered in localStorage so a kiosk restarts unattended.
// ------------------------------------------------------------

type SourceKind = VideoSource['kind'];

interface SavedChoice {
  kind: SourceKind;
  deviceId?: string;
  url?: string;
}

const STORAGE_KEY = 'eye-tracker.source';

export class SourcePicker {
  private readonly panel: HTMLElement;
  private readonly typeSelect: HTMLSelectElement;
  private readonly deviceSelect: HTMLSelectElement;
  private readonly fileInput: HTMLInputElement;
  private readonly urlInput: HTMLInputElement;
  private readonly applyButton: HTMLButtonElement;
  private readonly status: HTMLElement;

  private readonly rowDevice: HTMLElement;
  private readonly rowFile: HTMLElement;
  private readonly rowUrl: HTMLElement;

  private readonly onSelect: (source: VideoSource) => Promise<void>;

  constructor(panel: HTMLElement, onSelect: (source: VideoSource) => Promise<void>) {
    this.panel = panel;
    this.onSelect = onSelect;

    this.typeSelect = query(panel, '#source-type');
    this.deviceSelect = query(panel, '#source-device');
    this.fileInput = query(panel, '#source-file');
    this.urlInput = query(panel, '#source-url');
    this.applyButton = query(panel, '#source-apply');
    this.status = query(panel, '#panel-status');

    this.rowDevice = query(panel, '#row-device');
    this.rowFile = query(panel, '#row-file');
    this.rowUrl = query(panel, '#row-url');

    this.typeSelect.addEventListener('change', () => this.updateRows());
    this.applyButton.addEventListener('click', () => void this.apply());

    this.urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        void this.apply();
      }
    });

    // Keep keyboard shortcuts from firing while typing here.
    panel.addEventListener('keydown', (event) => event.stopPropagation());

    this.restore();
    this.updateRows();

    void this.refreshDevices();

    navigator.mediaDevices?.addEventListener?.('devicechange', () => void this.refreshDevices());
  }

  // --------------------------------------------------------
  // Visibility
  // --------------------------------------------------------

  get visible(): boolean {
    return !this.panel.hidden;
  }

  setVisible(visible: boolean): void {
    this.panel.hidden = !visible;
    document.body.classList.toggle('show-cursor', visible);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  // --------------------------------------------------------
  // Auto-start with the remembered choice (webcam by default)
  // --------------------------------------------------------

  async autoStart(): Promise<boolean> {
    const saved = this.load();

    if (saved?.kind === 'file') {
      // A file cannot be reopened without a user gesture.
      this.setVisible(true);
      this.setStatus('Choose a video file to continue.');

      return false;
    }

    try {
      await this.apply();

      return true;
    } catch {
      this.setVisible(true);

      return false;
    }
  }

  // --------------------------------------------------------
  // Apply the current selection
  // --------------------------------------------------------

  private async apply(): Promise<void> {
    const kind = this.typeSelect.value as SourceKind;

    let source: VideoSource;
    const choice: SavedChoice = { kind };

    switch (kind) {
      case 'webcam': {
        const deviceId = this.deviceSelect.value || undefined;

        source = new WebcamSource({ deviceId });
        choice.deviceId = deviceId;
        break;
      }

      case 'file': {
        const file = this.fileInput.files?.[0];

        if (!file) {
          this.setStatus('Choose a video file first.');

          throw new Error('No file selected.');
        }

        source = new FileSource(file);
        break;
      }

      case 'url': {
        const url = this.urlInput.value.trim();

        if (!url) {
          this.setStatus('Enter a stream URL first.');

          throw new Error('No URL entered.');
        }

        source = new UrlSource(url);
        choice.url = url;
        break;
      }
    }

    this.applyButton.disabled = true;
    this.setStatus('Starting…');

    try {
      await this.onSelect(source);

      this.save(choice);
      this.setStatus('');
      this.setVisible(false);

      // Labels become available once permission is granted.
      void this.refreshDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.setStatus(message);

      throw error;
    } finally {
      this.applyButton.disabled = false;
    }
  }

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  private updateRows(): void {
    const kind = this.typeSelect.value as SourceKind;

    this.rowDevice.hidden = kind !== 'webcam';
    this.rowFile.hidden = kind !== 'file';
    this.rowUrl.hidden = kind !== 'url';
  }

  private async refreshDevices(): Promise<void> {
    const devices = await WebcamSource.listDevices();
    const previous = this.deviceSelect.value || this.load()?.deviceId || '';

    this.deviceSelect.replaceChildren();

    const defaultOption = document.createElement('option');

    defaultOption.value = '';
    defaultOption.textContent = 'Default camera';

    this.deviceSelect.appendChild(defaultOption);

    devices.forEach((device, index) => {
      const option = document.createElement('option');

      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;

      this.deviceSelect.appendChild(option);
    });

    if ([...this.deviceSelect.options].some((option) => option.value === previous)) {
      this.deviceSelect.value = previous;
    }
  }

  private restore(): void {
    const saved = this.load();

    if (!saved) {
      return;
    }

    this.typeSelect.value = saved.kind;

    if (saved.url) {
      this.urlInput.value = saved.url;
    }
  }

  private load(): SavedChoice | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      return raw ? (JSON.parse(raw) as SavedChoice) : null;
    } catch {
      return null;
    }
  }

  private save(choice: SavedChoice): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    } catch {
      // Storage may be unavailable in private mode; ignore.
    }
  }
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
