export class AppError extends Error {
  constructor(status, codigo, mensagem, campos = {}) {
    super(mensagem);
    Object.assign(this, { status, codigo, campos });
  }
}
export function ensure(condition, mensagem, campos = {}, status = 422) {
  if (!condition) throw new AppError(status, status === 409 ? 'CONFLITO' : 'VALIDACAO', mensagem, campos);
}
export function found(row, nome = 'Registro') {
  if (!row) throw new AppError(404, 'NAO_ENCONTRADO', `${nome} não encontrado.`);
  return row;
}
