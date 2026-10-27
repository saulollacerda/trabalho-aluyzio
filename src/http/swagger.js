// Esta função é serializada pelo Swagger UI e executada no navegador.
export async function swaggerRequestInterceptor(request) {
  request.credentials='same-origin';
  if (!['GET','HEAD','OPTIONS'].includes((request.method || 'GET').toUpperCase()) && !request.url.includes('/auth/login')) {
    const response=await fetch('/api/v1/auth/me',{ credentials:'same-origin' });
    if (response.ok) { request.headers ??= {}; request.headers['X-CSRF-Token']=(await response.json()).csrf_token; }
  }
  return request;
}
