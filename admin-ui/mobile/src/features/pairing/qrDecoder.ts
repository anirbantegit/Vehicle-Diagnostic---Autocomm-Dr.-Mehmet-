import QrScanner from 'qr-scanner';
import type {PairingCredentials} from '../../services/mobileApi';

export type QrScanMatch = {
    rawValue: string;
    cornerPoints: QrScanner.Point[];
};

type StructuredPairingPayload = {
    type?: string;
    pairing_id?: string;
    pairing_secret?: string;
};

const COMPACT_PAIRING_PREFIX = 'autocom-pair|';
const CROP_RATIOS = [0.82, 0.62, 0.46];
const CROP_CENTRES = [0.5, 0.32, 0.68];

const requiredCredentials = (pairingId: string, pairingSecret: string): PairingCredentials => {
    if (!pairingId || !pairingSecret) {
        throw new Error('The scanned QR pairing code is incomplete. Generate a fresh QR code from the PC console.');
    }
    return {pairingId, pairingSecret};
};

const decodeCompactPairingValue = (value: string): PairingCredentials | null => {
    if (!value.startsWith(COMPACT_PAIRING_PREFIX)) {
        return null;
    }
    const segments = value.split('|');
    if (segments.length !== 3) {
        throw new Error('The scanned compact pairing QR code is incomplete. Generate a fresh QR code from the PC console.');
    }
    return requiredCredentials(decodeURIComponent(segments[1]), decodeURIComponent(segments[2]));
};

export const pairingCredentialsFromLink = (rawValue: string): PairingCredentials => {
    const value = rawValue.trim();
    const compactCredentials = decodeCompactPairingValue(value);
    if (compactCredentials) {
        return compactCredentials;
    }

    try {
        const payload = JSON.parse(value) as StructuredPairingPayload;
        if (payload.type === 'diagnostic_bridge_pairing') {
            return requiredCredentials(payload.pairing_id || '', payload.pairing_secret || '');
        }
    } catch {
        // Dashboard QR values are compact; URL support preserves compatibility with prior generated codes.
    }

    let url: URL;
    try {
        url = new URL(value, window.location.origin);
    } catch {
        throw new Error('The scanned QR value is not a valid pairing code. Generate a fresh QR code from the PC console.');
    }

    if (!url.pathname.replace(/\/+$/, '').endsWith('/mobile/pair')) {
        throw new Error('This QR code is not a Diagnostic Engine Console pairing QR code.');
    }

    return requiredCredentials(
        url.searchParams.get('pairing_id') || '',
        url.searchParams.get('pairing_secret') || '',
    );
};

const toScanMatch = (result: QrScanner.ScanResult): QrScanMatch => ({
    rawValue: result.data.trim(),
    cornerPoints: result.cornerPoints,
});

const scanSource = async (
    source: File | ImageBitmap,
    scanRegion?: QrScanner.ScanRegion,
): Promise<QrScanMatch | null> => {
    try {
        const result = await QrScanner.scanImage(source, {
            scanRegion,
            alsoTryWithoutScanRegion: Boolean(scanRegion),
            returnDetailedScanResult: true,
        });
        return result.data.trim() ? toScanMatch(result) : null;
    } catch {
        return null;
    }
};

const candidateRegions = (width: number, height: number): QrScanner.ScanRegion[] => {
    const regions: QrScanner.ScanRegion[] = [];
    for (const ratio of CROP_RATIOS) {
        const cropWidth = Math.round(width * ratio);
        const cropHeight = Math.round(height * ratio);
        for (const centerX of CROP_CENTRES) {
            for (const centerY of CROP_CENTRES) {
                const x = Math.max(0, Math.min(width - cropWidth, Math.round(width * centerX - cropWidth / 2)));
                const y = Math.max(0, Math.min(height - cropHeight, Math.round(height * centerY - cropHeight / 2)));
                regions.push({
                    x,
                    y,
                    width: cropWidth,
                    height: cropHeight,
                    downScaledWidth: 1200,
                    downScaledHeight: 1200,
                });
            }
        }
    }
    return regions;
};

export const decodePairingQrImage = async (file: File): Promise<QrScanMatch> => {
    const directMatch = await scanSource(file);
    if (directMatch) {
        return directMatch;
    }

    if (typeof createImageBitmap === 'function') {
        const image = await createImageBitmap(file);
        try {
            for (const region of candidateRegions(image.width, image.height)) {
                const croppedMatch = await scanSource(image, region);
                if (croppedMatch) {
                    return croppedMatch;
                }
            }
        } finally {
            image.close();
        }
    }

    throw new Error('No QR code was detected in this image. Use the newly generated compact QR, keep it sharp, and ensure the whole square code is visible.');
};
