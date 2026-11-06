export const helpdeskAssigneeEmail = 'helpdesk@kmbcloud.at';

export function assigneeEmailOrDefault(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (text.length < 3 || text.length > 200) return helpdeskAssigneeEmail;
  if (!text.includes('@') || /\s/u.test(text)) return helpdeskAssigneeEmail;
  return text;
}
