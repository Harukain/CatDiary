import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageResizeMode,
  type ImageStyle,
  StyleSheet,
  type StyleProp,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '@cat-diary/design-tokens';

interface AuthenticatedImageSource {
  uri: string;
  headers?: Record<string, string>;
}

interface AuthenticatedImageProps {
  source: AuthenticatedImageSource;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
  testID?: string;
}

export function AuthenticatedImage({
  source,
  style,
  resizeMode = 'cover',
  accessibilityLabel,
  testID,
}: AuthenticatedImageProps) {
  const [localUri, setLocalUri] = useState(source.headers ? '' : source.uri);
  const [failed, setFailed] = useState(false);
  const lastRequestKey = useRef('');
  const cacheUri = useMemo(() => cachedPhotoUri(source.uri), [source.uri]);
  const headerKey = useMemo(
    () =>
      source.headers
        ? Object.entries(source.headers)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${value}`)
            .join('\n')
        : '',
    [source.headers],
  );
  const requestKey = `${source.uri}\n${headerKey}`;

  useEffect(() => {
    let cancelled = false;
    const sameRequest = lastRequestKey.current === requestKey;
    lastRequestKey.current = requestKey;
    setFailed(false);
    const headers = source.headers;
    if (!headers) {
      setLocalUri(source.uri);
      return () => {
        cancelled = true;
      };
    }
    if (!sameRequest) setLocalUri('');
    void (async () => {
      try {
        if (!cacheUri) throw new Error('图片缓存目录不可用');
        await FileSystem.makeDirectoryAsync(cacheUri.directory, { intermediates: true });
        const cached = await FileSystem.getInfoAsync(cacheUri.file);
        if (!cached.exists) {
          const result = await FileSystem.downloadAsync(source.uri, cacheUri.file, {
            headers,
          });
          if (result.status < 200 || result.status >= 300)
            throw new Error(`图片下载失败：${result.status}`);
        }
        if (!cancelled) setLocalUri(cacheUri.file);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheUri, requestKey, source.headers, source.uri]);

  return (
    <View testID={testID} style={[styles.frame, style]}>
      {localUri ? (
        <Image
          accessibilityLabel={accessibilityLabel}
          source={{ uri: localUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          onError={() => setFailed(true)}
        />
      ) : failed ? null : (
        <ActivityIndicator color={colors.brand} />
      )}
    </View>
  );
}

export function cachedPhotoUri(uri: string) {
  const directory = FileSystem.cacheDirectory
    ? `${FileSystem.cacheDirectory}photo-image-cache/`
    : null;
  if (!directory) return null;
  return { directory, file: `${directory}${hashString(uri)}.png` };
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 33) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
