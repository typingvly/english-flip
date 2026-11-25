const DB_NAME = 'EnglishFlipAssetsDB';
const STORE_NAME = 'backgrounds';
const BG_KEY = 'customBackgroundBlob';
const MAX_DIMENSION = 1920;
const MAX_RAW_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서는 로컬 이미지 저장을 지원하지 않습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('이미지 저장소 열기 실패'));
  });
}

async function putBlob(blob: Blob): Promise<void> {
  const db = await openAssetDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, BG_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('이미지 저장 실패'));
    };
  });
}

async function getBlob(): Promise<Blob | null> {
  const db = await openAssetDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(BG_KEY);
    req.onsuccess = () => {
      const result = req.result;
      db.close();
      resolve(result instanceof Blob ? result : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('이미지 불러오기 실패'));
    };
  });
}

export async function clearBackgroundImage(): Promise<void> {
  try {
    const db = await openAssetDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(BG_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore storage cleanup errors
  }
}

export async function loadBackgroundImageUrl(): Promise<string | null> {
  try {
    const blob = await getBlob();
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    img.src = src;
  });
}

export async function processAndSaveBackgroundImage(file: File): Promise<string> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('JPG, PNG, WebP, GIF 이미지 파일만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('이미지 크기는 20MB 이하만 지원합니다.');
  }

  const tempUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(tempUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('브라우저 캔버스 컨텍스트를 생성할 수 없습니다.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          canvas.toBlob(
            (fallback) => {
              if (fallback) resolve(fallback);
              else reject(new Error('이미지 압축에 실패했습니다.'));
            },
            'image/jpeg',
            0.86,
          );
        },
        'image/webp',
        0.86,
      );
    });

    await putBlob(compressedBlob);
    return URL.createObjectURL(compressedBlob);
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}
