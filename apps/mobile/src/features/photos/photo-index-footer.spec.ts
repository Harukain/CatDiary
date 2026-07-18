import { describe, expect, it } from 'vitest';
import photosIndexSource from '../../../app/photos/index.tsx?raw';

describe('photo album index footer actions', () => {
  it('keeps upload and return actions fixed and safe-area aware', () => {
    expect(photosIndexSource).toContain('useSafeAreaInsets');
    expect(photosIndexSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(photosIndexSource).toContain('testID="photos.footer"');
    expect(photosIndexSource).toContain('testID="photos.upload.button"');
    expect(photosIndexSource).toContain('testID="photos.reload.button"');
    expect(photosIndexSource).toContain('testID="photos.return.button"');
    expect(photosIndexSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
    expect(photosIndexSource).toContain('content: { paddingBottom: spacing.xl, gap: spacing.lg }');
  });

  it('exits loading when session or family context is missing', () => {
    expect(photosIndexSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(photosIndexSource).toContain('setPets([]);');
    expect(photosIndexSource).toContain('setPhotos([]);');
    expect(photosIndexSource).toContain('setLoading(false);');
    expect(photosIndexSource).toContain('testID="photos.context-empty"');
  });

  it('does not keep duplicate upload buttons inside the header or empty state', () => {
    expect(photosIndexSource).not.toContain('testID="photos.add.button"');
    expect(photosIndexSource).not.toContain('testID="photos.empty.upload.button"');
  });

  it('locks filters and upload while album data is not ready', () => {
    expect(photosIndexSource).toContain(
      'const canUpload = !!session && !!activeFamily && !loading;',
    );
    expect(photosIndexSource).toContain('disabled={loading || contextUnavailable}');
    expect(photosIndexSource).toContain(
      'accessibilityState={{ selected: active, disabled: !!disabled }}',
    );
    expect(photosIndexSource).toContain('disabled={!canUpload}');
  });
});
