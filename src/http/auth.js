import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { AppError } from '../domain/errors.js';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const passwordHash = password => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
const sessionCookie = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '__Host-rh_session' : 'rh_session';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL), sameSite: 'strict', path: '/' };
const authFail = () => new AppError(401,'NAO_AUTENTICADO','E-mail ou senha inválidos.');
let dummyHash;
export async function login(r, body, reply) {
  const user = await r.one('SELECT * FROM usuario WHERE email=$1', [body.email.toLowerCase()]);
  dummyHash ??= await passwordHash(randomBytes(24).toString('hex'));
  const ok = await verify(user?.senha_hash ?? dummyHash, body.senha);
  if (!user?.ativo || !ok) throw authFail();
  const token = randomBytes(32).toString('hex');
  // CSRF é derivado da sessão e consultável no /auth/me; somente hash vai ao banco.
  const csrfToken = digest('csrf:' + token);
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await r.insert('sessao', { id: randomUUID(), usuario_id: user.id, token_hash: digest(token), csrf_hash: digest(csrfToken), expira_em: expires.toISOString() });
  reply.setCookie(sessionCookie, token, { ...cookieOptions, expires });
  return { usuario: { id: user.id, email: user.email, perfil: user.perfil }, csrf_token: csrfToken, expira_em: expires.toISOString() };
}
export function registerAuthentication(app, db) {
  app.addHook('onRequest', async request => {
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/v1/') || path === '/api/v1/auth/login') return;
    const token = request.cookies[sessionCookie];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401,'NAO_AUTENTICADO','Faça login para acessar a API.');
    const session = await db.run(r => r.one(`SELECT s.id AS sessao_id,s.csrf_hash,u.id,u.email,u.perfil
      FROM sessao s JOIN usuario u ON u.id=s.usuario_id WHERE s.token_hash=$1 AND NOT s.revogada
      AND s.expira_em > now() AND u.ativo`, [digest(token)]));
    if (!session) throw new AppError(401,'NAO_AUTENTICADO','Sessão expirada ou revogada. Faça login.');
    request.user = session;
    request.csrfToken = digest('csrf:' + token);
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const supplied = request.headers['x-csrf-token'];
      const actual = typeof supplied === 'string' ? digest(supplied) : '';
      if (actual.length !== session.csrf_hash.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(session.csrf_hash)))
        throw new AppError(403,'CSRF_INVALIDO','Envie o csrf_token retornado no login no cabeçalho X-CSRF-Token.');
    }
    if (!path.startsWith('/api/v1/auth/') && session.perfil !== 'admin_rh')
      throw new AppError(403,'SEM_PERMISSAO','Este perfil não tem acesso aos dados de RH.');
  });
}
export async function logout(r, user, reply) {
  await r.update('sessao', user.sessao_id, { revogada: true });
  reply.clearCookie(sessionCookie, cookieOptions);
  return { mensagem: 'Sessão encerrada.' };
}
