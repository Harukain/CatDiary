import { describe, expect, it } from 'vitest';
import healthEventDetailSource from '../../../app/health-events/[id].tsx?raw';
import newHealthEventSource from '../../../app/health-events/new.tsx?raw';

describe('health event bottom actions', () => {
  it('keeps new health event actions fixed and keyboard-safe', () => {
    expect(newHealthEventSource).toContain('KeyboardAvoidingView');
    expect(newHealthEventSource).toContain('Keyboard.addListener');
    expect(newHealthEventSource).toContain('useSafeAreaInsets');
    expect(newHealthEventSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(newHealthEventSource).toContain('testID="health-event-new.footer"');
    expect(newHealthEventSource).toContain('testID="health-event-new.submit.button"');
    expect(newHealthEventSource).toContain('testID="health-event-new.cancel.button"');
    expect(newHealthEventSource).toContain('testID="health-event-new.submit.inline-button"');
    expect(newHealthEventSource).toContain('testID="health-event-new.cancel.inline-button"');
    expect(newHealthEventSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps health event detail actions fixed and safe-area aware', () => {
    expect(healthEventDetailSource).toContain('KeyboardAvoidingView');
    expect(healthEventDetailSource).toContain('Keyboard.addListener');
    expect(healthEventDetailSource).toContain('useSafeAreaInsets');
    expect(healthEventDetailSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.footer"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.save.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.recover.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.return.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.save.inline-button"');
    expect(healthEventDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });
});
