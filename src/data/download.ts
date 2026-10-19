/** The same response, calling `onBytes` with the size of each piece of the body as it arrives. */
export function counting(response: Response, onBytes: (n: number) => void): Response {
  if (!response.body) return response;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        onBytes(chunk.byteLength);
        out.enqueue(chunk);
      },
    }),
  );
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
