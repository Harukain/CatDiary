import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, radii, shadows, spacing, typography } from '@cat-diary/design-tokens';

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>{children}</View>
    </SafeAreaView>
  );
}

export function BrandHeader({
  title = '猫伴日记',
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.mark}>
        <View style={styles.earLeft} />
        <View style={styles.earRight} />
        <View style={styles.face} />
      </View>
      <Text style={styles.h1}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}
export function ErrorText({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={styles.textButton}
    >
      <Text style={[styles.textButtonLabel, danger && styles.dangerText, disabled && styles.muted]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({ children, end }: PropsWithChildren<{ end?: ReactNode }>) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>{children}</View>
      {end}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  screen: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.xxl,
  },
  header: { alignItems: 'center', gap: spacing.sm },
  mark: { width: 64, height: 64, position: 'relative', marginBottom: spacing.sm },
  earLeft: {
    position: 'absolute',
    left: 8,
    top: 4,
    width: 24,
    height: 24,
    backgroundColor: colors.brandSoft,
    transform: [{ rotate: '45deg' }],
    borderRadius: 8,
  },
  earRight: {
    position: 'absolute',
    right: 8,
    top: 4,
    width: 24,
    height: 24,
    backgroundColor: colors.brandSoft,
    transform: [{ rotate: '45deg' }],
    borderRadius: 8,
  },
  face: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 15,
    bottom: 6,
    backgroundColor: colors.brand,
    borderRadius: 24,
  },
  h1: { ...typography.h1, color: colors.ink },
  h2: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  field: { gap: spacing.sm, marginTop: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: {
    height: 48,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.dangerDark },
  button: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { backgroundColor: colors.brandPressed, transform: [{ scale: 0.97 }] },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { fontSize: 13, fontWeight: '600', color: colors.warningDark },
  dangerText: { color: colors.dangerDark },
  muted: { color: colors.textTertiary },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowBody: { flex: 1, gap: spacing.xs },
});
