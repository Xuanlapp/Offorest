import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Pencil, Plus, RefreshCw, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchAdminUsers, upsertAdminUser } from '../services/adminUserService'

const PRODUCT_TYPE_OPTIONS = [
	{ id: 1, label: 'Sticker' },
	{ id: 2, label: 'Ornament' },
	{ id: 3, label: 'Suncatcher' },
]

const ROLE_CODE_OPTIONS = [
	'admin',
	'seller',
	'parttime',
]

const PERMISSION_CODE_OPTIONS = [
	'generate_content',
	'use_gemini',
	'view_reports',
	'manage_users',
]

const emptyForm = {
	user_id: 0,
	username: '',
	email: '',
	password: '',
	full_name: '',
	role_code: 'seller',
	status: 1,
	product_type_ids: [],
	permission_overrides: [],
}

const normalizePermissionOverrides = (items = []) =>
	(Array.isArray(items) ? items : [])
		.map((item) => ({
			code: String(item?.code || '').trim(),
			is_allowed: Boolean(item?.is_allowed),
		}))
		.filter((item) => item.code)

const normalizeUser = (user) => ({
	user_id: Number(user?.user_id || 0),
	username: String(user?.username || ''),
	email: String(user?.email || ''),
	password: '',
	full_name: String(user?.full_name || ''),
	role_code: String(user?.role_code || 'seller'),
	status: Number(user?.status ?? 1),
	product_type_ids: Array.isArray(user?.product_types) ? user.product_types.map(Number) : [],
	permission_overrides: normalizePermissionOverrides(user?.permission_overrides),
})

const productLabelById = Object.fromEntries(PRODUCT_TYPE_OPTIONS.map((item) => [item.id, item.label]))

const normalizeVertexRow = (row = {}) => ({
	id: row?.id ?? null,
	username: row?.username ?? '',
	period: {
		start: row?.period?.start ?? null,
		end: row?.period?.end ?? null,
		remaining_seconds: row?.period?.remaining_seconds ?? null,
	},
	credits: {
		credit_limit_tokens: row?.credits?.credit_limit_tokens ?? null,
		used_tokens: row?.credits?.used_tokens ?? null,
		remaining_tokens: row?.credits?.remaining_tokens ?? null,
		used_percent: row?.credits?.used_percent ?? null,
		remaining_percent: row?.credits?.remaining_percent ?? null,
	},
	usage: {
		total_calls: row?.usage?.total_calls ?? null,
		last_call_at: row?.usage?.last_call_at ?? null,
	},
})

const normalizePercentValue = (value) => {
	if (value === null || value === undefined || value === '') return null

	const numericValue = Number(String(value).replace('%', '').trim())
	return Number.isFinite(numericValue) ? numericValue : null
}

const getVertexUsedPercentTone = (value) => {
	const percent = normalizePercentValue(value)
	if (percent === null) return 'neutral'
	if (percent > 90) return 'danger'
	if (percent > 80 && percent < 90) return 'warning'
	return 'neutral'
}

const getVertexPeriodEndTone = (value) => {
	if (!value) return 'neutral'

	const endDate = new Date(value)
	if (Number.isNaN(endDate.getTime())) return 'neutral'

	const diffMs = endDate.getTime() - Date.now()
	const diffDays = diffMs / (1000 * 60 * 60 * 24)

	if (diffDays <= 7) return 'danger'
	if (diffDays <= 14) return 'warning'
	return 'neutral'
}

const toneClassName = {
	neutral: 'bg-zinc-100 text-zinc-700',
	warning: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
	danger: 'bg-red-100 text-red-700 ring-1 ring-red-200',
}

const formatPercent = (value) => {
	const percent = normalizePercentValue(value)
	if (percent === null) return '-'
	return `${percent}%`
}

const formatDateWithWarning = (value) => {
	if (value === null || value === undefined || value === '') return '-'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return String(value)
	return date.toLocaleString('vi-VN')
}

