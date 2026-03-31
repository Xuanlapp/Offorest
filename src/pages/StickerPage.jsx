import { useEffect, useMemo, useState } from 'react'
import { getSheetUrlForPage } from '../services/sheetConfigService'
import { updateRecordInSheet } from '../services/googleDriveService'
import { removeBackgroundSmart, REMOVAL_MODES } from '../services/backgroundRemovalService'
import { analyzeStickerImage } from '../services/geminiService'
import { PROMPTS } from '../prompt/Prompts'
import ImagePreviewEditorModal from '../components/ImagePreviewEditorModal'

export default function StickerPage() {
	const [isLoading, setIsLoading] = useState(false)
	const [progress, setProgress] = useState(0)
	const [error, setError] = useState('')
	const [data, setData] = useState([])
	const [pageSize, setPageSize] = useState(10)
	const [currentPage, setCurrentPage] = useState(1)
	const [masterResults, setMasterResults] = useState({})
	const [uploadStatus, setUploadStatus] = useState({})
	const [editorState, setEditorState] = useState(null)

	const totalPages = Math.max(1, Math.ceil(data.length / pageSize))

	useEffect(() => {
		const handleGetDataEvent = () => {
			handleGetData()
		}

		window.addEventListener('stickerGetData', handleGetDataEvent)
		return () => window.removeEventListener('stickerGetData', handleGetDataEvent)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const paginatedData = useMemo(
		() => data.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[data, currentPage, pageSize]
	)

	const normalizeHeader = (text) =>
		String(text || '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/\s+/g, '')

	const getValueByAliases = (row, aliases = []) => {
		const keys = Object.keys(row)
		const aliasSet = new Set(aliases.map(normalizeHeader))
		const foundKey = keys.find((key) => aliasSet.has(normalizeHeader(key)))
		return foundKey ? String(row[foundKey] || '').trim() : ''
	}

	const parseCSVLine = (line) => {
		const values = []
		let current = ''
		let inQuotes = false

		for (let index = 0; index < line.length; index += 1) {
			const character = line[index]

			if (character === '"') {
				if (inQuotes && line[index + 1] === '"') {
					current += '"'
					index += 1
				} else {
					inQuotes = !inQuotes
				}
			} else if (character === ',' && !inQuotes) {
				values.push(current.trim())
				current = ''
			} else {
				current += character
			}
		}

		values.push(current.trim())
		return values
	}

	const parseCSV = (csvText) => {
		const lines = csvText
			.split('\n')
			.map((line) => line.replace(/\r$/, ''))
			.filter((line) => line.trim())

		if (lines.length < 2) return []

		const headers = parseCSVLine(lines[0])

		return lines.slice(1).map((line) => {
			const values = parseCSVLine(line)
			const row = {}

			headers.forEach((header, index) => {
				row[header] = values[index] || ''
			})

			return row
		})
	}

	const extractSheetInfo = (url) => {
		const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
		const gidMatch = url.match(/[?#&]gid=(\d+)/)

		return {
			id: idMatch ? idMatch[1] : null,
			gid: gidMatch ? gidMatch[1] : '0',
		}
	}

	const isValidImageUrl = (url) =>
		/^data:image\//i.test(url) || /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)

	const dataUrlToFile = async (dataUrl, fileName, fallbackMimeType = 'image/png') => {
		const response = await fetch(dataUrl)
		const blob = await response.blob()
		return new File([blob], fileName, { type: blob.type || fallbackMimeType })
	}

	const handleGetData = async () => {
		let interval

		try {
			let sheetUrl = localStorage.getItem('stickerSheetUrl')

			if (!sheetUrl) {
				sheetUrl = await getSheetUrlForPage('sticker')
			}

			const { id: sheetId, gid } = extractSheetInfo(sheetUrl)

			if (!sheetId) {
				setError('Link sheet từ config không hợp lệ')
				return
			}

			setIsLoading(true)
			setProgress(0)
			setError('')
			setData([])
			setCurrentPage(1)
			setMasterResults({})
			setUploadStatus({})

			interval = setInterval(() => {
				setProgress((prev) => Math.min(prev + 10, 90))
			}, 180)

			const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
			const response = await fetch(csvUrl)

			if (!response.ok) {
				throw new Error('Không thể truy cập sheet. Đảm bảo sheet được chia sẻ công khai.')
			}

			const csvData = await response.text()
			const rows = parseCSV(csvData)

			const normalizedRows = rows.map((row) => ({
				stt: getValueByAliases(row, ['STT']),
				keyword: getValueByAliases(row, ['KEYWORD']),
				imageLink: getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH']),
				redesign: getValueByAliases(row, ['REDESIGN', 'Redesign']),
				status: getValueByAliases(row, ['Status', 'TRẠNG THÁI', 'TRANG THAI']),
			}))

			clearInterval(interval)
			setProgress(100)
			setData(normalizedRows)
		} catch (err) {
			if (interval) clearInterval(interval)
			setError(err.message || 'Không thể lấy dữ liệu từ sheet')
		} finally {
			setIsLoading(false)
			setProgress(0)
		}
	}

	const handleUploadSingle = async (globalIndex, row) => {
		const result = masterResults[globalIndex]
		if (!result?.base64) {
			alert('Chưa có ảnh master để update vào sheet')
			return
		}

		setUploadStatus((prev) => ({
			...prev,
			[globalIndex]: 'uploading',
		}))

		try {
			let sheetUrl = localStorage.getItem('stickerSheetUrl')

			if (!sheetUrl) {
				sheetUrl = await getSheetUrlForPage('sticker')
			}

			const { id: sheetId, gid } = extractSheetInfo(sheetUrl)
			if (!sheetId) {
				throw new Error('Sheet URL không hợp lệ')
			}

			const stt = row?.stt ?? globalIndex + 1
			const outputDataUrl = `data:${result.mimeType || 'image/png'};base64,${result.base64}`
			const masterFile = await dataUrlToFile(
				outputDataUrl,
				`sticker-master-${stt}.png`,
				result.mimeType || 'image/png'
			)

			await updateRecordInSheet(sheetId, stt, gid, [masterFile], 'sticker')

			setUploadStatus((prev) => ({
				...prev,
				[globalIndex]: 'done',
			}))
		} catch (err) {
			setUploadStatus((prev) => ({
				...prev,
				[globalIndex]: 'error',
			}))
			alert(`Update sheet lỗi: ${err.message || 'Không thể update ảnh vào sheet'}`)
		}
	}

	const handleCreateMaster = async (globalIndex, row) => {
		if (!row.imageLink) {
			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: { loading: false, base64: null, mimeType: null, error: 'Không có LINK ẢNH' },
			}))
			return
		}

		setMasterResults((prev) => ({
			...prev,
			[globalIndex]: { loading: true, base64: null, mimeType: null, error: null },
		}))

		try {
			const created = await analyzeStickerImage({
				imageUrl: row.imageLink,
				prompt: `${PROMPTS.sticker}`,
			})

			const transparentDataUrl = await removeBackgroundSmart(
				created.base64,
				created.mimeType || 'image/png',
				REMOVAL_MODES.PIXEL_THRESHOLD
			)
			const transparentBase64 = String(transparentDataUrl).split(',')[1] || ''
			const transparentMimeMatch = String(transparentDataUrl).match(/^data:(.*?);base64,/i)
			const transparentMimeType = transparentMimeMatch?.[1] || 'image/png'

			if (!transparentBase64) {
				throw new Error('Không thể tách nền cho ảnh sticker master')
			}

			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: {
					loading: false,
					base64: transparentBase64,
					mimeType: transparentMimeType,
					error: null,
				},
			}))
		} catch (err) {
			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: {
					loading: false,
					base64: null,
					mimeType: null,
					error: err.message || 'Không tạo được Sticker Master',
				},
			}))
		}
	}

	const startItemIndex = data.length ? (currentPage - 1) * pageSize + 1 : 0
	const endItemIndex = Math.min(currentPage * pageSize, data.length)

	return (
		<section className="rounded-2xl border border-zinc-200 bg-zinc-100/95 p-6 text-zinc-800">
			{editorState ? (
				<ImagePreviewEditorModal
					asset={{
						src: editorState.src,
						title: editorState.title,
						description: editorState.description,
					}}
					onClose={() => setEditorState(null)}
					onApply={() => setEditorState(null)}
				/>
			) : null}
			{isLoading && (
				<div className="mt-3">
					<div className="h-2 w-full rounded-full bg-zinc-200">
						<div
							className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>
			)}

			{error && <p className="mt-3 text-sm text-red-600">{error}</p>}

			<div className="mt-8 flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
					Sticker Workspace ({data.length} Items)
				</h2>
			</div>

			{data.length === 0 ? (
				<div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
					Chưa có dữ liệu. Hãy nhập link sheet và bấm Get Dữ Liệu.
				</div>
			) : (
				<>
					<div className="mt-4 space-y-5">
						{paginatedData.map((row, idx) => {
							const globalIndex = (currentPage - 1) * pageSize + idx
							const hasImage = isValidImageUrl(row.imageLink)
							const result = masterResults[globalIndex]
							const currentUploadStatus = uploadStatus[globalIndex]
							const outputDataUrl = result?.base64 ? `data:${result.mimeType || 'image/png'};base64,${result.base64}` : ''

							return (
								<article
									key={`${row.keyword}-${globalIndex}`}
									className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm"
								>
									<div className="mb-4 flex items-center justify-between gap-3">
										<div className="flex items-center gap-3">
											<div className="rounded-lg bg-indigo-100 px-3 py-2 text-center font-mono text-sm font-semibold text-indigo-700">
												STT: {row.stt || globalIndex + 1}
											</div>
											<div className="text-xl font-semibold text-zinc-900">
												{row.keyword || `Sticker ${globalIndex + 1}`}
											</div>
										</div>
									</div>

									<div className="grid gap-5 xl:grid-cols-2">
										{/* SOURCE IMAGE */}
										<div>
											<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
												1. SOURCE IMAGE
											</div>
											<div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 cursor-zoom-in">
												{hasImage ? (
													<img
														src={row.imageLink}
														alt={row.keyword || 'source'}
														className="h-96 w-96 rounded-xl object-cover"
														loading="lazy"
														onClick={() =>
															setEditorState({
																src: row.imageLink,
																title: row.keyword || `Source ${globalIndex + 1}`,
																description: 'Click để xem ảnh gốc đầy đủ',
															})
														}
													/>
												) : (
													<span className="text-sm text-zinc-400">No image</span>
												)}
											</div>
											{row.imageLink && (
												<p className="mt-2 text-xs text-zinc-600 break-all">
													<a href={row.imageLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
														{row.imageLink}
													</a>
												</p>
											)}
										</div>

										{/* CREATE MASTER */}
										<div>
											<div className="mb-2 flex items-center justify-between gap-2">
												<span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
													2. CREATE MASTER
												</span>
												<button
													onClick={() => handleCreateMaster(globalIndex, row)}
													disabled={result?.loading || !hasImage}
													className="text-xs font-medium text-indigo-500 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
												>
													{result?.loading ? '⏳ Creating...' : '✨ Create Master'}
												</button>
											</div>
											<div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden cursor-zoom-in">
												{result?.loading ? (
													<div className="flex flex-col items-center gap-2 text-zinc-400">
														<div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
														<span className="text-xs">Đang tạo sticker master...</span>
													</div>
												) : result?.base64 ? (
													<img
														src={outputDataUrl}
														alt={`master-${row.keyword}`}
														className="h-96 w-96 rounded-xl object-cover"
														onClick={() =>
															setEditorState({
																src: outputDataUrl,
																title: `Master - ${row.keyword || globalIndex + 1}`,
																description: 'Click để xem ảnh master đầy đủ',
															})
														}
													/>
												) : result?.error ? (
													<div className="flex flex-col items-center gap-2 text-red-500">
														<span className="text-2xl">⚠️</span>
														<span className="text-xs text-center max-w-40">{result.error}</span>
													</div>
												) : (
													<span className="text-sm text-zinc-400">Waiting for creation...</span>
												)}
											</div>

											{outputDataUrl && (
												<div className="mt-3 flex gap-2 flex-wrap">
													<a
														href={outputDataUrl}
														download={`sticker-master-${row.stt || globalIndex + 1}.png`}
														className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition"
													>
														⬇️ Download PNG
													</a>
													<button
														type="button"
														onClick={() => handleUploadSingle(globalIndex, row)}
														disabled={currentUploadStatus === 'uploading'}
														className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 transition"
													>
														{currentUploadStatus === 'uploading' ? '⏳ Updating Sheet...' : '📤 Update Sheet'}
													</button>
													{currentUploadStatus === 'done' ? (
														<span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
															Đã update sheet
														</span>
													) : null}
													{currentUploadStatus === 'error' ? (
														<span className="inline-flex items-center rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600">
															Update lỗi
														</span>
													) : null}
												</div>
											)}
										</div>
									</div>
								</article>
							)
						})}
					</div>

					<div className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-600">
						<span>
							Showing {startItemIndex}-{endItemIndex} of {data.length}
						</span>
					</div>

					<div className="mt-4 flex items-center justify-center gap-2">
						<button
							type="button"
							disabled={currentPage <= 1}
							onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40"
						>
							← Previous
						</button>
						<span className="text-sm font-medium text-zinc-700">
							Page {currentPage} of {totalPages}
						</span>
						<button
							type="button"
							disabled={currentPage >= totalPages}
							onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40"
						>
							Next →
						</button>

						<select
							value={pageSize}
							onChange={(e) => {
								setPageSize(Number(e.target.value))
								setCurrentPage(1)
							}}
							className="ml-4 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
						>
							<option value={5}>5 per page</option>
							<option value={10}>10 per page</option>
							<option value={20}>20 per page</option>
							<option value={50}>50 per page</option>
						</select>
					</div>
				</>
			)}
		</section>
	)
}
