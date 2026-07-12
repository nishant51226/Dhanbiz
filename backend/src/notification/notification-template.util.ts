/** Replace `{{key}}` placeholders in admin templates. */
export function renderNotificationTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
