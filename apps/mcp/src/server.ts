export type ReviewMailInput = {
  fromEmail: string;
  subject: string;
  body: string;
};

export function listToolNames(): readonly string[] {
  return ['review_mail'];
}

export function reviewMailTool(): {
  name: 'review_mail';
  description: string;
} {
  return {
    name: 'review_mail',
    description:
      'Hand a mail to the configured model. The server owns the prompt, the internal domains and the helpdesk exclusion. The answer reports is_support and does not create a ticket.',
  };
}

export async function callReviewMail(
  input: ReviewMailInput,
  options: { origin: string; fetchImpl?: typeof fetch },
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.origin.replace(/\/$/u, '')}/api/v1/mail/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fromEmail: input.fromEmail,
      subject: input.subject,
      body: input.body,
    }),
  });
  return response.json();
}
