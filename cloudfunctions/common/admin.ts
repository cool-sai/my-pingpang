/**
 * 超级管理员。common 不会随云函数上传，引用本常量的函数请内联同一份值，
 * 并在服务端校验，不要只在前端判断。
 */
export const SUPER_ADMIN_OPENID = 'oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g'

export function isSuperAdmin(openid: string) {
  return String(openid || '') === SUPER_ADMIN_OPENID
}
