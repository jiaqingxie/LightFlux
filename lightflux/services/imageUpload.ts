const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type ImageUploadErrorCode =
  | 'not-configured'
  | 'too-large'
  | 'unsupported'
  | 'upload-failed';

export class ImageUploadError extends Error {
  code: ImageUploadErrorCode;

  constructor(code: ImageUploadErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const uploadImage = async (
  imageBody: Blob,
  contentType: string,
  size: number,
): Promise<string> => {
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    throw new ImageUploadError(
      'unsupported',
      'This image type is not supported.',
    );
  }

  if (size > MAX_IMAGE_BYTES) {
    throw new ImageUploadError(
      'too-large',
      'The image exceeds the upload limit.',
    );
  }

  // Embed raster bytes so task backups remain portable and work offline.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageUploadError('upload-failed', 'Unable to read image.'));
    reader.readAsDataURL(new Blob([imageBody], { type: contentType }));
  });
};

export const uploadTaskImage = async (file: File): Promise<string> =>
  uploadImage(file, file.type, file.size);

export const uploadProfileImage = async ({
  file,
  fileSize,
  mimeType,
  uri,
}: {
  file?: File;
  fileSize?: number;
  mimeType?: string;
  uri: string;
}): Promise<string> => {
  let body: Blob;
  if (file) {
    body = file;
  } else {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new ImageUploadError(
        'upload-failed',
        'Unable to read the selected image.',
      );
    }
    body = await response.blob();
  }

  return uploadImage(
    body,
    mimeType || body.type,
    fileSize ?? body.size,
  );
};
