import { isCalendarDateOnOrBefore } from '@cat-diary/domain';

export function isValidBirthDate(value: string, now = new Date(), timeZone = 'Asia/Shanghai') {
  return isCalendarDateOnOrBefore(value, now, timeZone);
}
