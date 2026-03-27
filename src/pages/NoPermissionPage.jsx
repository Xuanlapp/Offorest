export default function NoPermissionPage() {
  return (
    <section className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
      <h1 className="text-2xl font-bold text-red-400">
        Không có quyền truy cập
      </h1>
      <p className="mt-2 text-sm text-white/70">
        Tài khoản của bạn không được phép vào khu vực này.
      </p>
    </section>
  )
}