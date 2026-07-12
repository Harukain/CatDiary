import Constants from 'expo-constants';

function publicUrl(key: 'privacyPolicyUrl' | 'termsUrl') {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.startsWith('https://') ? value : undefined;
}

export const legalLinks = {
  privacyPolicy: publicUrl('privacyPolicyUrl'),
  terms: publicUrl('termsUrl'),
};
