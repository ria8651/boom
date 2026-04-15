interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(
    options?: DocumentPictureInPictureOptions,
  ): Promise<Window>;
  readonly window: Window | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
