/** Next may normalize request.url to localhost; the HTTP Host remains the browser's origin. */
export function trustedOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  if (process.env.APP_ORIGIN && origin === process.env.APP_ORIGIN) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === req.headers.get('host') && parsed.protocol === new URL(req.url).protocol;
  } catch {
    return false;
  }
}