function UserEditModal({ user, onClose, onSave }) {
	const [form, setForm] = useState(() => normalizeUser(user || emptyForm))
	const [saving, setSaving] = useState(false)
	const [errors, setErrors] = useState({})

	useEffect(() => {
		setForm(normalizeUser(user || emptyForm))
		setErrors({})
	}, [user])

	const clearError = (key) => {
		setErrors((prev) => {
			if (!prev[key]) return prev
			const next = { ...prev }
			delete next[key]
			return next
		})
	}

	const setFieldValue = (key, value) => {
		setForm((prev) => ({ ...prev, [key]: value }))
		clearError(key)
	}

	const validateForm = () => {
		const nextErrors = {}

		if (!String(form.username || '').trim()) nextErrors.username = 'Vui lòng nhập username'
		if (!String(form.full_name || '').trim()) nextErrors.full_name = 'Vui lòng nhập tên hiển thị'
		if (!String(form.role_code || '').trim()) nextErrors.role_code = 'Vui lòng chọn role'
		if (!Number.isFinite(Number(form.status))) nextErrors.status = 'Vui lòng chọn status'
		if (!Array.isArray(form.product_type_ids) || form.product_type_ids.length === 0) {
			nextErrors.product_type_ids = 'Vui lòng chọn ít nhất 1 product type'
		}

		setErrors(nextErrors)
		return nextErrors
	}

	const toggleProductType = (id) => {
		setForm((prev) => {
			const current = new Set(prev.product_type_ids)
			if (current.has(id)) current.delete(id)
			else current.add(id)

			return { ...prev, product_type_ids: Array.from(current).sort((a, b) => a - b) }
		})
	}

	const updatePermission = (index, patch) => {
		setForm((prev) => {
			const next = [...prev.permission_overrides]
			next[index] = { ...next[index], ...patch }
			return { ...prev, permission_overrides: next }
		})
	}

	const addPermissionRow = () => {
		setForm((prev) => ({
			...prev,
			permission_overrides: [...prev.permission_overrides, { code: '', is_allowed: true }],
		}))
	}

	const removePermissionRow = (index) => {
		setForm((prev) => ({
			...prev,
			permission_overrides: prev.permission_overrides.filter((_, rowIndex) => rowIndex !== index),
		}))
	}

	const handleSubmit = async () => {
		const nextErrors = validateForm()
		if (Object.keys(nextErrors).length > 0) {
			return
		}

		const payload = {
			user_id: Number(form.user_id || 0),
			username: String(form.username || '').trim(),
			email: String(form.email || '').trim(),
			password: String(form.password || '').trim(),
			full_name: String(form.full_name || '').trim(),
			role_code: String(form.role_code || 'seller').trim(),
			status: Number(form.status || 0),
			product_type_ids: form.product_type_ids.map(Number),
			permission_overrides: normalizePermissionOverrides(form.permission_overrides),
		}

		if (!payload.username) {
			alert('Vui lòng nhập username')
			return
		}

		const confirmed = window.confirm(
			payload.user_id > 0
				? `Bạn chắc chưa?\nSẽ cập nhật user #${payload.user_id} (${payload.username})`
				: `Bạn chắc chưa?\nSẽ tạo user mới: ${payload.username}`
		)

		if (!confirmed) return

		setSaving(true)
		try {
			await onSave(payload)
			onClose()
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
			<div
				className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
					<div>
						<h3 className="text-xl font-semibold text-zinc-900">
							{form.user_id > 0 ? `Edit User #${form.user_id}` : 'Create User'}
						</h3>
						<p className="mt-1 text-sm text-zinc-500">
							Sửa thông tin, chọn product types, role và overrides rồi lưu.
						</p>
					</div>
					<button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
						Close
					</button>
				</div>

				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<div className="space-y-3">
						{form.user_id > 0 ? (
							<Field label="User ID">
								<input
									value={form.user_id}
									type="number"
									min="0"
									readOnly
									className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none"
								/>
							</Field>
						) : null}
						<Field label="Username" error={errors.username}>
							<input
								value={form.username}
								onChange={(e) => setFieldValue('username', e.target.value)}
								className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${errors.username ? 'border-red-400 bg-red-50' : 'border-zinc-300'}`}
							/>
						</Field>
						<Field label="Email" error={errors.email}>
							<input
								value={form.email}
								onChange={(e) => setFieldValue('email', e.target.value)}
								className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${errors.email ? 'border-red-400 bg-red-50' : 'border-zinc-300'}`}
							/>
						</Field>
						<Field label="Password (optional)" error={errors.password}>
							<input
								value={form.password}
								onChange={(e) => setFieldValue('password', e.target.value)}
								type="password"
								className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${errors.password ? 'border-red-400 bg-red-50' : 'border-zinc-300'}`}
							/>
						</Field>
						<Field label="Full Name" error={errors.full_name}>
							<input
								value={form.full_name}
								onChange={(e) => setFieldValue('full_name', e.target.value)}
								className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${errors.full_name ? 'border-red-400 bg-red-50' : 'border-zinc-300'}`}
							/>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Role Code" error={errors.role_code}>
								<select
									value={form.role_code}
									onChange={(e) => setFieldValue('role_code', e.target.value)}
									className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${errors.role_code ? 'border-red-400 bg-red-50' : 'border-zinc-300'}`}
								>
									{ROLE_CODE_OPTIONS.map((role) => (
										<option key={role} value={role}>
											{role}
										</option>
									))}
								</select>
							</Field>
							<Field label="Status" error={errors.status}>
								<select
									value={form.status}
									onChange={(e) => setFieldValue('status', Number(e.target.value))}
									className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${errors.status ? 'border-red-400 bg-red-50' : 'border-zinc-300'}`}
								>
									<option value={1}>Active</option>
									<option value={0}>Inactive</option>
								</select>
							</Field>
						</div>
					</div>

					<div className="space-y-4">
						<div className="rounded-2xl border border-zinc-200 p-4">
							<div className="mb-3 flex items-center justify-between">
								<p className="text-sm font-semibold text-zinc-800">Product Types</p>
								<span className="text-xs text-zinc-500">product_type_ids</span>
							</div>
							<div className={`grid gap-2 sm:grid-cols-2 ${errors.product_type_ids ? 'rounded-xl border border-red-400 bg-red-50 p-2' : ''}`}>
								{PRODUCT_TYPE_OPTIONS.map((product) => (
									<label key={product.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm">
										<input
											type="checkbox"
											checked={form.product_type_ids.includes(product.id)}
											onChange={() => {
											toggleProductType(product.id)
											clearError('product_type_ids')
										}}
										/>
										<span>{product.id} - {product.label}</span>
									</label>
								))}
							</div>
							{errors.product_type_ids ? <p className="mt-2 text-xs font-medium text-red-600">{errors.product_type_ids}</p> : null}
						</div>

						<div className="rounded-2xl border border-zinc-200 p-4">
							<div className="mb-3 flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-zinc-800">Permission Overrides</p>
									<p className="text-xs text-zinc-500">permission_overrides</p>
								</div>
								<button
									type="button"
									onClick={addPermissionRow}
									className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-600"
								>
									<Plus className="h-3.5 w-3.5" />
									Add
								</button>
							</div>

							<div className="space-y-2">
								{form.permission_overrides.length ? (
									form.permission_overrides.map((row, index) => (
										<div key={`${row.code}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-xl border border-zinc-200 p-2">
											<input
												list="permission-code-options"
												value={row.code}
												onChange={(e) => updatePermission(index, { code: e.target.value })}
												placeholder="code"
												className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none"
											/>
											<label className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm">
												<input
													type="checkbox"
													checked={Boolean(row.is_allowed)}
													onChange={(e) => updatePermission(index, { is_allowed: e.target.checked })}
												/>
												allowed
											</label>
											<button
												type="button"
												onClick={() => removePermissionRow(index)}
												className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600"
											>
												Remove
											</button>
										</div>
									))
								) : (
									<p className="text-sm text-zinc-500">Chưa có override nào.</p>
								)}
							</div>
							<datalist id="permission-code-options">
								{PERMISSION_CODE_OPTIONS.map((code) => (
									<option key={code} value={code} />
								))}
							</datalist>
						</div>
					</div>
				</div>

				<div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
					<button type="button" onClick={onClose} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700">
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={saving}
						className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
					>
						{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
						Save
					</button>
				</div>
			</div>
		</div>
	)
}

function Field({ label, children, error }) {
	return (
		<label className="block">
			<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
			{children}
			{error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : null}
		</label>
	)
}

export default function AdminPage() {
	const { user } = useAuth()
	const [users, setUsers] = useState([])
	const [vertexRows, setVertexRows] = useState([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [searchText, setSearchText] = useState('')
	const [editingUser, setEditingUser] = useState(null)
	const displayName = user?.name || user?.full_name || user?.username || 'Admin'

	const loadUsers = async () => {
		setLoading(true)
		setError('')
		try {
			const response = await fetchAdminUsers()
			setUsers(Array.isArray(response?.users) ? response.users : [])
			setVertexRows(
				Array.isArray(response?.vertex)
					? response.vertex.map(normalizeVertexRow)
					: Array.isArray(response?.data?.vertex)
						? response.data.vertex.map(normalizeVertexRow)
						: []
			)
		} catch (err) {
			setError(err?.message || 'Không thể tải users')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		loadUsers()
	}, [])

	const filteredUsers = useMemo(() => {
		const needle = searchText.trim().toLowerCase()
		if (!needle) return users

		return users.filter((user) => {
			const combined = [
				user.user_id,
				user.username,
				user.email,
				user.full_name,
				user.role_code,
				(Array.isArray(user.product_types) ? user.product_types : []).join(','),
			]
				.join(' ')
				.toLowerCase()

			return combined.includes(needle)
		})
	}, [users, searchText])

	const handleSaveUser = async (payload) => {
		const result = await upsertAdminUser(payload)
		const nextUser = result?.user || result?.data?.user || payload

		setUsers((prev) => {
			const existsIndex = prev.findIndex((item) => Number(item.user_id) === Number(nextUser.user_id))
			if (existsIndex >= 0) {
				const next = [...prev]
				next[existsIndex] = { ...next[existsIndex], ...nextUser }
				return next
			}
			return [nextUser, ...prev]
		})
			setVertexRows((prev) => prev)

		alert(result?.message || 'Đã lưu user thành công')
	}

	return (
		<section className="rounded-3xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-6 text-zinc-800 shadow-sm">
			{editingUser ? (
				<UserEditModal
					user={editingUser}
					onClose={() => setEditingUser(null)}
					onSave={handleSaveUser}
				/>
			) : null}

			<div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
				<div>
					<p className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
						<UserRound className="h-3.5 w-3.5" />
						{displayName}
					</p>
					<h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">User Management</h1>
				
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setEditingUser(emptyForm)}
						className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
					>
						<Plus className="h-4 w-4" />
						Create User
					</button>
					<button
						type="button"
						onClick={loadUsers}
						className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
					>
						<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
						Reload
					</button>
				</div>
			</div>

			<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
					<span className="text-sm text-zinc-500">Search</span>
					<input
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						placeholder="username, email, role..."
						className="w-72 bg-transparent text-sm outline-none"
					/>
				</div>
				<div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600">
					Tổng: <span className="font-semibold text-zinc-900">{filteredUsers.length}</span> users
				</div>
			</div>

			{error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
	    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<InfoCard title="Product Types" items={PRODUCT_TYPE_OPTIONS.map((item) => `${item.id} - ${item.label}`)} />
				<InfoCard title="Role Codes" items={ROLE_CODE_OPTIONS} />
				<InfoCard title="Permission Codes" items={PERMISSION_CODE_OPTIONS} />
			</div>
			<div className="mt-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
						<thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
							<tr>
								<th className="px-4 py-3">ID</th>
								<th className="px-4 py-3">User</th>
								<th className="px-4 py-3">Role</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Products</th>
								<th className="px-4 py-3">Email</th>
								<th className="px-4 py-3 text-right">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-zinc-100">
							{loading ? (
								<tr>
									<td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
										<LoaderCircle className="mx-auto h-5 w-5 animate-spin" />
										<p className="mt-2">Đang tải users...</p>
									</td>
								</tr>
							) : filteredUsers.length ? (
								filteredUsers.map((user) => {
									const productIds = Array.isArray(user.product_types) ? user.product_types.map(Number) : []
									const productLabels = productIds.map((id) => productLabelById[id] || id).join(', ')

									return (
										<tr key={user.user_id} className="hover:bg-zinc-50">
											<td className="px-4 py-3 font-mono text-xs text-zinc-600">{user.user_id}</td>
											<td className="px-4 py-3">
												<div className="font-semibold text-zinc-900">{user.username || '-'}</div>
												<div className="text-xs text-zinc-500">{user.full_name || 'Chưa có tên hiển thị'}</div>
											</td>
											<td className="px-4 py-3">
												<span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
													{user.role_code || '-'}
												</span>
											</td>
											<td className="px-4 py-3">
												<span className={`rounded-full px-3 py-1 text-xs font-semibold ${Number(user.status) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
													{Number(user.status) === 1 ? 'Active' : 'Inactive'}
												</span>
											</td>
											<td className="px-4 py-3 text-xs text-zinc-600">
												{productLabels || '-'}
											</td>
											<td className="px-4 py-3 text-xs text-zinc-600">{user.email || '-'}</td>
											<td className="px-4 py-3 text-right">
												<button
													type="button"
													onClick={() => setEditingUser(user)}
													className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700"
												>
													<Pencil className="h-4 w-4" />
													Edit
												</button>
											</td>
										</tr>
									)
								})
							) : (
								<tr>
									<td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
										Không có user nào.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			<div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
				<div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
					<div>
						<p className="text-sm font-semibold text-zinc-900">Vertex API Keys</p>
					</div>
					<span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
						{vertexRows.length} rows
					</span>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
						<thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
							<tr>
								<th className="px-4 py-3">ID</th>
								<th className="px-4 py-3">Username</th>
								<th className="px-4 py-3">Period Start</th>
								<th className="px-4 py-3">Period End</th>
								<th className="px-4 py-3">Remaining Seconds</th>
								<th className="px-4 py-3">Credit Limit</th>
								<th className="px-4 py-3">Used Tokens</th>
								<th className="px-4 py-3">Remaining Tokens</th>
								<th className="px-4 py-3">Used %</th>
								<th className="px-4 py-3">Remaining %</th>
								<th className="px-4 py-3">Total Calls</th>
								<th className="px-4 py-3">Last Call At</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-zinc-100">
							{loading ? (
								<tr>
									<td colSpan={12} className="px-4 py-8 text-center text-zinc-500">
										<LoaderCircle className="mx-auto h-5 w-5 animate-spin" />
										<p className="mt-2">Đang tải Vertex API Keys...</p>
									</td>
								</tr>
							) : vertexRows.length ? (
								vertexRows.map((vertex, index) => (
									<tr key={`${vertex.id ?? 'vertex'}-${index}`} className="hover:bg-zinc-50">
										<td className="px-4 py-3 font-mono text-xs text-zinc-600">{vertex.id ?? '-'}</td>
										<td className="px-4 py-3 font-medium text-zinc-900">{vertex.username || '-'}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.period.start)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">
											<span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClassName[getVertexPeriodEndTone(vertex.period.end)]}`}>
												{formatDateWithWarning(vertex.period.end)}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.period.remaining_seconds)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.credits.credit_limit_tokens)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.credits.used_tokens)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.credits.remaining_tokens)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">
											<span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClassName[getVertexUsedPercentTone(vertex.credits.used_percent)]}`}>
												{formatPercent(vertex.credits.used_percent)}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.credits.remaining_percent)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.usage.total_calls)}</td>
										<td className="px-4 py-3 text-xs text-zinc-600">{renderNullable(vertex.usage.last_call_at)}</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={12} className="px-4 py-8 text-center text-zinc-500">
										Không có dữ liệu vertex.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

		
		</section>
	)
}

function renderNullable(value) {
	if (value === null || value === undefined || value === '') {
		return '-'
	}

	return String(value)
}

function InfoCard({ title, items }) {
	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-4">
			<p className="text-sm font-semibold text-zinc-900">{title}</p>
			<div className="mt-3 flex flex-wrap gap-2">
				{items.map((item) => (
					<span key={item} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
						{item}
					</span>
				))}
			</div>
		</div>
	)
}
