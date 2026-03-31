// src/services/googleDriveService.js

const API_BASE_URL = 'https://nhxlap.id.vn/wp-json/offorest-api/v1';
const API_TEST_URL = 'http://offorest-wp.lap/wp-json/offorest-api/v1';
const PAGE_STORAGE_KEYS = {
	combosticker: 'comboStickerSheetData',
	holoarcylic: 'holoarcylicSheetUrl',
	suncatcher: 'suncatcherSheetUrl',
	sticker: 'stickerSheetUrl',
};

const LEGACY_PAGE_STORAGE_KEYS = {
	suncatcher: 'ornamentSheetUrl',
};

const extractSheetFromUrl = (url) => {
	if (!url) return { sheetId: null, gid: null };
	const idMatch = String(url).match(/\/d\/([a-zA-Z0-9-_]+)/);
	const gidMatch = String(url).match(/[?#&]gid=(\d+)/);
	return {
		sheetId: idMatch ? idMatch[1] : null,
		gid: gidMatch ? gidMatch[1] : null,
	};
};

const getConfiguredSheetByPage = (pageKey) => {
	if (!pageKey) return { sheetId: null, gid: null, source: null };
	const normalizedPage = String(pageKey).toLowerCase();

	if (normalizedPage === 'combosticker') {
		const raw = localStorage.getItem(PAGE_STORAGE_KEYS.combosticker);
		if (!raw) return { sheetId: null, gid: null, source: PAGE_STORAGE_KEYS.combosticker };
		try {
			const parsed = JSON.parse(raw);
			return {
				sheetId: parsed?.sheetId || null,
				gid: parsed?.gid != null ? String(parsed.gid) : null,
				source: PAGE_STORAGE_KEYS.combosticker,
			};
		} catch (error) {
			return { sheetId: null, gid: null, source: PAGE_STORAGE_KEYS.combosticker };
		}
	}

	const storageKey = PAGE_STORAGE_KEYS[normalizedPage];
	if (!storageKey) return { sheetId: null, gid: null, source: null };

	const url = localStorage.getItem(storageKey) || localStorage.getItem(LEGACY_PAGE_STORAGE_KEYS[normalizedPage] || '');
	const extracted = extractSheetFromUrl(url);
	return { ...extracted, source: storageKey };
};

const validateSheetContext = ({ pageKey = null, sheetId, gid = null }) => {
	if (!pageKey) return;

	const configured = getConfiguredSheetByPage(pageKey);
	if (!configured.sheetId) {
		throw new Error(`Chưa cấu hình Sheet cho page ${pageKey}. Vui lòng nhập lại trên Navbar.`);
	}

	if (String(configured.sheetId) !== String(sheetId)) {
		throw new Error(
			`sheetId không khớp page ${pageKey}. Đang gửi ${sheetId}, nhưng cấu hình hiện tại là ${configured.sheetId}.`
		);
	}

	if (gid != null && configured.gid != null && String(configured.gid) !== String(gid)) {
		throw new Error(
			`gid không khớp page ${pageKey}. Đang gửi ${gid}, nhưng cấu hình hiện tại là ${configured.gid}.`
		);
	}
};

async function getWordPressAuthHeaders() {
	const headers = {};

	const userStr = localStorage.getItem('user');
	if (userStr) {
		try {
			const user = JSON.parse(userStr);
			if (user.token) {
				headers['Authorization'] = `Bearer ${user.token}`;
				return headers;
			}
		} catch (error) {
		}
	}

	try {
		const nonceResp = await fetch(`${API_BASE_URL}/nonce`, {
			method: 'GET',
			credentials: 'include',
		});

		if (nonceResp.ok) {
			const nonceData = await nonceResp.json();
			if (nonceData.nonce) {
				headers['X-WP-Nonce'] = nonceData.nonce;
				return headers;
			}
		}
	} catch (error) {
	}

	return headers;
}

export async function uploadFilesToBackend(files, keyword, sheetId, accessToken, gid = null,  pageKey = null) {
	if (!Array.isArray(files) || files.length === 0) {
		throw new Error('Không có file để upload');
	}

	if (!sheetId) {
		throw new Error('Thiếu sheetId');
	}

	if (!accessToken) {
		throw new Error('Thiếu Google accessToken');
	}

	validateSheetContext({ pageKey, sheetId, gid });

	const formData = new FormData();
	formData.append('keyword', keyword || '');
	formData.append('sheetId', sheetId);
	formData.append('accessToken', accessToken);

	if (gid !== null && gid !== undefined) {
		formData.append('gid', String(gid));
	}

	files.forEach((file, index) => {
		if (index === 0) {
			formData.append('file', file);
		}
		formData.append(`file_${index}`, file);
	});

	const authHeaders = await getWordPressAuthHeaders();
	const requestUrl = `${API_BASE_URL}/google/upload`;

	console.log('📤 [googleDriveService] Upload payload summary:', {
		requestUrl,
		pageKey,
		keyword: keyword || '',
		sheetId,
		gid,
		fileCount: files.length,
		files: files.map((file, index) => ({
			index,
			name: file?.name,
			size: file?.size,
			type: file?.type,
		})),
	});

	const response = await fetch(requestUrl, {
		method: 'POST',
		headers: {
			...authHeaders,
		},
		body: formData,
	});

	const responseText = await response.text();
	let responseData;
	try {
		responseData = JSON.parse(responseText);
	} catch (parseError) {
		responseData = { raw: responseText };
	}

	if (!response.ok) {
		console.error('❌ [googleDriveService] Upload failed response:', responseData);
		throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${responseText}`);
	}

	return responseData;
}

export async function updateDesignPageImages({
	sheetId,
	gid = null,
	accessToken,
	stt = null,
	redesignImageFile,
	lifestyleImageFiles = null,
	lifestyleImageFile = null,
	pageKey = null,
}) {
	if (!sheetId) {
		throw new Error('Thiếu sheetId');
	}

	if (!accessToken) {
		throw new Error('Thiếu Google accessToken');
	}

	if (!redesignImageFile) {
		throw new Error('Thiếu ảnh redesign để update');
	}

	const normalizedLifestyleFiles = Array.isArray(lifestyleImageFiles)
		? lifestyleImageFiles.filter(Boolean)
		: lifestyleImageFile
			? [lifestyleImageFile]
			: [];

	if (!normalizedLifestyleFiles.length) {
		throw new Error('Thiếu ảnh lifestyle để update');
	}

	validateSheetContext({ pageKey, sheetId, gid });

	const formData = new FormData();
	formData.append('sheetId', sheetId);
	formData.append('accessToken', accessToken);
	if (gid !== null && gid !== undefined) formData.append('gid', String(gid));
	if (stt !== null && stt !== undefined) formData.append('stt', String(stt));

	formData.append('files[]', redesignImageFile);
	normalizedLifestyleFiles.forEach((file) => {
		formData.append('files[]', file);
	});

	const authHeaders = await getWordPressAuthHeaders();
	const requestUrl = `${API_BASE_URL}/google/update`;

	console.log('📤 [googleDriveService] Design update payload summary:', {
		requestUrl,
		pageKey,
		sheetId,
		gid,
		stt,
		fileFieldKey: 'files[]',
		fileCount: 1 + normalizedLifestyleFiles.length,
		filesOrder: ['redesign', ...normalizedLifestyleFiles.map((_, index) => `lifestyle_${index + 1}`)],
		files: {
			redesign: { name: redesignImageFile.name, size: redesignImageFile.size, type: redesignImageFile.type },
			lifestyle: normalizedLifestyleFiles.map((file, index) => ({
				index,
				name: file.name,
				size: file.size,
				type: file.type,
			})),
		},
	});

	const resp = await fetch(requestUrl, {
		method: 'POST',
		headers: {
			...authHeaders,
		},
		body: formData,
	});

	const responseText = await resp.text();
	let responseData;
	try {
		responseData = JSON.parse(responseText);
	} catch (parseError) {
		responseData = { raw: responseText };
	}

	if (!resp.ok) {
		console.error('❌ [googleDriveService] Design update failed response:', responseData);
		throw new Error(`Update failed: ${resp.status} ${resp.statusText} - ${responseText}`);
	}

	return responseData;
}

export async function testBackendConnection() {
	try {
		const authHeaders = await getWordPressAuthHeaders();
		const testUrl = `${API_BASE_URL}/`;
		const resp = await fetch(testUrl, {
			method: 'GET',
			headers: authHeaders,
			credentials: 'include',
		});

		return resp.ok;
	} catch (error) {
		return false;
	}
}

export async function updateRecordInSheet(sheetId, stt, gid = null, files = [], pageKey = null) {
	const accessToken = localStorage.getItem('googleDriveAccessToken');
	if (!accessToken) {
		throw new Error('Google access token not configured. Vui lòng nhập token Google Drive ở Navbar.');
	}

	const hasFiles = Array.isArray(files) && files.length > 0;
	const updateUrl = `${API_BASE_URL}/google/update`;
	let resp;
	const authHeaders = await getWordPressAuthHeaders();

	validateSheetContext({ pageKey, sheetId, gid });

	if (hasFiles) {
		const formData = new FormData();
		files.forEach((file, index) => {
			if (index === 0) formData.append('file', file);
			formData.append(`file_${index}`, file);
			formData.append('files[]', file);
		});
		formData.append('sheetId', sheetId);
		formData.append('accessToken', accessToken);
		if (gid !== null && gid !== undefined) formData.append('gid', gid);
		if (stt !== null && stt !== undefined) formData.append('stt', stt);

		resp = await fetch(updateUrl, {
			method: 'POST',
			headers: {
				...authHeaders,
			},
			body: formData,
		});
	} else {
		const updatePayload = { sheetId, accessToken };
		if (gid !== null && gid !== undefined) updatePayload.gid = gid;
		if (stt !== null && stt !== undefined) updatePayload.stt = stt;

		resp = await fetch(updateUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
			},
			body: JSON.stringify(updatePayload),
		});
	}

	const responseText = await resp.text();
	let responseData;
	try {
		responseData = JSON.parse(responseText);
	} catch (parseError) {
		responseData = { raw: responseText };
	}

	if (!resp.ok) {
		throw new Error(`Update failed: ${resp.status} ${resp.statusText} - ${responseText}`);
	}

	return responseData;
}
