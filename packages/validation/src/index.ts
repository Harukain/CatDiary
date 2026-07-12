import { z } from 'zod';

export const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的中国大陆手机号');
export const otpSchema = z.string().regex(/^\d{6}$/, '验证码应为 6 位数字');
export const petNameSchema = z
  .string()
  .trim()
  .min(1, '请输入猫咪名字')
  .max(30, '名字不能超过 30 个字符');
export const timezoneSchema = z.string().min(1).default('Asia/Shanghai');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpSchema });

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
