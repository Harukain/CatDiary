export function isValidBirthDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00+08:00`);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today
  );
}
