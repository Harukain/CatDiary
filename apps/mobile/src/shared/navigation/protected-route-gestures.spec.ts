import { describe, expect, it } from 'vitest';
import taskDetailSource from '../../../app/tasks/[id].tsx?raw';
import photoDetailSource from '../../../app/photos/[id].tsx?raw';

describe('protected route gestures', () => {
  it('keeps task detail native swipe-back behind the guarded return path', () => {
    expect(taskDetailSource).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(taskDetailSource).toContain('<Stack.Screen options={{ gestureEnabled: false }} />');
    expect(taskDetailSource).toContain('onPress={requestReturn}');
  });

  it('keeps photo detail native swipe-back behind the guarded return path', () => {
    expect(photoDetailSource).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(photoDetailSource).toContain('<Stack.Screen options={{ gestureEnabled: false }} />');
    expect(photoDetailSource).toContain('onPress={requestBack}');
  });
});
