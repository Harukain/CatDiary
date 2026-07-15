import { describe, expect, it } from 'vitest';
import taskDetailSource from '../../../app/tasks/[id].tsx?raw';
import photoDetailSource from '../../../app/photos/[id].tsx?raw';
import medicalRecordDetailSource from '../../../app/medical-records/[id].tsx?raw';
import healthEventLinkRecordSource from '../../../app/health-events/link-record.tsx?raw';

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

  it('keeps medical record detail native swipe-back behind the guarded return path', () => {
    expect(medicalRecordDetailSource).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(medicalRecordDetailSource).toContain(
      '<Stack.Screen options={{ gestureEnabled: false }} />',
    );
    expect(medicalRecordDetailSource).toContain('onPress={requestReturn}');
  });

  it('keeps health event record linking native swipe-back behind the guarded return path', () => {
    expect(healthEventLinkRecordSource).toContain(
      "BackHandler.addEventListener('hardwareBackPress'",
    );
    expect(healthEventLinkRecordSource).toContain(
      '<Stack.Screen options={{ gestureEnabled: false }} />',
    );
    expect(healthEventLinkRecordSource).toContain('onPress={requestClose}');
  });
});
